import { describe, expect, it, vi } from "vitest";

import { createTerminalBridgeFactory } from "../../../../src/server/services/terminal/createTerminalBridgeFactory";

function createPty() {
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn()
  };
}

describe("createTerminalBridgeFactory", () => {
  it("configures tmux successfully once for every bridge from the factory", () => {
    const runTmuxCommandSync = vi.fn((args: string[]) => ({
      status: 0,
      stdout: args[0] === "show-options" ? "" : undefined
    }));
    const spawnPty = vi.fn(createPty);
    const factory = createTerminalBridgeFactory({
      runTmuxCommandSync,
      spawnPty,
      runTmuxCommand: vi.fn()
    });

    factory({ sessionName: "one", cols: 80, rows: 24 });
    factory({ sessionName: "two", cols: 80, rows: 24 });

    expect(runTmuxCommandSync).toHaveBeenCalledTimes(5);
    expect(runTmuxCommandSync).toHaveBeenNthCalledWith(1, [
      "show-options", "-gqv", "terminal-features"
    ]);
    expect(spawnPty).toHaveBeenCalledTimes(2);
  });

  it("retries the complete configuration after a nonzero result", () => {
    const runTmuxCommandSync = vi.fn()
      .mockReturnValueOnce({ status: 0, stdout: "" })
      .mockReturnValueOnce({ status: 1 })
      .mockReturnValue({ status: 0, stdout: "" });
    const spawnPty = vi.fn(createPty);
    const factory = createTerminalBridgeFactory({
      runTmuxCommandSync,
      spawnPty,
      runTmuxCommand: vi.fn()
    });

    expect(() =>
      factory({ sessionName: "failed", cols: 80, rows: 24 })
    ).toThrow("tmux configuration failed");
    expect(() =>
      factory({ sessionName: "retried", cols: 80, rows: 24 })
    ).not.toThrow();

    expect(runTmuxCommandSync.mock.calls.filter(([args]) => args[0] === "show-options"))
      .toHaveLength(2);
    expect(spawnPty).toHaveBeenCalledOnce();
  });

  it("retries after the synchronous runner throws", () => {
    const runTmuxCommandSync = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error("tmux unavailable");
      })
      .mockReturnValue({ status: 0, stdout: "xterm*:extkeys" });
    const factory = createTerminalBridgeFactory({
      runTmuxCommandSync,
      spawnPty: vi.fn(createPty),
      runTmuxCommand: vi.fn()
    });

    expect(() => factory({ sessionName: "one", cols: 80, rows: 24 }))
      .toThrow("tmux unavailable");
    expect(() => factory({ sessionName: "two", cols: 80, rows: 24 }))
      .not.toThrow();
  });
});
