import { describe, expect, it, vi } from "vitest";

import { createInactiveTerminalPruner } from "../../../src/client/terminal/inactiveTerminalPruner";

function createTimerHarness() {
  let nextHandle = 1;
  const timers = new Map<number, () => void>();

  return {
    setTimeout: vi.fn((callback: () => void) => {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, callback);
      return handle;
    }),
    clearTimeout: vi.fn((handle: number) => {
      timers.delete(handle);
    }),
    run(handle: number) {
      timers.get(handle)?.();
    },
    handles() {
      return [...timers.keys()];
    }
  };
}

describe("createInactiveTerminalPruner", () => {
  it("detaches inactive terminals after the configured delay", () => {
    const timers = createTimerHarness();
    const detach = vi.fn();
    const pruner = createInactiveTerminalPruner({
      delayMs: 5000,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    pruner.sync("tab-1", ["tab-1", "tab-2"], detach);

    expect(timers.setTimeout).toHaveBeenCalledOnce();
    expect(detach).not.toHaveBeenCalled();

    timers.run(timers.handles()[0]!);

    expect(detach).toHaveBeenCalledWith("tab-2");
  });

  it("cancels a pending detach when a tab becomes active again", () => {
    const timers = createTimerHarness();
    const detach = vi.fn();
    const pruner = createInactiveTerminalPruner({
      delayMs: 5000,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    pruner.sync("tab-1", ["tab-1", "tab-2"], detach);
    const handle = timers.handles()[0]!;

    pruner.sync("tab-2", ["tab-1", "tab-2"], detach);
    timers.run(handle);

    expect(timers.clearTimeout).toHaveBeenCalledWith(handle);
    expect(detach).not.toHaveBeenCalled();
  });

  it("cancels timers for terminals that were removed directly", () => {
    const timers = createTimerHarness();
    const detach = vi.fn();
    const pruner = createInactiveTerminalPruner({
      delayMs: 5000,
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout
    });

    pruner.sync("tab-1", ["tab-1", "tab-2"], detach);
    const handle = timers.handles()[0]!;

    pruner.sync("tab-1", ["tab-1"], detach);
    timers.run(handle);

    expect(timers.clearTimeout).toHaveBeenCalledWith(handle);
    expect(detach).not.toHaveBeenCalled();
  });
});
