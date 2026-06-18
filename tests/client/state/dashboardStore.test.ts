import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboardStore } from "../../../src/client/state/dashboardStore";

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
      listDashboardSessions: vi
        .fn()
        .mockResolvedValueOnce([{ name: "build", windows: 1 }])
        .mockResolvedValueOnce([{ name: "build-test", windows: 1 }]),
      renameSession: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.renameSession("build", "build-test");

    expect(api.renameSession).toHaveBeenCalledWith("build", "build-test");
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

  it("selects a pane through the api without forcing a dashboard refresh", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listDashboardSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 1, paneCount: 2 }
      ]),
      selectPane: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.selectPane("build", "%2");

    expect(api.selectPane).toHaveBeenCalledWith("build", "%2");
    expect(api.listDashboardSessions).toHaveBeenCalledTimes(1);
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
    expect(api.listPaneSessions).toHaveBeenCalledOnce();
    expect(api.listDashboardSessions).not.toHaveBeenCalled();
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
    expect(store.getState().sessions).toEqual([
      { name: "stake-codex", panes: [] }
    ]);
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
    expect(api.listPaneSessions).toHaveBeenCalledTimes(2);
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
});
