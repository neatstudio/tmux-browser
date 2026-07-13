import { describe, expect, it, vi } from "vitest";

import { createAppEventRefreshScheduler } from "../../../src/client/events/appEventRefreshScheduler";
import {
  createAppEventTimelineHandler,
  createUnifiedPanelState
} from "../../../src/client/events/appEventRefreshScheduler";

describe("createAppEventRefreshScheduler", () => {
  it("coalesces app event refreshes into one callback", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createAppEventRefreshScheduler(refresh, { delayMs: 50 });

    scheduler.schedule();
    scheduler.schedule();
    vi.advanceTimersByTime(49);

    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(refresh).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe("createAppEventTimelineHandler", () => {
  it("merges structured events directly without a full timeline refresh", () => {
    const mergeTimelineEvent = vi.fn();
    const refreshTimeline = vi.fn();
    const scheduleSessionsRefresh = vi.fn();
    const handler = createAppEventTimelineHandler({
      mergeTimelineEvent,
      refreshTimeline,
      scheduleSessionsRefresh
    });
    const event = {
      id: "message-1",
      type: "conversation-message" as const,
      messageId: "message-1",
      sessionName: "build",
      role: "assistant" as const,
      contentType: "text" as const,
      content: "draft",
      summary: "draft",
      status: "streaming" as const,
      createdAt: "2026-07-14T01:00:00.000Z",
      revision: 1,
      updatedAt: "2026-07-14T01:00:00.000Z",
      toolName: null,
      parentMessageId: null
    };

    handler.onEvent(event);

    expect(mergeTimelineEvent).toHaveBeenCalledWith(event);
    expect(refreshTimeline).not.toHaveBeenCalled();
    expect(scheduleSessionsRefresh).not.toHaveBeenCalled();
  });

  it("uses an authoritative timeline refresh after reconnect", () => {
    const refreshTimeline = vi.fn();
    const handler = createAppEventTimelineHandler({
      mergeTimelineEvent: vi.fn(),
      refreshTimeline,
      scheduleSessionsRefresh: vi.fn()
    });

    handler.onReconnect();

    expect(refreshTimeline).toHaveBeenCalledOnce();
  });
});

describe("createUnifiedPanelState", () => {
  it("preserves surviving expanded ids and prunes missing ids on refresh", () => {
    const panel = createUnifiedPanelState();
    panel.toggleExpanded("event-1");
    panel.toggleExpanded("event-2");

    panel.reconcileTimeline(["event-2", "event-3"]);

    expect(panel.getState().expandedIds).toEqual(new Set(["event-2"]));
  });

  it("opens user entry on Activity and attention detail on the selected event", () => {
    const panel = createUnifiedPanelState();

    panel.openActivity();
    expect(panel.getState()).toMatchObject({
      activeTab: "activity",
      selectedEventId: null
    });

    panel.openAttention("hook-7");
    expect(panel.getState()).toMatchObject({
      activeTab: "attention",
      selectedEventId: "hook-7"
    });
  });
});
