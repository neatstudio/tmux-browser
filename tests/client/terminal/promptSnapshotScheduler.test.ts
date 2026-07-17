import { describe, expect, it, vi } from "vitest";

import { createPromptSnapshotScheduler } from "../../../src/client/terminal/promptSnapshotScheduler";

describe("promptSnapshotScheduler", () => {
  it("coalesces bursts and snapshots no more than once per 150ms", () => {
    vi.useFakeTimers();
    const onSnapshot = vi.fn();
    const scheduler = createPromptSnapshotScheduler({
      readSnapshot: () => "tail",
      onSnapshot
    });

    scheduler.trackWrite("one")();
    scheduler.trackWrite(" two")();
    expect(onSnapshot).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(149);
    expect(onSnapshot).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenLastCalledWith(" two", "tail");
    vi.useRealTimers();
  });

  it("waits for the latest terminal write callback before reading", () => {
    const readSnapshot = vi.fn(() => "latest tail");
    const onSnapshot = vi.fn();
    const scheduler = createPromptSnapshotScheduler({ readSnapshot, onSnapshot });
    const firstWritten = scheduler.trackWrite("first");
    const latestWritten = scheduler.trackWrite("second");

    firstWritten();
    expect(readSnapshot).not.toHaveBeenCalled();
    latestWritten();

    expect(onSnapshot).toHaveBeenCalledWith("firstsecond", "latest tail");
  });

  it("flushes immediately after a pending write and finalizes afterward", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const scheduler = createPromptSnapshotScheduler({
      readSnapshot: () => "final tail",
      onSnapshot: (rawData) => calls.push(`snapshot:${rawData}`)
    });
    scheduler.trackWrite("initial")();
    const finalWritten = scheduler.trackWrite("final");
    scheduler.finalize(() => calls.push("closed"));

    expect(calls).toEqual(["snapshot:initial"]);
    finalWritten();

    expect(calls).toEqual(["snapshot:initial", "snapshot:final", "closed"]);
    vi.useRealTimers();
  });

  it("cancels pending reconnect and destroy work", () => {
    vi.useFakeTimers();
    const onSnapshot = vi.fn();
    const scheduler = createPromptSnapshotScheduler({
      readSnapshot: () => "tail",
      onSnapshot
    });
    scheduler.trackWrite("initial")();
    const staleWritten = scheduler.trackWrite("stale");
    scheduler.cancel();
    staleWritten();
    vi.runAllTimers();

    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot).not.toHaveBeenCalledWith("stale", expect.anything());
    vi.useRealTimers();
  });

  it("flushes throttled idle work without waiting for the timer", () => {
    vi.useFakeTimers();
    const onSnapshot = vi.fn();
    const scheduler = createPromptSnapshotScheduler({
      readSnapshot: () => "idle tail",
      onSnapshot
    });
    scheduler.trackWrite("initial")();
    scheduler.trackWrite("idle")();
    scheduler.flush();

    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshot).toHaveBeenLastCalledWith("idle", "idle tail");
    vi.useRealTimers();
  });

  it("keeps 60fps PTY delivery intact while limiting snapshots to seven per second", () => {
    let now = 0;
    let nextTimerId = 1;
    const timers = new Map<number, { at: number; callback: () => void }>();
    const delivered: string[] = [];
    const snapshotted: string[] = [];
    const advanceTo = (target: number) => {
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((left, right) => left[1].at - right[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = target;
    };
    const scheduler = createPromptSnapshotScheduler({
      now: () => now,
      setTimer: (callback, delayMs) => {
        const timerId = nextTimerId++;
        timers.set(timerId, { at: now + delayMs, callback });
        return timerId as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: (handle) => timers.delete(handle as unknown as number),
      readSnapshot: () => "tail",
      onSnapshot: (rawData) => snapshotted.push(rawData)
    });

    for (let frame = 0; frame < 60; frame += 1) {
      advanceTo((frame * 1000) / 60);
      const chunk = `frame-${frame}:${"x".repeat(1024)}`;
      delivered.push(chunk);
      scheduler.trackWrite(chunk)();
    }
    advanceTo(999.999);

    expect(delivered).toHaveLength(60);
    expect(snapshotted.length).toBeLessThanOrEqual(7);
    scheduler.flush();
    expect(snapshotted.join("")).toBe(delivered.join(""));
  });
});
