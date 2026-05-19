import request from "supertest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("serves local image previews from absolute paths", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-image-"));
    const imagePath = join(dir, "preview.png");
    writeFileSync(
      imagePath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lx0H+QAAAABJRU5ErkJggg==",
        "base64"
      )
    );
    const app = createApp({
      imagePreviewRoots: [realpathSync(dir)],
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

    try {
      const response = await request(app)
        .get("/api/image-preview")
        .query({ path: imagePath });

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("image/png");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-preview-image-path"]).toBe(
        realpathSync(imagePath)
      );
      expect(response.body.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uploads pasted images into a fixed upload directory", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "tmux-ui-upload-"));
    const app = createApp({
      uploadDir,
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

    try {
      const response = await request(app)
        .post("/api/uploads/image")
        .set("Content-Type", "image/png")
        .set("X-Tmux-Session", "local/dev")
        .send(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lx0H+QAAAABJRU5ErkJggg==",
            "base64"
          )
        );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        ok: true,
        contentType: "image/png"
      });
      expect(response.body.absolutePath).toContain(uploadDir);
      expect(response.body.absolutePath).toContain("local-dev");
      expect(existsSync(response.body.absolutePath)).toBe(true);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("rejects upload payloads that are not real images", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "tmux-ui-upload-"));
    const app = createApp({
      uploadDir,
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

    try {
      const response = await request(app)
        .post("/api/uploads/image")
        .set("Content-Type", "image/png")
        .send(Buffer.from("not actually a png", "utf8"));

      expect(response.status).toBe(415);
      expect(response.body).toEqual({ error: "Unsupported image upload" });
      expect(readdirSync(uploadDir)).toHaveLength(0);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("cleans old uploaded images before saving new ones", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "tmux-ui-upload-"));
    const oldFile = join(uploadDir, "old.png");
    writeFileSync(oldFile, Buffer.from("old", "utf8"));
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    utimesSync(oldFile, oldTime, oldTime);
    const app = createApp({
      uploadDir,
      uploadRetentionMs: 60 * 60 * 1000,
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

    try {
      const response = await request(app)
        .post("/api/uploads/image")
        .set("Content-Type", "image/png")
        .send(Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"));

      expect(response.status).toBe(201);
      expect(existsSync(oldFile)).toBe(false);
      expect(statSync(response.body.absolutePath).isFile()).toBe(true);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  it("resolves relative image preview paths against the session path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-image-"));
    const imagePath = join(dir, "preview.webp");
    writeFileSync(imagePath, Buffer.from("RIFFxxxxWEBP", "utf8"));
    const app = createApp({
      imagePreviewRoots: [realpathSync(dir)],
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

    try {
      const response = await request(app)
        .get("/api/image-preview")
        .query({ path: "preview.webp", basePath: dir });

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("image/webp");
      expect(response.headers["x-preview-image-path"]).toBe(
        realpathSync(imagePath)
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-image preview files", async () => {
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

    const response = await request(app)
      .get("/api/image-preview")
      .query({ path: "/tmp/not-an-image.txt" });

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: "Unsupported image type" });
  });

  it("returns not found for image-looking paths that are not real files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-image-"));
    const app = createApp({
      imagePreviewRoots: [realpathSync(dir)],
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

    try {
      const response = await request(app)
        .get("/api/image-preview-info")
        .query({ path: "missing.png", basePath: dir });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ ok: false, error: "Image not found" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects image paths outside configured preview roots", async () => {
    const allowedDir = mkdtempSync(join(tmpdir(), "tmux-ui-allowed-"));
    const outsideDir = mkdtempSync(join(tmpdir(), "tmux-ui-outside-"));
    const imagePath = join(outsideDir, "preview.png");
    writeFileSync(imagePath, Buffer.from("png", "utf8"));
    const app = createApp({
      imagePreviewRoots: [realpathSync(allowedDir)],
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

    try {
      const response = await request(app)
        .get("/api/image-preview-info")
        .query({ path: imagePath });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        ok: false,
        error: "Image path is outside allowed roots"
      });
    } finally {
      rmSync(allowedDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("returns metadata for real image previews before listing candidates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-image-"));
    const imagePath = join(dir, "preview.png");
    writeFileSync(imagePath, Buffer.from("png", "utf8"));
    const app = createApp({
      imagePreviewRoots: [realpathSync(dir)],
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

    try {
      const response = await request(app)
        .get("/api/image-preview-info")
        .query({ path: imagePath });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        path: realpathSync(imagePath),
        contentType: "image/png",
        size: 3
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serves a direct image viewer page", async () => {
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

    const response = await request(app)
      .get("/view")
      .query({ path: "/tmp/preview.png", basePath: "/tmp" });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("/api/image-preview?path=%2Ftmp%2Fpreview.png");
    expect(response.text).toContain("name=\"basePath\" value=\"/tmp\"");
    expect(response.text).toContain("<img");
  });

  it("serves a direct image viewer page from encoded path routes", async () => {
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

    const response = await request(app).get("/view/%2Ftmp%2Fpreview.png");

    expect(response.status).toBe(200);
    expect(response.text).toContain("/api/image-preview?path=%2Ftmp%2Fpreview.png");
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
      includePanes: true,
      includeInputPrompt: true
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
      includePanes: true,
      includeInputPrompt: true
    });
  });
});
