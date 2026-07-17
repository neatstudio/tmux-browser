import { describe, expect, it, vi } from "vitest";
import {
  createSingleFlight,
  sessionStatusRequestKey,
  sessionsRequestKey,
  timelineRequestKey
} from "../../../src/client/state/singleFlight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("coalesces identical successful work", async () => {
    const pending = deferred<string>();
    const operation = vi.fn(() => pending.promise);
    const singleFlight = createSingleFlight();

    const first = singleFlight.run("kanban", operation);
    const second = singleFlight.run("kanban", operation);
    pending.resolve("ok");

    await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"]);
    expect(operation).toHaveBeenCalledOnce();
  });

  it("coalesces rejection, clears it, and permits retry", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("retried");
    const singleFlight = createSingleFlight();

    const first = singleFlight.run("server-status", operation);
    const second = singleFlight.run("server-status", operation);
    await expect(Promise.allSettled([first, second])).resolves.toMatchObject([
      { status: "rejected", reason: { message: "offline" } },
      { status: "rejected", reason: { message: "offline" } }
    ]);
    await expect(singleFlight.run("server-status", operation)).resolves.toBe("retried");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("runs distinct keys independently", async () => {
    const operation = vi.fn(async (value: string) => value);
    const singleFlight = createSingleFlight();

    await expect(Promise.all([
      singleFlight.run("status:build", () => operation("build")),
      singleFlight.run("status:logs", () => operation("logs"))
    ])).resolves.toEqual(["build", "logs"]);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe("dashboard request keys", () => {
  it("changes the session key for preview, panes, server status, and sorted muted names", () => {
    const base = sessionsRequestKey({
      includePreview: false,
      includePanes: false,
      includeServerStatus: false,
      mutedSessionNames: ["z", "a"]
    });

    expect(base).toBe('sessions:false:false:false:["a","z"]');
    expect(sessionsRequestKey({ includePreview: true, includePanes: false, includeServerStatus: false, mutedSessionNames: ["a", "z"] })).not.toBe(base);
    expect(sessionsRequestKey({ includePreview: false, includePanes: true, includeServerStatus: false, mutedSessionNames: ["a", "z"] })).not.toBe(base);
    expect(sessionsRequestKey({ includePreview: false, includePanes: false, includeServerStatus: true, mutedSessionNames: ["a", "z"] })).not.toBe(base);
    expect(sessionsRequestKey({ includePreview: false, includePanes: false, includeServerStatus: false, mutedSessionNames: ["a"] })).not.toBe(base);
    expect(sessionStatusRequestKey("build")).toBe("status:build");
  });

  it("does not collide when session names contain separators", () => {
    const common = {
      includePreview: false,
      includePanes: true,
      includeServerStatus: false
    };

    expect(
      sessionsRequestKey({ ...common, mutedSessionNames: ["a,b"] })
    ).not.toBe(
      sessionsRequestKey({ ...common, mutedSessionNames: ["a", "b"] })
    );
  });

  it("distinguishes latest timeline requests from cursor and history-expired requests", () => {
    expect(timelineRequestKey({ cursor: null, limit: 8, historyExpired: false })).toBe("timeline:latest:8:false");
    expect(timelineRequestKey({ cursor: "opaque", limit: 8, historyExpired: false })).not.toBe(timelineRequestKey({ cursor: null, limit: 8, historyExpired: false }));
    expect(timelineRequestKey({ cursor: null, limit: 8, historyExpired: true })).not.toBe(timelineRequestKey({ cursor: null, limit: 8, historyExpired: false }));
  });
});
