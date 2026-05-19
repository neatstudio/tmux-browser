import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/server/createApp";

describe("createApp", () => {
  it("serves health with version and build metadata", async () => {
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
      getAppInfo: () => ({
        name: "tmux-ui",
        version: "1.2.3",
        commit: "abc123",
        builtAt: "2026-05-19T03:00:00.000Z"
      })
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      name: "tmux-ui",
      version: "1.2.3",
      commit: "abc123",
      builtAt: "2026-05-19T03:00:00.000Z"
    });
  });

  it("serves a small svg favicon without falling through to the SPA", async () => {
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
      }
    });

    const response = await request(app).get("/favicon.ico");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/svg+xml");
    expect(response.headers["cache-control"]).toContain("max-age=86400");
    expect(Number(response.headers["content-length"])).toBeGreaterThan(0);
    expect(response.body.toString("utf8")).toContain("<svg");
    expect(response.body.toString("utf8")).toContain("<path");
  });

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
