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
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
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

  it("serves preview-enabled sessions from the dashboard endpoint", async () => {
    const listSessions = vi.fn().mockResolvedValue([
      {
        name: "build",
        windows: 1,
        status: "attached",
        preview: "npm run dev"
      }
    ]);
    const app = createApp({
      tmuxService: {
        listSessions,
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
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

    const response = await request(app).get("/api/sessions-all");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        name: "build",
        windows: 1,
        status: "attached",
        preview: "npm run dev"
      }
    ]);
    expect(listSessions).toHaveBeenCalledWith({
      includePreview: true,
      includePanes: true
    });
  });

  it("serves pane-aware sessions without previews from the status endpoint", async () => {
    const listSessions = vi.fn().mockResolvedValue([
      {
        name: "build",
        windows: 1,
        status: "attached",
        preview: null,
        panes: [{ paneId: "%1" }]
      }
    ]);
    const app = createApp({
      tmuxService: {
        listSessions,
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
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

    const response = await request(app).get("/api/sessions-panes");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        name: "build",
        windows: 1,
        status: "attached",
        panes: [{ paneId: "%1" }]
      }
    ]);
    expect(response.body[0]).not.toHaveProperty("preview");
    expect(listSessions).toHaveBeenCalledWith({
      includePreview: false,
      includePanes: true
    });
  });
});
