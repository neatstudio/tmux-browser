import { afterEach, describe, expect, it, vi } from "vitest";

import { createSocketBackpressure } from "../../../src/server/ws/socketBackpressure";

function createSocket(bufferedAmount = 0) {
  return {
    bufferedAmount,
    send: vi.fn(),
    close: vi.fn()
  };
}

describe("socketBackpressure", () => {
  afterEach(() => vi.useRealTimers());

  it("sends below the high watermark and pauses above it", () => {
    vi.useFakeTimers();
    const socket = createSocket();
    const delivery = createSocketBackpressure(socket);

    delivery.enqueue("ready");
    socket.bufferedAmount = 512 * 1024 + 1;
    delivery.enqueue("paused");

    expect(socket.send).toHaveBeenCalledWith("ready");
    expect(socket.send).not.toHaveBeenCalledWith("paused");
    socket.bufferedAmount = 128 * 1024;
    vi.advanceTimersByTime(16);
    expect(socket.send).toHaveBeenCalledWith("paused");
  });

  it("closes a hard-limit slow consumer with code 1013", () => {
    const socket = createSocket(900 * 1024);
    const delivery = createSocketBackpressure(socket);

    delivery.enqueue("x".repeat(200 * 1024));

    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledWith(1013, "Client too slow");
  });

  it("cancels retry timers and pending payloads", () => {
    vi.useFakeTimers();
    const socket = createSocket(600 * 1024);
    const delivery = createSocketBackpressure(socket);
    delivery.enqueue("pending");

    delivery.cancel();
    socket.bufferedAmount = 0;
    vi.runAllTimers();

    expect(socket.send).not.toHaveBeenCalled();
  });

  it("flushes normal final payloads under hard limit", () => {
    const socket = createSocket(600 * 1024);
    const delivery = createSocketBackpressure(socket);
    delivery.enqueue("pending");
    delivery.enqueue("exit");

    expect(delivery.flushFinal()).toBe(true);
    expect(socket.send.mock.calls.map(([payload]) => payload)).toEqual([
      "pending",
      "exit"
    ]);
  });
});
