import { describe, expect, it } from "vitest";

import { createAppEventHub } from "../../../../src/server/services/events/createAppEventHub";

describe("createAppEventHub", () => {
  it("broadcasts app events to subscribers", () => {
    const hub = createAppEventHub();
    const received: unknown[] = [];

    const unsubscribe = hub.subscribe((event) => {
      received.push(event);
    });

    const event = hub.publish({
      type: "sessions-invalidated",
      reason: "session-created",
      sessionName: "build"
    });

    expect(received).toEqual([event]);
    expect(event).toMatchObject({
      type: "sessions-invalidated",
      reason: "session-created",
      sessionName: "build"
    });
    expect(event.id).toMatch(/^evt-/);
    expect(new Date(event.createdAt).toString()).not.toBe("Invalid Date");

    unsubscribe();
    hub.publish({
      type: "sessions-invalidated",
      reason: "session-killed",
      sessionName: "build"
    });

    expect(received).toHaveLength(1);
  });

  it("preserves canonical identity and timestamps supplied by timeline records", () => {
    const hub = createAppEventHub();
    const canonical = {
      type: "conversation-message" as const,
      messageId: "message-1",
      sessionName: "build",
      role: "assistant" as const,
      contentType: "text" as const,
      content: "done",
      summary: "Build complete",
      status: "complete" as const,
      toolName: null,
      parentMessageId: null,
      revision: 2,
      id: "17",
      createdAt: "2026-07-13T01:00:00.000Z",
      updatedAt: "2026-07-13T01:00:01.000Z"
    };

    expect(hub.publish(canonical)).toEqual(canonical);
  });
});
