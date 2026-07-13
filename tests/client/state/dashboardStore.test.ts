import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboardStore } from "../../../src/client/state/dashboardStore";
import { SessionApiError } from "../../../src/client/api/sessionApi";

const SERVER_STATUS = {
  platform: "linux",
  cpuCount: 4,
  loadAverage: [1, 0.5, 0.25] as [number, number, number],
  loadPercent: 25,
  memoryTotalBytes: 1024,
  memoryFreeBytes: 512,
  memoryUsedPercent: 50,
  uptimeSeconds: 60,
  homeDirectory: "/home/dashboard"
};

describe("createDashboardStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads older pages with opaque cursors and deduplicates websocket overlap", async () => {
    const event = (id: string) => ({
      id,
      type: "command-sent" as const,
      sessionName: "build",
      message: id,
      createdAt: `2026-07-14T00:00:0${id}.000Z`
    });
    const listTimelineEvents = vi.fn()
      .mockResolvedValueOnce({ events: [event("3"), event("2")], nextCursor: "opaque-1" })
      .mockResolvedValueOnce({ events: [event("2"), event("1")], nextCursor: null });
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(), listSessions: vi.fn(), listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn(), listTimelineEvents
      },
      pollMs: 3000
    });

    await store.refreshTimeline();
    store.mergeTimelineEvent({ ...event("3"), message: "websocket update" });
    await store.loadOlderTimeline();

    expect(listTimelineEvents).toHaveBeenNthCalledWith(2, 8, "opaque-1");
    expect(store.getState().timelineEvents?.map(({ id }) => id)).toEqual(["3", "2", "1"]);
    expect(store.getState().timelineNextCursor).toBeNull();
  });

  it("records expired history and restarts from the latest page", async () => {
    const latest = {
      id: "9", type: "command-sent" as const, sessionName: "build",
      message: "latest", createdAt: "2026-07-14T09:00:00.000Z"
    };
    const listTimelineEvents = vi.fn()
      .mockResolvedValueOnce({ events: [latest], nextCursor: "old-cursor" })
      .mockRejectedValueOnce(new SessionApiError(
        "Failed to load timeline events", 410, "timeline_cursor_expired"
      ))
      .mockResolvedValueOnce({ events: [latest], nextCursor: null });
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(), listSessions: vi.fn(), listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn(), listTimelineEvents
      },
      pollMs: 3000
    });

    await store.refreshTimeline();
    await store.loadOlderTimeline();

    expect(listTimelineEvents).toHaveBeenNthCalledWith(3, 8);
    expect(store.getState()).toMatchObject({
      timelineEvents: [latest],
      timelineNextCursor: null,
      timelineHistoryExpired: true,
      error: "Timeline history expired; showing the latest events"
    });
  });

  it("preserves loaded history and its cursor across latest-page refreshes", async () => {
    const event = (id: string) => ({
      id, type: "command-sent" as const, sessionName: "build", message: id,
      createdAt: `2026-07-14T00:00:0${id}.000Z`
    });
    const listTimelineEvents = vi.fn()
      .mockResolvedValueOnce({ events: [event("4"), event("3")], nextCursor: "cursor-3" })
      .mockResolvedValueOnce({ events: [event("2"), event("1")], nextCursor: null })
      .mockResolvedValueOnce({ events: [event("5"), event("4")], nextCursor: "cursor-4" });
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(), listSessions: vi.fn(), listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn(), listTimelineEvents
      },
      pollMs: 3000
    });

    await store.refreshTimeline();
    await store.loadOlderTimeline();
    await store.refreshTimeline();

    expect(store.getState().timelineEvents?.map(({ id }) => id)).toEqual([
      "5", "4", "3", "2", "1"
    ]);
    expect(store.getState().timelineNextCursor).toBeNull();
  });

  it("preserves more than eight loaded records when a websocket event arrives", async () => {
    const event = (id: number) => ({
      id: String(id), type: "command-sent" as const, sessionName: "build",
      message: String(id), createdAt: `2026-07-14T00:00:${String(id).padStart(2, "0")}.000Z`
    });
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(), listSessions: vi.fn(), listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn(),
        listTimelineEvents: vi.fn()
          .mockResolvedValueOnce({ events: Array.from({ length: 8 }, (_, i) => event(12 - i)), nextCursor: "older" })
          .mockResolvedValueOnce({ events: Array.from({ length: 4 }, (_, i) => event(4 - i)), nextCursor: null })
      },
      pollMs: 3000
    });

    await store.refreshTimeline();
    await store.loadOlderTimeline();
    store.mergeTimelineEvent(event(13));

    expect(store.getState().timelineEvents).toHaveLength(13);
    expect(store.getState().timelineEvents?.at(-1)?.id).toBe("1");
  });

  it("keeps realtime records when a stale deferred older page resolves", async () => {
    let resolveOlder!: (page: { events: any[]; nextCursor: null }) => void;
    const olderPage = new Promise<{ events: any[]; nextCursor: null }>((resolve) => {
      resolveOlder = resolve;
    });
    const baseConversation = {
      id: "message-1", type: "conversation-message" as const, messageId: "message-1",
      sessionName: "build", role: "assistant" as const, contentType: "text" as const,
      summary: null, status: "streaming" as const,
      createdAt: "2026-07-14T01:00:00.000Z", updatedAt: "2026-07-14T01:00:00.000Z",
      toolName: null, parentMessageId: null
    };
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(), listSessions: vi.fn(), listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn(), listTimelineEvents: vi.fn()
          .mockResolvedValueOnce({ events: [], nextCursor: "older" })
          .mockReturnValueOnce(olderPage)
      },
      pollMs: 3000
    });
    await store.refreshTimeline();
    const pending = store.loadOlderTimeline();
    store.mergeTimelineEvent({ ...baseConversation, content: "realtime", revision: 2 });
    store.mergeTimelineEvent({
      id: "hook-1", type: "hook-event", sessionName: "build", message: "realtime hook",
      createdAt: "2026-07-14T01:01:00.000Z"
    });
    resolveOlder({
      events: [
        { ...baseConversation, content: "stale", revision: 1 },
        { id: "hook-1", type: "hook-event", sessionName: "build", message: "stale hook", createdAt: "2026-07-14T01:01:00.000Z" }
      ],
      nextCursor: null
    });
    await pending;

    expect(store.getState().timelineEvents?.find(({ id }) => id === "message-1")).toMatchObject({
      content: "realtime", revision: 2
    });
    expect(store.getState().timelineEvents?.find(({ id }) => id === "hook-1")).toMatchObject({
      message: "realtime hook"
    });
  });

  it("merges realtime timeline events by stable id in descending order", () => {
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(),
        listSessions: vi.fn(),
        listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn()
      },
      pollMs: 3000
    });

    store.mergeTimelineEvent({
      id: "message-1",
      type: "conversation-message",
      messageId: "message-1",
      sessionName: "build",
      role: "assistant",
      contentType: "text",
      content: "draft",
      summary: "draft",
      status: "streaming",
      createdAt: "2026-07-14T01:00:00.000Z",
      revision: 1,
      updatedAt: "2026-07-14T01:00:00.000Z",
      toolName: null,
      parentMessageId: null
    });
    store.mergeTimelineEvent({
      id: "hook-2",
      type: "hook-event",
      sessionName: "build",
      message: "needs attention",
      createdAt: "2026-07-14T02:00:00.000Z"
    });
    store.mergeTimelineEvent({
      id: "message-1",
      type: "conversation-message",
      messageId: "message-1",
      sessionName: "build",
      role: "assistant",
      contentType: "text",
      content: "complete",
      summary: "complete",
      status: "complete",
      createdAt: "2026-07-14T01:00:00.000Z",
      revision: 2,
      updatedAt: "2026-07-14T02:01:00.000Z",
      toolName: null,
      parentMessageId: null
    });

    expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
      "hook-2",
      "message-1"
    ]);
    expect(store.getState().timelineEvents?.[1]).toMatchObject({
      id: "message-1",
      content: "complete",
      status: "complete",
      revision: 2
    });
  });

  it("keeps the incremental timeline bounded to the authoritative fetch limit", () => {
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(),
        listSessions: vi.fn(),
        listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn()
      },
      pollMs: 3000
    });

    for (let index = 0; index < 10; index += 1) {
      store.mergeTimelineEvent({
        id: `event-${index}`,
        type: "command-sent",
        sessionName: "build",
        message: `command ${index}`,
        createdAt: `2026-07-14T00:00:${String(index).padStart(2, "0")}.000Z`
      });
    }

    expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
      "event-9", "event-8", "event-7", "event-6",
      "event-5", "event-4", "event-3", "event-2"
    ]);
  });

  it("does not let an in-flight authoritative refresh erase a newer realtime event", async () => {
    let resolveTimeline!: (events: Array<{
      id: string;
      type: "command-sent";
      sessionName: string;
      message: string;
      createdAt: string;
    }>) => void;
    const timelineResponse = new Promise<Parameters<typeof resolveTimeline>[0]>((resolve) => {
      resolveTimeline = resolve;
    });
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(),
        listSessions: vi.fn(),
        listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn(),
        listTimelineEvents: vi.fn().mockReturnValue(timelineResponse)
      },
      pollMs: 3000
    });

    const refresh = store.refreshTimeline();
    store.mergeTimelineEvent({
      id: "realtime-2",
      type: "command-sent",
      sessionName: "build",
      message: "newer realtime event",
      createdAt: "2026-07-14T02:00:00.000Z"
    });
    resolveTimeline([{
      id: "snapshot-1",
      type: "command-sent",
      sessionName: "build",
      message: "snapshot event",
      createdAt: "2026-07-14T01:00:00.000Z"
    }]);
    await refresh;

    expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
      "realtime-2",
      "snapshot-1"
    ]);
  });

  it.each([
    { websocketRevision: 2, snapshotRevision: 3, expectedRevision: 3 },
    { websocketRevision: 4, snapshotRevision: 3, expectedRevision: 4 },
    { websocketRevision: 3, snapshotRevision: 3, expectedRevision: 3 }
  ])(
    "resolves reconnect overlap by conversation revision ($websocketRevision vs $snapshotRevision)",
    async ({ websocketRevision, snapshotRevision, expectedRevision }) => {
      type ConversationEvent = {
        id: string;
        type: "conversation-message";
        messageId: string;
        sessionName: string;
        role: "assistant";
        contentType: "text";
        content: string;
        summary: string;
        status: "streaming" | "complete";
        createdAt: string;
        revision: number;
        updatedAt: string;
        toolName: null;
        parentMessageId: null;
      };
      let resolveTimeline!: (events: ConversationEvent[]) => void;
      const timelineResponse = new Promise<ConversationEvent[]>((resolve) => {
        resolveTimeline = resolve;
      });
      const store = createDashboardStore({
        api: {
          getServerStatus: vi.fn(),
          listSessions: vi.fn(),
          listPaneSessions: vi.fn(),
          listDashboardSessions: vi.fn(),
          listTimelineEvents: vi.fn().mockReturnValue(timelineResponse)
        },
        pollMs: 3000
      });
      const makeEvent = (revision: number, source: "snapshot" | "websocket"): ConversationEvent => ({
        id: "message-1",
        type: "conversation-message",
        messageId: "message-1",
        sessionName: "build",
        role: "assistant",
        contentType: "text",
        content: `${source}-${revision}`,
        summary: `${source}-${revision}`,
        status: revision >= 3 ? "complete" : "streaming",
        createdAt: "2026-07-14T01:00:00.000Z",
        revision,
        updatedAt: `2026-07-14T01:00:0${revision}.000Z`,
        toolName: null,
        parentMessageId: null
      });

      const refresh = store.refreshTimeline();
      store.mergeTimelineEvent(makeEvent(websocketRevision, "websocket"));
      resolveTimeline([makeEvent(snapshotRevision, "snapshot")]);
      await refresh;

      expect(store.getState().timelineEvents?.[0]).toMatchObject({
        revision: expectedRevision,
        content:
          websocketRevision > snapshotRevision
            ? `websocket-${websocketRevision}`
            : `snapshot-${snapshotRevision}`
      });
    }
  );

  it.each(["newer-first", "older-first"] as const)(
    "lets only the latest-started overlapping refresh commit when resolving $0",
    async (resolutionOrder) => {
      type ConversationEvent = {
        id: string;
        type: "conversation-message";
        messageId: string;
        sessionName: string;
        role: "assistant";
        contentType: "text";
        content: string;
        summary: string;
        status: "complete";
        createdAt: string;
        revision: number;
        updatedAt: string;
        toolName: null;
        parentMessageId: null;
      };
      let resolveA!: (events: ConversationEvent[]) => void;
      let resolveB!: (events: ConversationEvent[]) => void;
      const responseA = new Promise<ConversationEvent[]>((resolve) => {
        resolveA = resolve;
      });
      const responseB = new Promise<ConversationEvent[]>((resolve) => {
        resolveB = resolve;
      });
      const listTimelineEvents = vi.fn()
        .mockReturnValueOnce(responseA)
        .mockReturnValueOnce(responseB);
      const store = createDashboardStore({
        api: {
          getServerStatus: vi.fn(),
          listSessions: vi.fn(),
          listPaneSessions: vi.fn(),
          listDashboardSessions: vi.fn(),
          listTimelineEvents
        },
        pollMs: 3000
      });
      const conversation = (revision: number): ConversationEvent => ({
        id: "message-1",
        type: "conversation-message",
        messageId: "message-1",
        sessionName: "build",
        role: "assistant",
        contentType: "text",
        content: `snapshot-${revision}`,
        summary: `snapshot-${revision}`,
        status: "complete",
        createdAt: "2026-07-14T01:00:00.000Z",
        revision,
        updatedAt: `2026-07-14T01:00:0${revision}.000Z`,
        toolName: null,
        parentMessageId: null
      });

      const refreshA = store.refreshTimeline();
      store.mergeTimelineEvent({
        id: "realtime-between",
        type: "command-sent",
        sessionName: "build",
        message: "received between refresh starts",
        createdAt: "2026-07-14T02:00:00.000Z"
      });
      const refreshB = store.refreshTimeline();

      if (resolutionOrder === "newer-first") {
        resolveB([conversation(3)]);
        await refreshB;
        resolveA([conversation(2)]);
        await refreshA;
      } else {
        resolveA([conversation(2)]);
        await refreshA;
        expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
          "realtime-between"
        ]);
        resolveB([conversation(3)]);
        await refreshB;
      }

      expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
        "realtime-between",
        "message-1"
      ]);
      expect(store.getState().timelineEvents?.[1]).toMatchObject({
        revision: 3,
        content: "snapshot-3"
      });
    }
  );

  it("sorts equal timestamps by natural numeric id and keeps updates stable", () => {
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(),
        listSessions: vi.fn(),
        listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn()
      },
      pollMs: 3000
    });
    const createdAt = "2026-07-14T01:00:00.000Z";
    const merge = (id: string, message = id) => store.mergeTimelineEvent({
      id,
      type: "command-sent",
      sessionName: "build",
      message,
      createdAt
    });

    merge("2");
    merge("10");
    merge("9");
    expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
      "10", "9", "2"
    ]);

    merge("9", "updated");
    expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
      "10", "9", "2"
    ]);
  });

  it("uses deterministic string id ordering for equal timestamps", () => {
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(),
        listSessions: vi.fn(),
        listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn()
      },
      pollMs: 3000
    });

    for (const id of ["event-a", "event-c", "event-b"]) {
      store.mergeTimelineEvent({
        id,
        type: "command-sent",
        sessionName: "build",
        message: id,
        createdAt: "2026-07-14T01:00:00.000Z"
      });
    }

    expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
      "event-c", "event-b", "event-a"
    ]);
  });

  it("sorts mixed numeric and string ids consistently across insertion order", () => {
    const permutations = [
      ["2", "10", "15a"],
      ["10", "15a", "2"],
      ["15a", "2", "10"]
    ];

    for (const ids of permutations) {
      const store = createDashboardStore({
        api: {
          getServerStatus: vi.fn(),
          listSessions: vi.fn(),
          listPaneSessions: vi.fn(),
          listDashboardSessions: vi.fn()
        },
        pollMs: 3000
      });
      for (const id of ids) {
        store.mergeTimelineEvent({
          id,
          type: "command-sent",
          sessionName: "build",
          message: id,
          createdAt: "2026-07-14T01:00:00.000Z"
        });
      }

      expect(store.getState().timelineEvents?.map((event) => event.id)).toEqual([
        "10", "2", "15a"
      ]);
    }
  });

  it("ignores stale conversation revisions received after a newer revision", () => {
    const store = createDashboardStore({
      api: {
        getServerStatus: vi.fn(),
        listSessions: vi.fn(),
        listPaneSessions: vi.fn(),
        listDashboardSessions: vi.fn()
      },
      pollMs: 3000
    });
    const baseEvent = {
      id: "message-1",
      type: "conversation-message" as const,
      messageId: "message-1",
      sessionName: "build",
      role: "assistant" as const,
      contentType: "text" as const,
      summary: "complete",
      createdAt: "2026-07-14T01:00:00.000Z",
      updatedAt: "2026-07-14T02:00:00.000Z",
      toolName: null,
      parentMessageId: null
    };

    store.mergeTimelineEvent({
      ...baseEvent,
      content: "complete",
      status: "complete",
      revision: 2
    });
    store.mergeTimelineEvent({
      ...baseEvent,
      content: "draft",
      status: "streaming",
      revision: 1
    });

    expect(store.getState().timelineEvents?.[0]).toMatchObject({
      content: "complete",
      status: "complete",
      revision: 2
    });
  });

  it("hydrates sessions from a cached session list before any network refresh", () => {
    const api = {
      getServerStatus: vi.fn(),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    };
    const sessionListCache = {
      read: vi.fn().mockReturnValue([
        {
          name: "cached",
          windows: 1,
          status: "detached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "zsh",
          currentPath: "/tmp/cached",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        }
      ]),
      write: vi.fn()
    };

    const store = createDashboardStore({
      api,
      pollMs: 3000,
      sessionListCache: sessionListCache as never
    } as never);

    expect(store.getState().sessions.map((session) => session.name)).toEqual([
      "cached"
    ]);
  });

  it("can refresh the lightweight session list without requesting server status", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn().mockResolvedValue([
        {
          name: "build",
          windows: 2,
          status: "detached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "zsh",
          currentPath: "/tmp/build",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        }
      ]),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    };
    const sessionListCache = {
      read: vi.fn().mockReturnValue([]),
      write: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      sessionListCache: sessionListCache as never
    } as never);

    await (store as unknown as { refreshSessionList: () => Promise<void> }).refreshSessionList();

    expect(api.listSessions).toHaveBeenCalledTimes(1);
    expect(api.getServerStatus).not.toHaveBeenCalled();
    expect(sessionListCache.write).toHaveBeenCalledWith([
      expect.objectContaining({ name: "build" })
    ]);
    expect(store.getState().sessions.map((session) => session.name)).toEqual([
      "build"
    ]);
  });

  it("loads sessions from the api and exposes them to the renderer", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 2, status: "detached" }
      ])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();

    expect(store.getState().sessions).toEqual([
      { name: "build", windows: 2, status: "detached" }
    ]);
    expect(api.listDashboardSessions).toHaveBeenCalled();
  });

  it("uses lightweight sessions when previews are disabled", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 2, status: "detached" }
      ]),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh({ includePreview: false });

    expect(api.listSessions).toHaveBeenCalled();
    expect(api.listPaneSessions).not.toHaveBeenCalled();
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
    expect(store.getState().sessions).toEqual([
      { name: "build", windows: 2, status: "detached" }
    ]);
  });

  it("uses pane-aware sessions when previews are disabled but panes are needed", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 2, status: "detached", panes: [] }
      ]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh({ includePreview: false, includePanes: true });

    expect(api.listPaneSessions).toHaveBeenCalled();
    expect(api.listSessions).not.toHaveBeenCalled();
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
  });

  it("passes muted sessions into pane-aware refreshes", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 2, status: "detached", panes: [] }
      ]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      getMutedSessionNames: () => ["tmux-ui", "logs"]
    });

    await store.refresh({ includePreview: false, includePanes: true });

    expect(api.listPaneSessions).toHaveBeenCalledWith(["tmux-ui", "logs"]);
  });

  it("can force full pane-aware session lists even when an active session exists", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      getSessionStatus: vi.fn().mockResolvedValue({ name: "build" }),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 1, status: "attached", panes: [] },
        { name: "logs", windows: 1, status: "detached", panes: [] }
      ]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      getActiveSessionName: () => "build",
      preferActiveSessionStatus: false
    });

    await store.refresh({ includePreview: false, includePanes: true });

    expect(api.getSessionStatus).not.toHaveBeenCalled();
    expect(api.listPaneSessions).toHaveBeenCalledOnce();
    expect(store.getState().sessions.map((session) => session.name)).toEqual([
      "build",
      "logs"
    ]);
  });

  it("can force a full pane-aware refresh for one call while active-session polling is enabled", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      getSessionStatus: vi.fn().mockResolvedValue({ name: "build" }),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 1, status: "attached", panes: [] },
        { name: "logs", windows: 1, status: "detached", panes: [] }
      ]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      getActiveSessionName: () => "build",
      preferActiveSessionStatus: true
    });

    await store.refresh({
      includePreview: false,
      includePanes: true,
      preferActiveSessionStatus: false
    });

    expect(api.getSessionStatus).not.toHaveBeenCalled();
    expect(api.listPaneSessions).toHaveBeenCalledOnce();
    expect(store.getState().sessions.map((session) => session.name)).toEqual([
      "build",
      "logs"
    ]);
  });

  it("does not notify subscribers when a refresh returns unchanged sessions", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 2, status: "detached" }
      ])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });
    const listener = vi.fn();

    store.subscribe(listener);

    await store.refresh();

    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();

    await store.refresh();

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers when a session attached status changes", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi
        .fn()
        .mockResolvedValueOnce([{ name: "build", windows: 2, status: "detached" }])
        .mockResolvedValueOnce([{ name: "build", windows: 2, status: "attached" }])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });
    const listener = vi.fn();

    store.subscribe(listener);

    await store.refresh();
    listener.mockClear();
    await store.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().sessions).toEqual([
      { name: "build", windows: 2, status: "attached" }
    ]);
  });

  it("renames a session through the api and refreshes session state", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi
        .fn()
        .mockResolvedValue([{ name: "build-test", windows: 1 }]),
      renameSession: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.renameSession("build", "build-test");

    expect(api.renameSession).toHaveBeenCalledWith("build", "build-test");
    expect(api.listSessions).toHaveBeenCalledTimes(1);
    expect(store.getState().sessions).toEqual([
      { name: "build-test", windows: 1 }
    ]);
  });

  it("sends a command through the api without forcing a dashboard refresh", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 1, status: "attached" }
      ]),
      listTimelineEvents: vi.fn().mockResolvedValue([
        {
          id: "evt-1",
          type: "command-sent",
          sessionName: "build",
          message: "sent command: npm test",
          createdAt: "2026-05-24T03:00:00.000Z"
        }
      ]),
      sendCommand: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.sendCommand("build", "npm test");

    expect(api.sendCommand).toHaveBeenCalledWith("build", "npm test");
    expect(api.listDashboardSessions).toHaveBeenCalledTimes(1);
    expect(api.listTimelineEvents).toHaveBeenCalledWith(8);
    expect(store.getState().timelineEvents).toEqual([
      {
        id: "evt-1",
        type: "command-sent",
        sessionName: "build",
        message: "sent command: npm test",
        createdAt: "2026-05-24T03:00:00.000Z"
      }
    ]);
  });

  it("splits a pane through the api and refreshes session state", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi
        .fn()
        .mockResolvedValueOnce([{ name: "build", windows: 1, paneCount: 1 }])
        .mockResolvedValueOnce([{ name: "build", windows: 1, paneCount: 2 }]),
      splitPane: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.splitPane("build", "horizontal");

    expect(api.splitPane).toHaveBeenCalledWith("build", "horizontal");
    expect(store.getState().sessions).toEqual([
      { name: "build", windows: 1, paneCount: 2 }
    ]);
  });

  it("selects a pane through the api and refreshes pane state", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 1, paneCount: 2 }
      ]),
      listPaneSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 1, paneCount: 2, panes: [{ paneId: "%2" }] }
      ]),
      selectPane: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.selectPane("build", "%2");

    expect(api.selectPane).toHaveBeenCalledWith("build", "%2");
    expect(api.listDashboardSessions).toHaveBeenCalledTimes(1);
    expect(api.listPaneSessions).toHaveBeenCalledTimes(1);
  });

  it("kills a pane through the api and refreshes pane state", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi
        .fn()
        .mockResolvedValueOnce([{ name: "build", windows: 1, paneCount: 2 }])
        .mockResolvedValueOnce([{ name: "build", windows: 1, paneCount: 1 }]),
      killPane: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.killPane("build", "%2");

    expect(api.killPane).toHaveBeenCalledWith("build", "%2");
    expect(store.getState().sessions).toEqual([
      { name: "build", windows: 1, paneCount: 1 }
    ]);
  });

  it("skips lightweight list polling when no terminal tab is active", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn().mockResolvedValue([{ name: "build" }]),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn().mockResolvedValue([{ name: "build" }])
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      shouldIncludePreview: () => false
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(3000);

    expect(api.listSessions).not.toHaveBeenCalled();
    expect(api.listPaneSessions).not.toHaveBeenCalled();
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
  });

  it("uses active session status while polling active tabs", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      getSessionStatus: vi.fn().mockResolvedValue({
        name: "build",
        windows: 1,
        status: "attached",
        panes: []
      }),
      listSessions: vi.fn().mockResolvedValue([{ name: "build" }]),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn().mockResolvedValue([{ name: "build" }])
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      shouldIncludePreview: () => false,
      shouldIncludePanes: () => true,
      getActiveSessionName: () => "build"
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(3000);

    expect(api.getSessionStatus).toHaveBeenCalledWith("build");
    expect(api.getServerStatus).not.toHaveBeenCalled();
    expect(api.listPaneSessions).not.toHaveBeenCalled();
    expect(api.listSessions).not.toHaveBeenCalled();
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
  });

  it("skips active session polling while the terminal is receiving output", async () => {
    vi.useFakeTimers();
    let busy = true;
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      getSessionStatus: vi.fn().mockResolvedValue({
        name: "build",
        windows: 1,
        status: "attached",
        panes: []
      }),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      getActiveSessionName: () => "build",
      isActiveSessionBusy: () => busy
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(3000);

    expect(api.getSessionStatus).not.toHaveBeenCalled();

    busy = false;
    await vi.advanceTimersByTimeAsync(3000);

    expect(api.getSessionStatus).toHaveBeenCalledWith("build");
  });

  it("throttles dashboard sessions and server status polling independently", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn().mockResolvedValue([{ name: "build" }]),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn().mockResolvedValue([{ name: "build" }])
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      dashboardPollMs: 30000,
      serverStatusPollMs: 60000,
      shouldIncludePreview: () => true,
      shouldIncludePanes: () => false
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(29000);

    expect(api.listDashboardSessions).not.toHaveBeenCalled();
    expect(api.getServerStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(api.listDashboardSessions).toHaveBeenCalledOnce();
    expect(api.getServerStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30000);

    expect(api.listDashboardSessions).toHaveBeenCalledTimes(2);
    expect(api.getServerStatus).toHaveBeenCalledOnce();
  });

  it("allows background polling to use lightweight sidebar refresh options", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      dashboardPollMs: 30000,
      shouldIncludePreview: () => false,
      getDashboardPollOptions: () => ({
        includePreview: false,
        includePanes: true,
        includeServerStatus: false
      })
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(30000);

    expect(api.listPaneSessions).toHaveBeenCalledOnce();
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
    expect(api.getServerStatus).not.toHaveBeenCalled();
  });

  it("uses active-session polling for the fast interval and full sidebar polling for the slower interval", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      getSessionStatus: vi.fn().mockResolvedValue({
        name: "build",
        windows: 1,
        status: "attached",
        panes: []
      }),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn().mockResolvedValue([
        { name: "build", panes: [] },
        { name: "logs", panes: [] }
      ]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      dashboardPollMs: 30000,
      shouldIncludePreview: () => false,
      getActiveSessionName: () => "build",
      preferActiveSessionStatus: true,
      getDashboardPollOptions: () => ({
        includePreview: false,
        includePanes: true,
        includeServerStatus: false,
        preferActiveSessionStatus: false
      })
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(3000);

    expect(api.getSessionStatus).toHaveBeenCalledOnce();
    expect(api.listPaneSessions).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(27000);

    expect(api.getSessionStatus).toHaveBeenCalledTimes(10);
    expect(api.listPaneSessions).toHaveBeenCalledOnce();
    expect(api.getServerStatus).not.toHaveBeenCalled();
  });

  it("does not request server status during sidebar active-session polling", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      getSessionStatus: vi.fn(),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      getActiveSessionName: () => "build",
      preferActiveSessionStatus: false
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(3000);

    expect(api.listPaneSessions).toHaveBeenCalledOnce();
    expect(api.getServerStatus).not.toHaveBeenCalled();
  });

  it("uses slower default dashboard and server status polling intervals", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn().mockResolvedValue([{ name: "build" }]),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn().mockResolvedValue([{ name: "build" }])
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      shouldIncludePreview: () => true,
      shouldIncludePanes: () => false
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(30000);

    expect(api.listDashboardSessions).toHaveBeenCalledOnce();
    expect(api.getServerStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30000);

    expect(api.listDashboardSessions).toHaveBeenCalledTimes(2);
    expect(api.getServerStatus).toHaveBeenCalledOnce();
  });

  it("polls kanban projects on a separate low-frequency interval", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn(),
      listKanbanProjects: vi.fn().mockResolvedValue([
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: [{ kind: "codex", name: "codex", command: null }]
        }
      ])
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      shouldIncludePreview: () => false
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(299_999);

    expect(api.listKanbanProjects).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(api.listKanbanProjects).toHaveBeenCalledOnce();
    expect(store.getState().kanbanProjects).toEqual([
      {
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: null,
        agents: [{ kind: "codex", name: "codex", command: null }]
      }
    ]);
  });

  it("polls only the active session status without server status when a terminal tab is active", async () => {
    vi.useFakeTimers();
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      getSessionStatus: vi.fn().mockResolvedValue({
        name: "build",
        windows: 1,
        status: "attached",
        panes: [{ paneId: "%1" }]
      }),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({
      api,
      pollMs: 3000,
      getActiveSessionName: () => "build"
    });

    store.startPolling();
    await vi.advanceTimersByTimeAsync(3000);

    expect(api.getSessionStatus).toHaveBeenCalledWith("build");
    expect(api.getServerStatus).not.toHaveBeenCalled();
    expect(api.listSessions).not.toHaveBeenCalled();
    expect(api.listPaneSessions).not.toHaveBeenCalled();
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
    expect(store.getState().sessions).toEqual([
      {
        name: "build",
        windows: 1,
        status: "attached",
        panes: [{ paneId: "%1" }]
      }
    ]);
  });

  it("manually refreshes only muted session heavy fields", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn().mockResolvedValue([
        { name: "tmux-ui", preview: "service log", inputPrompt: null }
      ])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refreshMuted(["tmux-ui"]);

    expect(api.listDashboardSessions).toHaveBeenCalledWith(["tmux-ui"]);
    expect(api.listPaneSessions).not.toHaveBeenCalled();
    expect(store.getState().sessions).toEqual([
      { name: "tmux-ui", preview: "service log", inputPrompt: null }
    ]);
  });

  it("loads and creates kanban projects without forcing preview polling", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listKanbanProjects: vi.fn().mockResolvedValueOnce([
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: "tw1",
          agents: [{ kind: "claude", name: "claude", command: null }]
        }
      ]).mockResolvedValueOnce([
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: "tw1",
          agents: [{ kind: "claude", name: "claude", command: null }]
        },
        {
          name: "stake",
          path: "/srv/stake",
          server: null,
          agents: [{ kind: "codex", name: "codex", command: null }]
        }
      ]),
      createKanbanProject: vi.fn().mockResolvedValue(["stake-codex"]),
      listPaneSessions: vi.fn().mockResolvedValue([
        { name: "stake-codex", panes: [] }
      ]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refreshKanbanProjects();
    await store.createKanbanProject({
      name: "stake",
      path: "/srv/stake",
      server: null,
      selectedAgentNames: ["codex"]
    });

    expect(api.listKanbanProjects).toHaveBeenCalledTimes(2);
    expect(api.createKanbanProject).toHaveBeenCalledWith({
      name: "stake",
      path: "/srv/stake",
      server: null,
      selectedAgentNames: ["codex"]
    });
    expect(store.getState().kanbanProjects).toEqual([
      {
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: "tw1",
        agents: [{ kind: "claude", name: "claude", command: null }]
      },
      {
        name: "stake",
        path: "/srv/stake",
        server: null,
        agents: [{ kind: "codex", name: "codex", command: null }]
      }
    ]);
    expect(store.getState().sessions).toEqual([]);
  });

  it("refreshes kanban projects and sessions after kanban removals", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listKanbanProjects: vi.fn().mockResolvedValue([
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: [{ kind: "pm", name: "pm", command: null }]
        }
      ]),
      removeKanbanSession: vi.fn().mockResolvedValue(undefined),
      deleteKanbanProject: vi.fn().mockResolvedValue(undefined),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.removeKanbanSession("xxvisa", "codex", { kill: false });
    await store.deleteKanbanProject("xxvisa");

    expect(api.removeKanbanSession).toHaveBeenCalledWith("xxvisa", "codex", {
      kill: false
    });
    expect(api.deleteKanbanProject).toHaveBeenCalledWith("xxvisa");
    expect(api.listKanbanProjects).toHaveBeenCalledTimes(2);
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
    expect(store.getState().kanbanProjects).toEqual([
      {
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: null,
        agents: [{ kind: "pm", name: "pm", command: null }]
      }
    ]);
  });

  it("refreshes kanban projects and sessions after adding an existing session", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listKanbanProjects: vi.fn().mockResolvedValue([
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: [
            {
              kind: "session",
              name: "local-ssh",
              command: null,
              sessionName: "local-ssh"
            }
          ]
        }
      ]),
      addKanbanSession: vi.fn().mockResolvedValue(undefined),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "local-ssh", panes: [] }]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.addKanbanSession("xxvisa", "local-ssh");

    expect(api.addKanbanSession).toHaveBeenCalledWith("xxvisa", "local-ssh");
    expect(api.listKanbanProjects).toHaveBeenCalledOnce();
    expect(store.getState().kanbanProjects[0]?.agents[0]).toEqual({
      kind: "session",
      name: "local-ssh",
      command: null,
      sessionName: "local-ssh"
    });
  });

  it("refreshes kanban projects after renaming a grouped session", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      renameSession: vi.fn().mockResolvedValue(undefined),
      listSessions: vi.fn().mockResolvedValue([
        { name: "cc1-remote", windows: 1, status: "detached" }
      ]),
      listKanbanProjects: vi.fn().mockResolvedValue([
        {
          name: "cc",
          path: "~",
          server: null,
          agents: [
            {
              kind: "session",
              name: "cc1-remote",
              command: null,
              sessionName: "cc1-remote"
            }
          ]
        }
      ]),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.renameSession("cc1-local", "cc1-remote");

    expect(api.renameSession).toHaveBeenCalledWith("cc1-local", "cc1-remote");
    expect(api.listSessions).toHaveBeenCalledOnce();
    expect(api.listKanbanProjects).toHaveBeenCalledOnce();
    expect(store.getState().kanbanProjects[0]?.agents[0]).toEqual({
      kind: "session",
      name: "cc1-remote",
      command: null,
      sessionName: "cc1-remote"
    });
  });

  it("manually syncs live sessions and kanban projects for group status", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listPaneSessions: vi.fn().mockResolvedValue([
        {
          name: "cc1-local",
          windows: 1,
          status: "detached",
          panes: []
        }
      ]),
      listKanbanProjects: vi.fn().mockResolvedValue([
        {
          name: "cc",
          path: "~",
          server: null,
          agents: [
            {
              kind: "session",
              name: "cc1-local",
              command: null,
              sessionName: "cc1-local"
            }
          ]
        }
      ]),
      listSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await (
      store as unknown as { syncSessionAndKanbanState: () => Promise<void> }
    ).syncSessionAndKanbanState();

    expect(api.listPaneSessions).toHaveBeenCalledOnce();
    expect(api.getServerStatus).toHaveBeenCalledOnce();
    expect(api.listKanbanProjects).toHaveBeenCalledOnce();
    expect(store.getState().sessions).toEqual([
      {
        name: "cc1-local",
        windows: 1,
        status: "detached",
        panes: []
      }
    ]);
    expect(store.getState().kanbanProjects[0]?.name).toBe("cc");
  });

  it("moves a kanban session by removing it from the current project before adding it to the target project", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listKanbanProjects: vi.fn().mockResolvedValue([
        {
          name: "stake",
          path: "/srv/stake",
          server: null,
          agents: [
            { kind: "session", name: "build", command: null, sessionName: "build" }
          ]
        },
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: []
        }
      ]),
      addKanbanSession: vi.fn().mockResolvedValue(undefined),
      removeKanbanSession: vi.fn().mockResolvedValue(undefined),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.moveKanbanSession("stake", "xxvisa", "build");

    expect(api.removeKanbanSession).toHaveBeenCalledWith("stake", "build", {
      kill: false
    });
    expect(api.addKanbanSession).toHaveBeenCalledWith("xxvisa", "build");
    expect(api.listKanbanProjects).toHaveBeenCalledTimes(1);
  });

  it("moves a kanban session to ungrouped by only removing it from the current project", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listKanbanProjects: vi.fn().mockResolvedValue([
        {
          name: "stake",
          path: "/srv/stake",
          server: null,
          agents: [
            { kind: "session", name: "build", command: null, sessionName: "build" }
          ]
        }
      ]),
      addKanbanSession: vi.fn().mockResolvedValue(undefined),
      removeKanbanSession: vi.fn().mockResolvedValue(undefined),
      listPaneSessions: vi.fn().mockResolvedValue([{ name: "build", panes: [] }]),
      listDashboardSessions: vi.fn()
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.moveKanbanSession("stake", "ungrouped", "build");

    expect(api.removeKanbanSession).toHaveBeenCalledWith("stake", "build", {
      kill: false
    });
    expect(api.addKanbanSession).not.toHaveBeenCalled();
    expect(api.listKanbanProjects).toHaveBeenCalledTimes(1);
  });
});
