import { afterEach, describe, expect, it, vi } from "vitest";

import { createBridgeRegistry } from "../../../src/server/services/terminal/bridgeRegistry";
import { createTerminalSocketServer } from "../../../src/server/ws/createTerminalSocketServer";

describe("createTerminalSocketServer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("kills only the attach client when the socket closes", () => {
    let killCount = 0;
    const pty = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      scroll: vi.fn(),
      clearHistory: vi.fn(),
      kill: () => {
        killCount += 1;
      }
    };
    const createBridge = vi.fn().mockReturnValue(pty);

    const server = createTerminalSocketServer({
      createBridge,
      registry: createBridgeRegistry()
    });

    const socket = server.testOnly.open({
      type: "attach",
      tabId: "tab-1",
      sessionName: "build",
      cols: 80,
      rows: 24
    });

    expect(createBridge).toHaveBeenCalledTimes(1);
    expect(server.registry.countForSession("build")).toBe(1);

    socket.close();

    expect(killCount).toBe(1);
  });

  it("forwards scroll and clear-history requests to the terminal bridge", () => {
    const bridge = {
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      scroll: vi.fn(),
      clearHistory: vi.fn(),
      kill: vi.fn()
    };
    const server = createTerminalSocketServer({
      createBridge: vi.fn().mockReturnValue(bridge),
      registry: createBridgeRegistry()
    });

    const socket = server.testOnly.open({
      type: "attach",
      tabId: "tab-1",
      sessionName: "build",
      cols: 80,
      rows: 24
    });

    socket.receive({ type: "scroll", lines: -12 });
    socket.receive({ type: "clear-history" });

    expect(bridge.scroll).toHaveBeenCalledWith(-12);
    expect(bridge.clearHistory).toHaveBeenCalledOnce();
  });

  it("batches bridge output before sending it over the socket", () => {
    vi.useFakeTimers();
    const outputListeners: Array<(data: string) => void> = [];
    const bridge = {
      onData: vi.fn((listener: (data: string) => void) => {
        outputListeners.push(listener);
      }),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      scroll: vi.fn(),
      clearHistory: vi.fn(),
      kill: vi.fn()
    };
    const server = createTerminalSocketServer({
      createBridge: vi.fn().mockReturnValue(bridge),
      registry: createBridgeRegistry()
    });

    const socket = server.testOnly.open({
      type: "attach",
      tabId: "tab-1",
      sessionName: "build",
      cols: 80,
      rows: 24
    });

    outputListeners[0]?.("first ");
    outputListeners[0]?.("second");

    expect(socket.sent).toEqual([]);

    vi.advanceTimersByTime(8);

    expect(socket.sent).toEqual([
      JSON.stringify({ type: "output", data: "first second" })
    ]);
  });

  it("flushes pending bridge output before sending session exit", () => {
    vi.useFakeTimers();
    const outputListeners: Array<(data: string) => void> = [];
    const exitListeners: Array<() => void> = [];
    const bridge = {
      onData: vi.fn((listener: (data: string) => void) => {
        outputListeners.push(listener);
      }),
      onExit: vi.fn((listener: () => void) => {
        exitListeners.push(listener);
      }),
      write: vi.fn(),
      resize: vi.fn(),
      scroll: vi.fn(),
      clearHistory: vi.fn(),
      kill: vi.fn()
    };
    const server = createTerminalSocketServer({
      createBridge: vi.fn().mockReturnValue(bridge),
      registry: createBridgeRegistry()
    });

    const socket = server.testOnly.open({
      type: "attach",
      tabId: "tab-1",
      sessionName: "build",
      cols: 80,
      rows: 24
    });

    outputListeners[0]?.("pending");
    exitListeners[0]?.();

    expect(socket.sent).toEqual([
      JSON.stringify({ type: "output", data: "pending" }),
      JSON.stringify({ type: "session-exit" })
    ]);
  });

  it("closes the viewer when attach fails", () => {
    const server = createTerminalSocketServer({
      createBridge: vi.fn(() => {
        throw new Error("attach failed");
      }),
      registry: createBridgeRegistry()
    });

    const socket = server.testOnly.open({
      type: "attach",
      tabId: "tab-1",
      sessionName: "build",
      cols: 80,
      rows: 24
    });

    expect(server.registry.countForSession("build")).toBe(0);
    expect(socket.sent).toContain('{"type":"error","message":"attach failed"}');
    expect(socket.closeCount).toBe(1);
  });
});
