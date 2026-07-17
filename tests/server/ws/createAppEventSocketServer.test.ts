import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppEventHub } from "../../../src/server/services/events/createAppEventHub";
import { createAppEventSocketServer } from "../../../src/server/ws/createAppEventSocketServer";

describe("createAppEventSocketServer", () => {
  afterEach(() => vi.useRealTimers());
  it("sends hello and forwards published app events", () => {
    const eventHub = createAppEventHub();
    const server = createAppEventSocketServer({ eventHub });
    const socket = server.testOnly.open();

    const event = eventHub.publish({
      type: "sessions-invalidated",
      reason: "pane-split",
      sessionName: "build"
    });

    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: "hello" },
      event
    ]);
  });

  it("stops forwarding events after the socket closes", () => {
    const eventHub = createAppEventHub();
    const server = createAppEventSocketServer({ eventHub });
    const socket = server.testOnly.open();

    socket.close();
    eventHub.publish({
      type: "sessions-invalidated",
      reason: "session-killed",
      sessionName: "build"
    });

    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: "hello" }
    ]);
  });

  it("disables websocket compression for lightweight event frames", () => {
    const eventHub = createAppEventHub();
    const server = createAppEventSocketServer({ eventHub });

    expect(server.testOnly.options).toMatchObject({
      path: "/ws/events",
      perMessageDeflate: false
    });
  });

  it("subscribes once and serializes each event once for every socket", () => {
    let listener: ((event: Parameters<ReturnType<typeof createAppEventHub>["publish"]>[0]) => void) | null = null;
    const subscribe = vi.fn((nextListener) => {
      listener = nextListener;
      return vi.fn();
    });
    const serializeEvent = vi.fn((event) => JSON.stringify(event));
    const server = createAppEventSocketServer({
      eventHub: { publish: vi.fn() as never, subscribe } as never,
      serializeEvent
    });
    const first = server.testOnly.open();
    const second = server.testOnly.open();
    const event = {
      id: "evt-1",
      createdAt: "2026-07-17T00:00:00.000Z",
      type: "sessions-invalidated" as const,
      reason: "pane-split" as const,
      sessionName: "build"
    };

    (listener as ((event: typeof event) => void) | null)?.(event);

    expect(subscribe).toHaveBeenCalledOnce();
    expect(serializeEvent).toHaveBeenCalledOnce();
    expect(first.sent.at(-1)).toBe(JSON.stringify(event));
    expect(second.sent.at(-1)).toBe(JSON.stringify(event));
  });

  it("resumes a paused event socket only below the low watermark", () => {
    vi.useFakeTimers();
    const eventHub = createAppEventHub();
    const server = createAppEventSocketServer({ eventHub });
    const socket = server.testOnly.open();
    socket.sent.length = 0;
    socket.setBufferedAmount(600 * 1024);

    const event = eventHub.publish({
      type: "sessions-invalidated",
      reason: "pane-split",
      sessionName: "build"
    });
    expect(socket.sent).toEqual([]);
    socket.setBufferedAmount(128 * 1024);
    vi.advanceTimersByTime(16);

    expect(socket.sent).toEqual([JSON.stringify(event)]);
  });
});
