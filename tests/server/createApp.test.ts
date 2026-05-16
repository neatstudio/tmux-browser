import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/server/createApp";

describe("createApp", () => {
  it("serves server status for the dashboard header", async () => {
    const app = createApp({
      tmuxService: {
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn()
      },
      getServerStatus: () => ({
        platform: "linux",
        cpuCount: 2,
        loadAverage: [0.5, 0.25, 0.1],
        loadPercent: 25,
        memoryTotalBytes: 1024,
        memoryFreeBytes: 256,
        memoryUsedPercent: 75,
        uptimeSeconds: 3600,
        homeDirectory: "/root"
      })
    });

    const response = await request(app).get("/api/server-status");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      platform: "linux",
      loadPercent: 25,
      memoryUsedPercent: 75,
      homeDirectory: "/root"
    });
  });
});
