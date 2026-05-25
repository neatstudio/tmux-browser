import { describe, expect, it, vi } from "vitest";

import { createAppEventSocket } from "../../../src/client/events/appEventSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readonly OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  listeners = new Map<string, Array<(event?: MessageEvent<string> | Event) => void>>();
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event?: MessageEvent<string> | Event) => void
  ) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  emitMessage(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent<string>;
    this.listeners.get("message")?.forEach((listener) => listener(event));
  }

  emitRawMessage(data: unknown) {
    const event = { data } as MessageEvent<string>;
    this.listeners.get("message")?.forEach((listener) => listener(event));
  }

  emitClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.listeners.get("close")?.forEach((listener) => listener(new Event("close")));
  }
}

describe("createAppEventSocket", () => {
  it("connects to /ws/events and forwards non-hello events", () => {
    FakeWebSocket.instances = [];
    const onEvent = vi.fn();
    const socket = createAppEventSocket({
      WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      location: { protocol: "http:", host: "127.0.0.1:3000" },
      onEvent
    });

    socket.connect();
    FakeWebSocket.instances[0]?.emitMessage({ type: "hello" });
    FakeWebSocket.instances[0]?.emitMessage({
      type: "sessions-invalidated",
      reason: "pane-split",
      sessionName: "build",
      id: "evt-1",
      createdAt: "2026-05-25T00:00:00.000Z"
    });

    expect(FakeWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:3000/ws/events");
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sessions-invalidated",
        reason: "pane-split",
        sessionName: "build"
      })
    );
  });

  it("reconnects after a close while enabled", () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    const socket = createAppEventSocket({
      WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      location: { protocol: "https:", host: "tmux.local" },
      onEvent: vi.fn(),
      reconnectMs: 250
    });

    socket.connect();
    FakeWebSocket.instances[0]?.emitClose();
    vi.advanceTimersByTime(249);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toBe("wss://tmux.local/ws/events");

    socket.close();
    vi.useRealTimers();
  });

  it("ignores malformed messages without disconnecting", () => {
    FakeWebSocket.instances = [];
    const onEvent = vi.fn();
    const socket = createAppEventSocket({
      WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      location: { protocol: "http:", host: "127.0.0.1:3000" },
      onEvent
    });

    socket.connect();
    expect(() => FakeWebSocket.instances[0]?.emitRawMessage("{")).not.toThrow();
    FakeWebSocket.instances[0]?.emitMessage({
      type: "sessions-invalidated",
      reason: "session-created",
      sessionName: "build",
      id: "evt-1",
      createdAt: "2026-05-25T00:00:00.000Z"
    });

    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("does not let stale sockets reconnect after connect is called again", () => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    const socket = createAppEventSocket({
      WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      location: { protocol: "http:", host: "127.0.0.1:3000" },
      onEvent: vi.fn(),
      reconnectMs: 250
    });

    socket.connect();
    const staleSocket = FakeWebSocket.instances[0];
    socket.connect();
    staleSocket?.emitClose();
    vi.advanceTimersByTime(250);

    expect(FakeWebSocket.instances).toHaveLength(2);

    socket.close();
    vi.useRealTimers();
  });
});
