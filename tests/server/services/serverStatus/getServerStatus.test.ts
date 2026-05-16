import { describe, expect, it, vi } from "vitest";

import { getServerStatus } from "../../../../src/server/services/serverStatus/getServerStatus";

describe("getServerStatus", () => {
  it("returns platform-aware load and memory information", () => {
    const status = getServerStatus({
      platform: "linux",
      cpus: () => [{}, {}, {}, {}] as never,
      loadavg: () => [1.25, 0.75, 0.5],
      totalmem: () => 8 * 1024 * 1024 * 1024,
      freemem: () => 3 * 1024 * 1024 * 1024,
      uptime: () => 3661,
      homedir: () => "/home/app"
    });

    expect(status).toEqual({
      platform: "linux",
      cpuCount: 4,
      loadAverage: [1.25, 0.75, 0.5],
      loadPercent: 31,
      memoryTotalBytes: 8589934592,
      memoryFreeBytes: 3221225472,
      memoryUsedPercent: 63,
      uptimeSeconds: 3661,
      homeDirectory: "/home/app"
    });
  });

  it("omits load percent when cpu count is unavailable", () => {
    const status = getServerStatus({
      platform: "win32",
      cpus: () => [] as never,
      loadavg: () => [0, 0, 0],
      totalmem: () => 0,
      freemem: () => 0,
      uptime: () => 1,
      homedir: () => "/Users/app"
    });

    expect(status.loadPercent).toBeNull();
    expect(status.memoryUsedPercent).toBeNull();
  });
});
