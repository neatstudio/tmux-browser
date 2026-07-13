// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDashboardStore } from "../../src/client/state/dashboardStore";
import type { TimelineEvent } from "../../src/shared/timeline";

function conversation(revision: number): TimelineEvent {
  return {
    id: "canonical-message",
    type: "conversation-message",
    messageId: "message-1",
    sessionName: "codex",
    role: "assistant",
    contentType: "text",
    content: `revision ${revision}`,
    summary: `revision ${revision}`,
    status: "streaming",
    createdAt: "2026-07-14T08:00:00.000Z",
    revision,
    updatedAt: `2026-07-14T08:00:${String(revision % 60).padStart(2, "0")}.000Z`,
    toolName: null,
    parentMessageId: null
  };
}

function attention(): TimelineEvent {
  return {
    id: "attention-1",
    type: "hook-event",
    eventType: "approval-required",
    sessionName: "codex",
    status: "waiting",
    summary: "Approval needed",
    createdAt: "2026-07-14T08:00:31.000Z"
  };
}

function createStore() {
  return createDashboardStore({
    api: {
      getServerStatus: vi.fn(),
      listSessions: vi.fn(),
      listPaneSessions: vi.fn(),
      listDashboardSessions: vi.fn()
    },
    pollMs: 3_000
  });
}

describe("structured activity performance", () => {
  afterEach(() => vi.useRealTimers());

  it("batches 300 streaming revisions while retaining one canonical state item", () => {
    vi.useFakeTimers();
    const store = createStore();
    const renders = vi.fn();
    store.subscribe(renders);

    for (let revision = 1; revision <= 300; revision += 1) {
      store.mergeTimelineEvent(conversation(revision));
      vi.advanceTimersByTime(100);
    }
    vi.runOnlyPendingTimers();

    expect(store.getState().timelineEvents).toHaveLength(1);
    expect(store.getState().timelineEvents?.[0]).toMatchObject({
      id: "canonical-message",
      revision: 300
    });
    expect(renders.mock.calls.length).toBeLessThanOrEqual(150);
  });

  it("notifies attention immediately without waiting for a streaming batch", () => {
    vi.useFakeTimers();
    const store = createStore();
    const observed: string[][] = [];
    store.subscribe((state) => observed.push((state.timelineEvents ?? []).map(({ id }) => id)));

    store.mergeTimelineEvent(conversation(1));
    expect(observed).toEqual([]);
    store.mergeTimelineEvent(attention());

    expect(observed).toHaveLength(1);
    expect(observed[0]).toEqual(["attention-1", "canonical-message"]);
  });
});
