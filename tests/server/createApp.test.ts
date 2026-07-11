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

import {
  createApp,
  getHookRemoteAddress,
  isTrustedHookRemoteAddress
} from "../../src/server/createApp";
import { createAppEventHub } from "../../src/server/services/events/createAppEventHub";
import { createTimelineStore } from "../../src/server/services/timeline/createTimelineStore";
import { fetchRemoteImage } from "../../src/server/services/uploads/remoteImageUploadService";

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

  it("serves recent timeline events recorded from session operations", async () => {
    const app = createApp({
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn().mockResolvedValue(undefined),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn().mockResolvedValue(undefined),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    await request(app).post("/api/sessions").send({ name: "build" });
    await request(app)
      .post("/api/sessions/build/send")
      .send({ command: "npm test" });

    const response = await request(app).get("/api/timeline").query({ limit: 5 });

    expect(response.status).toBe(200);
    expect(response.body.events).toMatchObject([
      {
        type: "command-sent",
        sessionName: "build",
        message: "sent command: npm test"
      },
      {
        type: "session-created",
        sessionName: "build",
        message: "created session build"
      }
    ]);
  });

  it("accepts authenticated hook events, records timeline, and broadcasts app events", async () => {
    const timelineStore = createTimelineStore();
    const eventHub = createAppEventHub();
    const received: unknown[] = [];
    eventHub.subscribe((event) => received.push(event));
    const app = createApp({
      hookToken: "secret-token",
      timelineStore,
      eventHub,
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
      .post("/api/hooks/events")
      .set("Authorization", "Bearer secret-token")
      .send({
        source: "codex",
        sessionName: "local-pets",
        cwd: "/Users/gouki/server/wwwroot/own/pets",
        eventType: "approval-required",
        status: "waiting",
        title: "Need confirmation",
        body: "Approve file edit?",
        taskId: "task-1",
        metadata: {
          tool: "apply_patch",
          ignored: { nested: true }
        },
        target: {
          sessionName: "project-codex",
          projectName: "project"
        },
        actions: [
          {
            id: "approve",
            label: "Approve",
            input: "y\r",
            style: "primary"
          },
          {
            id: "details",
            label: "Open details",
            open: true,
            target: {
              sessionName: "project-review",
              projectName: "project"
            }
          }
        ]
      });

    expect(response.status).toBe(202);
    expect(response.body.event).toMatchObject({
      type: "hook-event",
      source: "codex",
      sessionName: "local-pets",
      cwd: "/Users/gouki/server/wwwroot/own/pets",
      eventType: "approval-required",
      status: "waiting",
      title: "Need confirmation",
      body: "Approve file edit?",
      taskId: "task-1",
      schemaVersion: "tmux-ui.hook/v1",
      target: {
        sessionName: "project-codex",
        projectName: "project",
        view: "terminal"
      },
      actions: [
        {
          id: "approve",
          label: "Approve",
          input: "y\r",
          open: false,
          style: "primary",
          target: null
        },
        {
          id: "details",
          label: "Open details",
          input: null,
          open: true,
          style: "secondary",
          target: {
            sessionName: "project-review",
            projectName: "project",
            view: "terminal"
          }
        }
      ],
      metadata: {
        tool: "apply_patch"
      }
    });
    const timelineEvent = timelineStore.listEvents({ limit: 1 })[0];
    expect(timelineEvent).toMatchObject({
      type: "hook-event",
      sessionName: "local-pets",
      message: "Need confirmation",
      metadata: {
        source: "codex",
        eventType: "approval-required",
        status: "waiting",
        taskId: "task-1",
        cwd: "/Users/gouki/server/wwwroot/own/pets",
        target: expect.any(String),
        actions: expect.any(String)
      }
    });
    expect(JSON.parse(String(timelineEvent.metadata?.target))).toEqual({
      sessionName: "project-codex",
      projectName: "project",
      view: "terminal"
    });
    expect(JSON.parse(String(timelineEvent.metadata?.actions))).toEqual([
      {
        id: "approve",
        label: "Approve",
        input: "y\r",
        open: false,
        target: null,
        style: "primary"
      },
      {
        id: "details",
        label: "Open details",
        input: null,
        open: true,
        target: {
          sessionName: "project-review",
          projectName: "project",
          view: "terminal"
        },
        style: "secondary"
      }
    ]);
    expect(received).toEqual([
      expect.objectContaining({
        type: "hook-event",
        source: "codex",
        sessionName: "local-pets",
        status: "waiting",
        actions: expect.arrayContaining([
          expect.objectContaining({ id: "approve", label: "Approve" })
        ]),
        target: {
          sessionName: "project-codex",
          projectName: "project",
          view: "terminal"
        }
      })
    ]);
  });

  it("does not trust spoofable X-Forwarded-For values for hook auth", () => {
    const address = getHookRemoteAddress({
      ip: "203.0.113.20",
      socket: { remoteAddress: "203.0.113.20" },
      get: (header: string) =>
        header.toLowerCase() === "x-forwarded-for" ? "127.0.0.1" : undefined
    });

    expect(address).toBe("203.0.113.20");
    expect(isTrustedHookRemoteAddress(address)).toBe(false);
  });

  it("rejects hook events without the configured bearer token", async () => {
    const app = createApp({
      hookToken: "secret-token",
      trustedProxy: true,
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
      .post("/api/hooks/events")
      .set("X-Forwarded-For", "203.0.113.20")
      .set("Authorization", "Bearer wrong")
      .send({
        source: "codex",
        sessionName: "local-pets",
        eventType: "approval-required",
        status: "waiting"
      });

    expect(response.status).toBe(401);
  });

  it("allows hook events from trusted proxy localhost or Tailscale addresses without a token", async () => {
    const app = createApp({
      trustedProxy: true,
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

    const localhostResponse = await request(app)
      .post("/api/hooks/events")
      .set("X-Forwarded-For", "127.0.0.1")
      .send({
        source: "codex",
        sessionName: "hooks",
        eventType: "need-input",
        status: "waiting"
      });
    const tailscaleResponse = await request(app)
      .post("/api/hooks/events")
      .set("X-Forwarded-For", "100.89.0.116")
      .send({
        source: "codex",
        sessionName: "hooks",
        eventType: "need-input",
        status: "waiting"
      });

    expect(localhostResponse.status).toBe(202);
    expect(tailscaleResponse.status).toBe(202);
  });

  it("still requires a token for hook events from non-local private addresses", async () => {
    const app = createApp({
      hookToken: "secret-token",
      trustedProxy: true,
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
      .post("/api/hooks/events")
      .set("X-Forwarded-For", "192.168.1.20")
      .send({
        source: "codex",
        sessionName: "hooks",
        eventType: "need-input",
        status: "waiting"
      });

    expect(response.status).toBe(401);
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

  it("uploads a remote image url into a fixed upload directory", async () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "tmux-ui-upload-"));
    const app = createApp({
      uploadDir,
      fetchRemoteImage: vi.fn().mockResolvedValue(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lx0H+QAAAABJRU5ErkJggg==",
          "base64"
        )
      ),
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
        .post("/api/uploads/image-url")
        .set("X-Tmux-Session", "local/dev")
        .send({ url: "https://img.example.test/shot.png" });

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

  it("rejects remote image urls that resolve to private addresses", async () => {
    await expect(
      fetchRemoteImage("http://127.0.0.1/shot.png", {
        lookup: vi.fn().mockResolvedValue([{ address: "127.0.0.1" }]),
        fetch: vi.fn()
      })
    ).rejects.toMatchObject({
      message: "Remote image host is not allowed",
      statusCode: 403
    });
  });

  it("rejects remote image urls that resolve to IPv4-mapped private IPv6 addresses", async () => {
    await expect(
      fetchRemoteImage("http://internal.example.test/shot.png", {
        lookup: vi.fn().mockResolvedValue([{ address: "::ffff:127.0.0.1" }]),
        fetch: vi.fn()
      })
    ).rejects.toMatchObject({
      message: "Remote image host is not allowed",
      statusCode: 403
    });
  });

  it("stops reading remote images once they exceed the upload limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      }
    });

    await expect(
      fetchRemoteImage("https://img.example.test/huge.png", {
        lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]),
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          body,
          arrayBuffer: vi.fn()
        })
      })
    ).rejects.toMatchObject({
      message: "Remote image is too large",
      statusCode: 413
    });
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

  it("passes muted session names to pane-aware and dashboard endpoints", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);
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
      }
    });

    await request(app)
      .get("/api/sessions-panes")
      .query({ muted: "tmux-ui,logs,tmux-ui" });
    await request(app).get("/api/sessions-all").query({ only: "tmux-ui,logs" });

    expect(listSessions).toHaveBeenNthCalledWith(1, {
      includePreview: false,
      includePanes: true,
      includeInputPrompt: true,
      mutedSessionNames: ["tmux-ui", "logs"]
    });
    expect(listSessions).toHaveBeenNthCalledWith(2, {
      includePreview: true,
      includePanes: true,
      includeInputPrompt: true,
      onlySessionNames: ["tmux-ui", "logs"]
    });
  });

  it("serves server-backed preferences for sidebar favorites", async () => {
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: ["build"],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      })),
      setPinnedSession: vi.fn().mockResolvedValue(undefined),
      setMutedSession: vi.fn().mockResolvedValue(undefined),
      setSessionSettings: vi.fn().mockResolvedValue(undefined),
      upsertKanbanProject: vi.fn().mockResolvedValue(undefined),
      deleteKanbanProject: vi.fn().mockResolvedValue(undefined),
      renameSession: vi.fn().mockResolvedValue(undefined)
    };
    const app = createApp({
      preferences,
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

    const getResponse = await request(app).get("/api/preferences");
    const patchResponse = await request(app)
      .patch("/api/preferences/pinned-sessions/build")
      .send({ pinned: false });
    const muteResponse = await request(app)
      .patch("/api/preferences/muted-sessions/tmux-ui")
      .send({ muted: false });
    const settingsResponse = await request(app)
      .patch("/api/preferences/session-settings/build")
      .send({
        settings: {
          fontSize: 18,
          fontFamily: "Menlo, monospace",
          lineHeight: 1.4,
          themeId: "paper"
        }
      });

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({
      pinnedSessionNames: ["build"],
      mutedSessionNames: ["tmux-ui"],
      sessionSettings: {},
      kanbanProjects: []
    });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toEqual({ ok: true });
    expect(muteResponse.status).toBe(200);
    expect(muteResponse.body).toEqual({ ok: true });
    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body).toEqual({ ok: true });
    expect(preferences.setPinnedSession).toHaveBeenCalledWith("build", false);
    expect(preferences.setMutedSession).toHaveBeenCalledWith("tmux-ui", false);
    expect(preferences.setSessionSettings).toHaveBeenCalledWith("build", {
      fontSize: 18,
      fontFamily: "Menlo, monospace",
      lineHeight: 1.4,
      themeId: "paper"
    });
  });

  it("creates selected recommended sessions while saving the full kanban project", async () => {
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: "tw1",
            agents: [
              {
                kind: "pm",
                name: "pm",
                command: null
              },
              {
                kind: "review",
                name: "review",
                command: null
              },
              {
                kind: "codex",
                name: "codex",
                command: null
              }
            ]
          }
        ]
      }),
      deleteKanbanProject: vi.fn(),
      renameSession: vi.fn()
    };
    const createProjectSessions = vi
      .fn()
      .mockResolvedValue(["xxvisa-pm", "xxvisa-codex"]);
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions,
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects")
      .send({
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: "tw1",
        selectedAgentNames: ["pm", "codex"],
        agents: [
          {
            kind: "pm",
            name: "pm",
            command: null
          },
          {
            kind: "review",
            name: "review",
            command: null
          },
          {
            kind: "codex",
            name: "codex",
            command: null
          }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      ok: true,
      sessions: ["xxvisa-pm", "xxvisa-codex"],
      preferences: {
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: "tw1",
            agents: [
              {
                kind: "pm",
                name: "pm",
                command: null
              },
              {
                kind: "review",
                name: "review",
                command: null
              },
              {
                kind: "codex",
                name: "codex",
                command: null
              }
            ]
          }
        ]
      }
    });
    expect(preferences.upsertKanbanProject).toHaveBeenCalledWith({
      name: "xxvisa",
      path: "/srv/xxvisa",
      server: "tw1",
      agents: [
        {
          kind: "pm",
          name: "pm",
          command: null
        },
        {
          kind: "review",
          name: "review",
          command: null
        },
        {
          kind: "codex",
          name: "codex",
          command: null
        }
      ]
    });
    expect(createProjectSessions).toHaveBeenCalledWith({
      projectName: "xxvisa",
      projectPath: "/srv/xxvisa",
      server: "tw1",
      agents: [
        {
          name: "pm",
          command: null
        },
        {
          name: "codex",
          command: null
        }
      ]
    });
  });

  it("serves kanban projects after pruning sessions missing from tmux", async () => {
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [
              { kind: "pm", name: "pm", command: null },
              { kind: "codex", name: "codex", command: null }
            ]
          }
        ]
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [{ kind: "pm", name: "pm", command: null }]
          }
        ]
      }),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn().mockResolvedValue([
          {
            name: "xxvisa-pm",
            windows: 1,
            status: "detached",
            lastActivityAt: null,
            paneCount: 1,
            activeWindowName: null,
            currentCommand: null,
            currentPath: null,
            gitBranch: null,
            gitDirty: null,
            paneDead: false,
            paneDeadStatus: null,
            preview: null,
            inputPrompt: null
          }
        ]),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app).get("/api/kanban/projects");

    expect(response.status).toBe(200);
    expect(preferences.syncKanbanSessions).toHaveBeenCalledWith(["xxvisa-pm"]);
    expect(response.body.projects).toEqual([
      {
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: null,
        agents: [{ kind: "pm", name: "pm", command: null }]
      }
    ]);
  });

  it("removes a kanban project session without killing tmux when requested", async () => {
    const preferences = {
      getPreferences: vi.fn(),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      removeKanbanSession: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      }),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const killSession = vi.fn();
    const app = createApp({
      preferences,
      killSession,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .delete("/api/kanban/projects/xxvisa/sessions/codex")
      .query({ kill: "false" });

    expect(response.status).toBe(200);
    expect(killSession).not.toHaveBeenCalled();
    expect(preferences.removeKanbanSession).toHaveBeenCalledWith("xxvisa-codex");
  });

  it("adds an existing tmux session to a kanban project", async () => {
    const preferences = {
      getPreferences: vi.fn(),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [
              {
                kind: "session",
                name: "local-ssh",
                command: null,
                sessionName: "local-ssh"
              }
            ]
          }
        ]
      }),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects/xxvisa/sessions")
      .send({ sessionName: " local-ssh " });

    expect(response.status).toBe(200);
    expect(preferences.addKanbanSession).toHaveBeenCalledWith("xxvisa", "local-ssh");
    expect(response.body.preferences.kanbanProjects[0].agents).toEqual([
      {
        kind: "session",
        name: "local-ssh",
        command: null,
        sessionName: "local-ssh"
      }
    ]);
  });

  it("rejects adding a blank session to a kanban project", async () => {
    const preferences = {
      getPreferences: vi.fn(),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects/xxvisa/sessions")
      .send({ sessionName: " " });

    expect(response.status).toBe(400);
    expect(preferences.addKanbanSession).not.toHaveBeenCalled();
  });

  it("kills a kanban project session and removes it from the project", async () => {
    const preferences = {
      getPreferences: vi.fn(),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      removeKanbanSession: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      }),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const killSession = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      preferences,
      killSession,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .delete("/api/kanban/projects/xxvisa/sessions/codex")
      .query({ kill: "true" });

    expect(response.status).toBe(200);
    expect(killSession).toHaveBeenCalledWith("xxvisa-codex");
    expect(preferences.removeKanbanSession).toHaveBeenCalledWith("xxvisa-codex");
  });

  it("kills a manually attached kanban session by its real session name", async () => {
    const preferences = {
      getPreferences: vi.fn(),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      }),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const killSession = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      preferences,
      killSession,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .delete("/api/kanban/projects/xxvisa/sessions/local-ssh")
      .query({ kill: "true" });

    expect(response.status).toBe(200);
    expect(killSession).toHaveBeenCalledWith("local-ssh");
    expect(preferences.removeKanbanSession).toHaveBeenCalledWith("local-ssh");
  });

  it("saves kanban projects without creating tmux sessions when none are selected", async () => {
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [
              { kind: "pm", name: "pm", command: null },
              { kind: "review", name: "review", command: null }
            ]
          }
        ]
      }),
      deleteKanbanProject: vi.fn(),
      renameSession: vi.fn()
    };
    const createProjectSessions = vi.fn();
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions,
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects")
      .send({
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: null,
        selectedAgentNames: [],
        agents: [
          { kind: "pm", name: "pm", command: null },
          { kind: "review", name: "review", command: null }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.sessions).toEqual([]);
    expect(createProjectSessions).not.toHaveBeenCalled();
    expect(preferences.upsertKanbanProject).toHaveBeenCalledWith({
      name: "xxvisa",
      path: "/srv/xxvisa",
      server: null,
      agents: [
        { kind: "pm", name: "pm", command: null },
        { kind: "review", name: "review", command: null }
      ]
    });
  });

  it("rejects the reserved virtual ungrouped kanban project name", async () => {
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects")
      .send({
        name: "ungrouped",
        path: "~",
        server: null,
        selectedAgentNames: [],
        agents: []
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "ungrouped is reserved for the virtual kanban group"
    });
    expect(preferences.upsertKanbanProject).not.toHaveBeenCalled();
  });

  it("saves kanban projects even when no recommended agents are provided", async () => {
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "solo",
            path: "~",
            server: null,
            agents: []
          }
        ]
      }),
      deleteKanbanProject: vi.fn(),
      renameSession: vi.fn()
    };
    const createProjectSessions = vi.fn();
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions,
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects")
      .send({
        name: "solo",
        path: "~",
        server: null,
        selectedAgentNames: [],
        agents: []
      });

    expect(response.status).toBe(201);
    expect(response.body.sessions).toEqual([]);
    expect(createProjectSessions).not.toHaveBeenCalled();
    expect(preferences.upsertKanbanProject).toHaveBeenCalledWith({
      name: "solo",
      path: "~",
      server: null,
      agents: []
    });
  });

  it("sends kanban group messages to resolved tmux sessions and stores delivery state", async () => {
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [
              { kind: "pm", name: "pm", command: null },
              { kind: "review", name: "review", command: null },
              { kind: "codex", name: "codex", command: null }
            ]
          }
        ]
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn().mockResolvedValue([
          { name: "xxvisa-pm", currentCommand: "codex" },
          { name: "xxvisa-review", currentCommand: "claude" },
          { name: "xxvisa-codex", currentCommand: "codex" }
        ]),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput,
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects/xxvisa/messages")
      .send({
        fromSession: "xxvisa-pm",
        kind: "task",
        target: { type: "others" },
        body: "Please review checkout."
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSessions: ["xxvisa-review", "xxvisa-codex"],
      kind: "task",
      status: "pending",
      body: "Please review checkout.",
      deliveries: [
        { sessionName: "xxvisa-review", status: "sent", mode: "agent-input" },
        { sessionName: "xxvisa-codex", status: "sent", mode: "agent-input" }
      ]
    });
    expect(sendInput).toHaveBeenCalledTimes(2);
    expect(sendInput.mock.calls[0][0]).toBe("xxvisa-review");
    const agentPayload = JSON.parse(sendInput.mock.calls[0][1].trim());
    expect(agentPayload).toMatchObject({
      type: "tmux-ui.task",
      id: response.body.message.id,
      project: "xxvisa",
      from: "xxvisa-pm",
      to: "xxvisa-review",
      body: "Please review checkout."
    });
    expect(agentPayload.reply_with).toMatchObject({
      type: "tmux-ui.reply",
      id: response.body.message.id,
      from: "xxvisa-review"
    });
    expect(sendInput.mock.calls[0][1]).toMatch(/\r$/);

    const listResponse = await request(app).get(
      "/api/kanban/projects/xxvisa/messages"
    );

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.messages).toHaveLength(1);
    expect(listResponse.body.messages[0].id).toBe(response.body.message.id);
  });

  it("prints group messages safely for plain shell targets instead of executing the message body", async () => {
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const sendLiteralInput = vi.fn().mockResolvedValue(undefined);
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "local",
            path: "/srv/local",
            server: null,
            agents: [
              { kind: "pm", name: "pm", command: null },
              {
                kind: "session",
                name: "local-shell",
                command: null,
                sessionName: "local-shell"
              }
            ]
          }
        ]
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn().mockResolvedValue([
          { name: "local-pm", currentCommand: "codex" },
          { name: "local-shell", currentCommand: "zsh" }
        ]),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput,
        sendLiteralInput,
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects/local/messages")
      .send({
        fromSession: "local-pm",
        kind: "task",
        target: { type: "session", sessionName: "local-shell" },
        body: "echo should-not-run"
      });

    expect(response.status).toBe(201);
    expect(response.body.message.deliveries).toEqual([
      { sessionName: "local-shell", status: "sent", mode: "shell-print" }
    ]);
    expect(sendInput).not.toHaveBeenCalled();
    expect(sendLiteralInput).toHaveBeenCalledWith(
      "local-shell",
      expect.stringMatching(/^printf '%b\\n' /)
    );
    expect(sendLiteralInput.mock.calls[0][1]).toContain('"type": "tmux-ui.task"');
    expect(sendLiteralInput.mock.calls[0][1]).toContain('"body": "echo should-not-run"');
    expect(sendLiteralInput.mock.calls[0][1]).not.toContain("\necho should-not-run\n");
  });

  it("sends group messages between ungrouped live sessions through the virtual ungrouped project", async () => {
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [
              {
                kind: "session",
                name: "xxvisa-pm",
                command: null,
                sessionName: "xxvisa-pm"
              }
            ]
          }
        ]
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn().mockResolvedValue([
          { name: "xxvisa-pm", currentCommand: "codex" },
          { name: "scratch-a", currentCommand: "codex" },
          { name: "scratch-b", currentCommand: "claude" }
        ]),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput,
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects/ungrouped/messages")
      .send({
        fromSession: "scratch-a",
        kind: "task",
        target: { type: "others" },
        body: "Check this ungrouped task."
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({
      projectName: "ungrouped",
      fromSession: "scratch-a",
      toSessions: ["scratch-b"],
      deliveries: [
        { sessionName: "scratch-b", status: "sent", mode: "agent-input" }
      ]
    });
    expect(sendInput).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendInput.mock.calls[0][1].trim())).toMatchObject({
      type: "tmux-ui.task",
      project: "ungrouped",
      from: "scratch-a",
      to: "scratch-b"
    });
  });

  it("keeps successful kanban group deliveries when one target send fails", async () => {
    const sendInput = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("tmux target missing"));
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [
              { kind: "pm", name: "pm", command: null },
              { kind: "review", name: "review", command: null },
              { kind: "codex", name: "codex", command: null }
            ]
          }
        ]
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn().mockResolvedValue([
          { name: "xxvisa-pm", currentCommand: "codex" },
          { name: "xxvisa-review", currentCommand: "claude" },
          { name: "xxvisa-codex", currentCommand: "codex" }
        ]),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput,
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const response = await request(app)
      .post("/api/kanban/projects/xxvisa/messages")
      .send({
        fromSession: "xxvisa-pm",
        kind: "task",
        target: { type: "others" },
        body: "Please review checkout."
      });

    expect(response.status).toBe(201);
    expect(response.body.message.status).toBe("partial");
    expect(response.body.message.deliveries).toEqual([
      { sessionName: "xxvisa-review", status: "sent", mode: "agent-input" },
      {
        sessionName: "xxvisa-codex",
        status: "failed",
        mode: "agent-input",
        error: "tmux target missing"
      }
    ]);
  });

  it("scans pending kanban group message targets for structured replies", async () => {
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const captureRecentOutput = vi.fn().mockResolvedValue(`
[tmux-ui:reply]
id: gm-20260620-0001
from: xxvisa-review
status: done
body:
Reviewed and approved.
[/tmux-ui:reply]
`);
    const preferences = {
      getPreferences: vi.fn(() => ({
        pinnedSessionNames: [],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "/srv/xxvisa",
            server: null,
            agents: [
              { kind: "pm", name: "pm", command: null },
              { kind: "review", name: "review", command: null }
            ]
          }
        ]
      })),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn(),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn().mockResolvedValue([
          { name: "xxvisa-pm", currentCommand: "codex" },
          { name: "xxvisa-review", currentCommand: "claude" }
        ]),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput,
        captureRecentOutput,
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    const created = await request(app)
      .post("/api/kanban/projects/xxvisa/messages")
      .send({
        fromSession: "xxvisa-pm",
        kind: "task",
        target: { type: "session", sessionName: "xxvisa-review" },
        body: "Please review checkout."
      });
    const messageId = created.body.message.id;
    captureRecentOutput.mockResolvedValue(`
[tmux-ui:reply]
id: ${messageId}
from: xxvisa-review
status: done
body:
Reviewed and approved.
[/tmux-ui:reply]
`);

    const response = await request(app).post(
      `/api/kanban/projects/xxvisa/messages/${messageId}/scan`
    );

    expect(response.status).toBe(200);
    expect(captureRecentOutput).toHaveBeenCalledWith("xxvisa-review", 300);
    expect(response.body.message).toMatchObject({
      id: messageId,
      status: "replied",
      replies: [
        {
          messageId,
          fromSession: "xxvisa-review",
          status: "done",
          body: "Reviewed and approved."
        }
      ]
    });
  });

  it("removes group messages when a kanban project is deleted", async () => {
    const preferencesState = {
      pinnedSessionNames: [],
      mutedSessionNames: ["tmux-ui"],
      sessionSettings: {},
      kanbanProjects: [
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: [
            { kind: "pm", name: "pm", command: null },
            { kind: "review", name: "review", command: null }
          ]
        }
      ]
    };
    const preferences = {
      getPreferences: vi.fn(() => preferencesState),
      setPinnedSession: vi.fn(),
      setMutedSession: vi.fn(),
      setSessionSettings: vi.fn(),
      upsertKanbanProject: vi.fn(),
      deleteKanbanProject: vi.fn().mockImplementation(async (projectName: string) => {
        preferencesState.kanbanProjects =
          preferencesState.kanbanProjects.filter(
            (project) => project.name !== projectName
          );
        return preferencesState;
      }),
      addKanbanSession: vi.fn(),
      removeKanbanSession: vi.fn(),
      syncKanbanSessions: vi.fn(),
      renameSession: vi.fn()
    };
    const app = createApp({
      preferences,
      tmuxService: {
        listSessions: vi.fn().mockResolvedValue([
          { name: "xxvisa-pm", currentCommand: "codex" },
          { name: "xxvisa-review", currentCommand: "claude" }
        ]),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        createProjectSessions: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput: vi.fn(),
        sendLiteralInput: vi.fn().mockResolvedValue(undefined),
        captureRecentOutput: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn()
      }
    });

    await request(app)
      .post("/api/kanban/projects/xxvisa/messages")
      .send({
        fromSession: "xxvisa-pm",
        kind: "task",
        target: { type: "session", sessionName: "xxvisa-review" },
        body: "Please review checkout."
      });
    await request(app).delete("/api/kanban/projects/xxvisa");
    const response = await request(app).get(
      "/api/kanban/projects/xxvisa/messages"
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Kanban project not found" });
  });
});
