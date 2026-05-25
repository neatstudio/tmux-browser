import { describe, expect, it, vi } from "vitest";

import { createAppEventRefreshScheduler } from "../../../src/client/events/appEventRefreshScheduler";

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
