import { describe, expect, it, vi } from "vitest";

import { createDashboardStore } from "../../../src/client/state/dashboardStore";

const SERVER_STATUS = {
  platform: "linux",
  cpuCount: 4,
  loadAverage: [1, 0.5, 0.25] as [number, number, number],
  loadPercent: 25,
  memoryTotalBytes: 1024,
  memoryFreeBytes: 512,
  memoryUsedPercent: 50,
  uptimeSeconds: 60,
  homeDirectory: "/home/dashboard"
};

describe("createDashboardStore", () => {
  it("loads sessions from the api and exposes them to the renderer", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 2, status: "detached" }
      ])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();

    expect(store.getState().sessions).toEqual([
      { name: "build", windows: 2, status: "detached" }
    ]);
  });

  it("does not notify subscribers when a refresh returns unchanged sessions", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi.fn().mockResolvedValue([
        { name: "build", windows: 2, status: "detached" }
      ])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });
    const listener = vi.fn();

    store.subscribe(listener);

    await store.refresh();

    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();

    await store.refresh();

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers when a session attached status changes", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi
        .fn()
        .mockResolvedValueOnce([{ name: "build", windows: 2, status: "detached" }])
        .mockResolvedValueOnce([{ name: "build", windows: 2, status: "attached" }])
    };
    const store = createDashboardStore({ api, pollMs: 3000 });
    const listener = vi.fn();

    store.subscribe(listener);

    await store.refresh();
    listener.mockClear();
    await store.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().sessions).toEqual([
      { name: "build", windows: 2, status: "attached" }
    ]);
  });

  it("renames a session through the api and refreshes session state", async () => {
    const api = {
      getServerStatus: vi.fn().mockResolvedValue(SERVER_STATUS),
      listSessions: vi
        .fn()
        .mockResolvedValueOnce([{ name: "build", windows: 1 }])
        .mockResolvedValueOnce([{ name: "build-test", windows: 1 }]),
      renameSession: vi.fn().mockResolvedValue(undefined)
    };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();
    await store.renameSession("build", "build-test");

    expect(api.renameSession).toHaveBeenCalledWith("build", "build-test");
    expect(store.getState().sessions).toEqual([
      { name: "build-test", windows: 1 }
    ]);
  });
});
