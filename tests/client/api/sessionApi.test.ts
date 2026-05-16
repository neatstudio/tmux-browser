import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionApi } from "../../../src/client/api/sessionApi";

describe("createSessionApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads server status for the dashboard header", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          platform: "linux",
          cpuCount: 4,
          loadAverage: [1, 0.5, 0.25],
          loadPercent: 25,
          memoryTotalBytes: 1024,
          memoryFreeBytes: 512,
          memoryUsedPercent: 50,
          uptimeSeconds: 60,
          homeDirectory: "/home/app"
        })
    });
    vi.stubGlobal("fetch", fetch);

    await expect(createSessionApi().getServerStatus()).resolves.toMatchObject({
      platform: "linux",
      memoryUsedPercent: 50,
      homeDirectory: "/home/app"
    });

    expect(fetch).toHaveBeenCalledWith("/api/server-status");
  });
});
