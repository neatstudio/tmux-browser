import { describe, expect, it, vi } from "vitest";

import { createAnimationFrameScheduler } from "../../../src/client/render/renderScheduler";

describe("createAnimationFrameScheduler", () => {
  it("coalesces repeated schedules into one animation-frame render", () => {
    let scheduledCallback: FrameRequestCallback | null = null;
    const render = vi.fn();
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledCallback = callback;
      return 1;
    });
    const scheduler = createAnimationFrameScheduler(render, {
      requestFrame,
      cancelFrame: vi.fn()
    });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();

    scheduledCallback?.(performance.now());

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("can cancel a pending render before it reaches the frame", () => {
    const render = vi.fn();
    const cancelFrame = vi.fn();
    const scheduler = createAnimationFrameScheduler(render, {
      requestFrame: vi.fn(() => 7),
      cancelFrame
    });

    scheduler.schedule();
    scheduler.cancel();

    expect(cancelFrame).toHaveBeenCalledWith(7);
    expect(render).not.toHaveBeenCalled();
  });
});
