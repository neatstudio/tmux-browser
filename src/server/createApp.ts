import express from "express";
import { createReadStream, existsSync } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, relative, resolve } from "node:path";

import {
  createTmuxService,
  type TmuxService
} from "./services/tmux/createTmuxService.js";
import { createSessionRoutes } from "./routes/sessionRoutes.js";
import {
  getServerStatus,
  type ServerStatus
} from "./services/serverStatus/getServerStatus.js";
import { getAppInfo, type AppInfo } from "./services/appInfo/getAppInfo.js";
import {
  ImageUploadError,
  saveUploadedImage
} from "./services/uploads/imageUploadService.js";
import {
  fetchRemoteImage,
} from "./services/uploads/remoteImageUploadService.js";
import {
  createTimelineStore,
  type TimelineStore
} from "./services/timeline/createTimelineStore.js";
import type { AppEventHub } from "./services/events/createAppEventHub.js";
import {
  createPreferenceStore,
  type KanbanProject,
  type PreferenceStore
} from "./services/preferences/createPreferenceStore.js";
import {
  getDefaultKanbanSelectedSessionNames
} from "../shared/kanbanTemplates.js";

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#15181c"/><path d="M14 14h36v10H37v28H27V24H14z" fill="#b7ffb0"/></svg>`;
const IMAGE_MIME_TYPES = new Map([
  [".apng", "image/apng"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

function stripPreview<T extends { preview?: string | null }>(session: T) {
  const { preview: _preview, ...lightweightSession } = session;

  return lightweightSession;
}

function parseSessionNameList(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  return [...new Set(value.split(",").map((name) => name.trim()).filter(Boolean))];
}

function optionalSessionNameList(value: unknown) {
  const names = parseSessionNameList(value);

  return names.length > 0 ? names : undefined;
}

function normalizeSelectedAgentNames(value: unknown) {
  if (!Array.isArray(value)) {
    return getDefaultKanbanSelectedSessionNames();
  }

  return [
    ...new Set(
      value
        .filter((agentName): agentName is string => typeof agentName === "string")
        .map((agentName) => agentName.trim())
        .filter(Boolean)
    )
  ];
}

function normalizeKanbanProjectPayload(body: unknown): {
  project: KanbanProject;
  selectedAgentNames: string[];
} {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const path = typeof payload.path === "string" ? payload.path.trim() : "";
  const server =
    typeof payload.server === "string" && payload.server.trim()
      ? payload.server.trim()
      : null;
  const selectedAgentNames = normalizeSelectedAgentNames(payload.selectedAgentNames);
  const agents = Array.isArray(payload.agents)
    ? payload.agents
        .map((agent) => {
          if (!agent || typeof agent !== "object") {
            return null;
          }

          const agentRecord = agent as Record<string, unknown>;
          const kind =
            typeof agentRecord.kind === "string" ? agentRecord.kind.trim() : "";
          const agentName =
            typeof agentRecord.name === "string" ? agentRecord.name.trim() : "";
          const command =
            typeof agentRecord.command === "string" && agentRecord.command.trim()
              ? agentRecord.command.trim()
              : null;
          const sessionName =
            typeof agentRecord.sessionName === "string" &&
            agentRecord.sessionName.trim()
              ? agentRecord.sessionName.trim()
              : undefined;

          if (!kind || !agentName) {
            return null;
          }

          return {
            kind,
            name: agentName,
            command,
            ...(sessionName ? { sessionName } : {})
          };
        })
        .filter((agent): agent is KanbanProject["agents"][number] => agent !== null)
    : [];

  if (!name || !path) {
    throw new HttpError("Kanban project requires name and path", 400);
  }

  return {
    project: {
      name,
      path,
      server,
      agents
    },
    selectedAgentNames
  };
}

function normalizeSessionNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getKanbanAgentSessionName(projectName: string, agentName: string) {
  const normalizedProjectName = normalizeSessionNamePart(projectName);
  const normalizedAgentName = normalizeSessionNamePart(agentName);

  if (!normalizedProjectName || !normalizedAgentName) {
    throw new HttpError("Invalid kanban session name", 400);
  }

  return `${normalizedProjectName}-${normalizedAgentName}`;
}

function resolvePreviewImagePath(imagePath: string, basePath: string | undefined) {
  const trimmedPath = imagePath.trim();

  if (!trimmedPath) {
    throw new HttpError("Image path is required", 400);
  }

  if (trimmedPath.startsWith("~/")) {
    return resolve(homedir(), trimmedPath.slice(2));
  }

  if (isAbsolute(trimmedPath)) {
    return resolve(trimmedPath);
  }

  return resolve(basePath?.trim() || process.cwd(), trimmedPath);
}

function getImagePreviewRoots(optionRoots: string[] | undefined) {
  const envRoots = process.env.TMUX_UI_IMAGE_ROOTS?.split(",")
    .map((root) => root.trim())
    .filter(Boolean);
  const roots = optionRoots?.length ? optionRoots : envRoots?.length ? envRoots : [homedir()];

  return roots.map((root) => resolve(root));
}

function isPathInsideRoot(path: string, root: string) {
  const pathRelativeToRoot = relative(root, path);

  return (
    pathRelativeToRoot === "" ||
    (!pathRelativeToRoot.startsWith("..") && !isAbsolute(pathRelativeToRoot))
  );
}

async function getRealPreviewRoots(roots: string[]) {
  return Promise.all(
    roots.map(async (root) => {
      try {
        return await realpath(root);
      } catch {
        return root;
      }
    })
  );
}

async function resolvePreviewImageFile(
  imagePath: string,
  basePath: string | undefined,
  roots: string[]
) {
  const resolvedPath = resolvePreviewImagePath(imagePath, basePath);
  const extension = extname(resolvedPath).toLowerCase();
  const contentType = IMAGE_MIME_TYPES.get(extension);

  if (!contentType) {
    throw new HttpError("Unsupported image type", 415);
  }

  let linkStats;

  try {
    linkStats = await lstat(resolvedPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      throw new HttpError("Image not found", 404);
    }

    throw error;
  }

  if (linkStats.isSymbolicLink()) {
    throw new HttpError("Image symlinks are not allowed", 403);
  }

  if (!linkStats.isFile()) {
    throw new HttpError("Image not found", 404);
  }

  const realPath = await realpath(resolvedPath);
  const realRoots = await getRealPreviewRoots(roots);

  if (!realRoots.some((root) => isPathInsideRoot(realPath, root))) {
    throw new HttpError("Image path is outside allowed roots", 403);
  }

  const stats = await stat(realPath);

  if (!stats.isFile()) {
    throw new HttpError("Image not found", 404);
  }

  return {
    contentType,
    path: realPath,
    size: stats.size
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getImageViewPath(req: express.Request) {
  const queryPath =
    typeof req.query.path === "string"
      ? req.query.path
      : typeof req.query.image === "string"
        ? req.query.image
        : "";

  if (queryPath) {
    return queryPath;
  }

  if (req.path.startsWith("/view/")) {
    return safeDecodeURIComponent(req.path.slice("/view/".length));
  }

  return "";
}

function getImagePreviewSrc(imagePath: string, basePath: string | undefined) {
  const params = new URLSearchParams({ path: imagePath });

  if (basePath) {
    params.set("basePath", basePath);
  }

  return `/api/image-preview?${params.toString()}`;
}

function renderImageViewPage(imagePath: string, basePath: string | undefined) {
  const escapedPath = escapeHtml(imagePath);
  const escapedBasePath = escapeHtml(basePath ?? "");
  const imageSrc = imagePath ? getImagePreviewSrc(imagePath, basePath) : "";
  const escapedImageSrc = escapeHtml(imageSrc);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tmux-ui image view</title>
  <style>
    :root { color-scheme: dark; font-family: "Iosevka Term", Menlo, "PingFang SC", monospace; background: #05080b; color: #d9e2ea; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; grid-template-rows: auto 1fr; background: radial-gradient(circle at 18% 12%, rgba(112, 255, 179, 0.12), transparent 24rem), #05080b; }
    header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.75rem; align-items: center; padding: 0.55rem 0.75rem; border-bottom: 1px solid rgba(217, 226, 234, 0.16); background: rgba(16, 22, 28, 0.92); }
    form { display: grid; grid-template-columns: minmax(10rem, 1fr) minmax(8rem, 0.35fr) auto; gap: 0.45rem; min-width: 0; }
    input, button, a { border: 1px solid rgba(217, 226, 234, 0.24); border-radius: 3px; background: rgba(255, 255, 255, 0.075); color: #eff6fc; font: inherit; font-size: 0.78rem; min-height: 30px; padding: 0.28rem 0.5rem; }
    input { min-width: 0; background: rgba(0, 0, 0, 0.24); }
    button, a { cursor: pointer; font-weight: 700; text-decoration: none; }
    main { min-height: 0; overflow: auto; display: grid; place-items: center; padding: 0.75rem; background-image: linear-gradient(45deg, rgba(255,255,255,.035) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,.035) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,.035) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.035) 75%); background-size: 24px 24px; background-position: 0 0, 0 12px, 12px -12px, -12px 0; }
    img { max-width: 100%; max-height: calc(100vh - 4.4rem); object-fit: contain; box-shadow: 0 16px 70px rgba(0,0,0,.35); }
    .empty, .error { border: 1px solid rgba(217, 226, 234, 0.18); border-radius: 4px; background: rgba(16, 22, 28, 0.88); padding: 1rem; color: rgba(217, 226, 234, 0.76); }
    .error { display: none; color: #ffae98; border-color: rgba(255, 174, 152, 0.32); }
    body.image-error .error { display: block; }
    body.image-error img { display: none; }
    @media (max-width: 720px) { header { grid-template-columns: 1fr; } form { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <form method="get" action="/view">
      <input name="path" value="${escapedPath}" placeholder="/tmp/example.png or ./dist/image.png" autofocus>
      <input name="basePath" value="${escapedBasePath}" placeholder="base path optional">
      <button type="submit">View</button>
    </form>
    ${imagePath ? `<a href="${escapedImageSrc}" target="_blank" rel="noreferrer">Raw</a>` : ""}
  </header>
  <main>
    ${
      imagePath
        ? `<img src="${escapedImageSrc}" alt="${escapedPath}" onerror="document.body.classList.add('image-error')"><div class="error">Image failed to load: ${escapedPath}</div>`
        : `<div class="empty">Open an image with <code>/view?path=/tmp/example.png</code> or <code>/view/%2Ftmp%2Fexample.png</code>.</div>`
    }
  </main>
</body>
</html>`;
}

export function createApp(options: {
  tmuxService?: TmuxService;
  killSession?: (name: string) => Promise<void>;
  getServerStatus?: () => ServerStatus;
  getAppInfo?: () => AppInfo;
  imagePreviewRoots?: string[];
  uploadDir?: string;
  uploadRetentionMs?: number;
  uploadMaxTotalBytes?: number;
  fetchRemoteImage?: (url: string) => Promise<Buffer>;
  timelineStore?: TimelineStore;
  eventHub?: AppEventHub;
  preferences?: PreferenceStore;
} = {}) {
  const tmuxService = options.tmuxService ?? createTmuxService();
  const readServerStatus = options.getServerStatus ?? getServerStatus;
  const readAppInfo = options.getAppInfo ?? getAppInfo;
  const timelineStore = options.timelineStore ?? createTimelineStore();
  const preferences = options.preferences ?? createPreferenceStore();
  const imagePreviewRoots = getImagePreviewRoots(options.imagePreviewRoots);
  const uploadOptions = {
    uploadDir: options.uploadDir,
    retentionMs: options.uploadRetentionMs,
    maxTotalBytes: options.uploadMaxTotalBytes
  };
  const fetchRemoteImageBody = options.fetchRemoteImage ?? fetchRemoteImage;
  const app = express();
  const clientDistDir = resolve(process.cwd(), "dist/client");

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ...readAppInfo() });
  });

  app.get("/favicon.ico", (_req, res) => {
    res
      .status(200)
      .type("image/svg+xml")
      .set("Cache-Control", "public, max-age=86400")
      .end(faviconSvg);
  });

  app.get("/favicon.svg", (_req, res) => {
    res
      .status(200)
      .type("image/svg+xml")
      .set("Cache-Control", "public, max-age=86400")
      .end(faviconSvg);
  });

  app.get("/api/server-status", (_req, res) => {
    res.json(readServerStatus());
  });

  app.get("/api/timeline", (req, res) => {
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    res.json({ events: timelineStore.listEvents({ limit }) });
  });

  app.get("/api/preferences", (_req, res) => {
    res.json(preferences.getPreferences());
  });

  app.patch("/api/preferences/pinned-sessions/:name", async (req, res, next) => {
    try {
      await preferences.setPinnedSession(
        req.params.name,
        req.body.pinned === true
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/preferences/muted-sessions/:name", async (req, res, next) => {
    try {
      await preferences.setMutedSession(req.params.name, req.body.muted === true);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/preferences/session-settings/:name", async (req, res, next) => {
    try {
      await preferences.setSessionSettings(req.params.name, req.body.settings);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/kanban/projects", async (_req, res, next) => {
    try {
      const sessions = await tmuxService.listSessions({ includePreview: false });
      const nextPreferences = await preferences.syncKanbanSessions(
        sessions.map((session) => session.name)
      );

      res.json({ projects: nextPreferences.kanbanProjects });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kanban/projects", async (req, res, next) => {
    try {
      const { project, selectedAgentNames } = normalizeKanbanProjectPayload(req.body);
      const selectedAgents = project.agents.filter((agent) =>
        selectedAgentNames.includes(agent.name)
      );
      const createdSessions =
        selectedAgents.length === 0
          ? []
          : await tmuxService.createProjectSessions({
              projectName: project.name,
              projectPath: project.path,
              server: project.server,
              agents: selectedAgents.map((agent) => ({
                name: agent.name,
                command: agent.command
              }))
            });
      const nextPreferences = await preferences.upsertKanbanProject(project);

      options.eventHub?.publish({
        type: "sessions-invalidated",
        reason: "session-created",
        sessionName: project.name
      });
      res.status(201).json({
        ok: true,
        sessions: createdSessions,
        preferences: nextPreferences
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/kanban/projects/:name", async (req, res, next) => {
    try {
      await preferences.deleteKanbanProject(req.params.name);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kanban/projects/:name/sessions", async (req, res, next) => {
    try {
      const sessionName =
        typeof req.body.sessionName === "string" ? req.body.sessionName.trim() : "";

      if (!sessionName) {
        throw new HttpError("Kanban session name is required", 400);
      }

      const nextPreferences = await preferences.addKanbanSession(
        req.params.name,
        sessionName
      );
      options.eventHub?.publish({
        type: "sessions-invalidated",
        reason: "session-created",
        sessionName
      });
      res.json({ ok: true, preferences: nextPreferences });
    } catch (error) {
      next(error);
    }
  });

  app.delete(
    "/api/kanban/projects/:name/sessions/:agent",
    async (req, res, next) => {
      try {
        const sessionName = req.params.agent.includes("-")
          ? req.params.agent
          : getKanbanAgentSessionName(req.params.name, req.params.agent);
        const shouldKill = req.query.kill === "true";

        if (shouldKill) {
          await (options.killSession ?? tmuxService.killSession)(sessionName);
        }

        const nextPreferences = await preferences.removeKanbanSession(sessionName);
        options.eventHub?.publish({
          type: "sessions-invalidated",
          reason: "session-killed",
          sessionName
        });
        res.json({ ok: true, preferences: nextPreferences });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/uploads/image",
    express.raw({ type: "*/*", limit: "10mb" }),
    async (req, res, next) => {
      try {
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const upload = await saveUploadedImage(
          body,
          req.header("X-Tmux-Session"),
          uploadOptions
        );

        res.status(201).json(upload);
      } catch (error) {
        if (error instanceof ImageUploadError) {
          res.status(error.statusCode).json({ error: error.message });
          return;
        }

        next(error);
      }
    }
  );

  app.post("/api/uploads/image-url", async (req, res, next) => {
    try {
      if (!req.is("application/json")) {
        throw new ImageUploadError("Image url payload must be JSON", 400);
      }

      const url = typeof req.body?.url === "string" ? req.body.url : "";
      const body = await fetchRemoteImageBody(url);
      const upload = await saveUploadedImage(
        body,
        req.header("X-Tmux-Session"),
        uploadOptions
      );

      res.status(201).json(upload);
    } catch (error) {
      if (error instanceof ImageUploadError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  app.get("/api/image-preview", async (req, res, next) => {
    try {
      const imagePath = String(req.query.path ?? "");
      const basePath =
        typeof req.query.basePath === "string" ? req.query.basePath : undefined;
      const image = await resolvePreviewImageFile(
        imagePath,
        basePath,
        imagePreviewRoots
      );

      res
        .status(200)
        .type(image.contentType)
        .set("Cache-Control", "no-store")
        .set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'")
        .set("X-Content-Type-Options", "nosniff")
        .set("X-Preview-Image-Path", image.path);
      createReadStream(image.path).pipe(res);
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  app.get("/api/image-preview-info", async (req, res, next) => {
    try {
      const imagePath = String(req.query.path ?? "");
      const basePath =
        typeof req.query.basePath === "string" ? req.query.basePath : undefined;
      const image = await resolvePreviewImageFile(
        imagePath,
        basePath,
        imagePreviewRoots
      );

      res.status(200).json({
        ok: true,
        path: image.path,
        contentType: image.contentType,
        size: image.size
      });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({ ok: false, error: error.message });
        return;
      }

      next(error);
    }
  });

  app.get(/^\/view(?:\/.*)?$/, (req, res) => {
    const imagePath = getImageViewPath(req);
    const basePath =
      typeof req.query.basePath === "string" ? req.query.basePath : undefined;

    res
      .status(200)
      .type("html")
      .set("Cache-Control", "no-store")
      .send(renderImageViewPage(imagePath, basePath));
  });

  app.get("/api/sessions-all", async (req, res, next) => {
    try {
      res.json(
        await tmuxService.listSessions({
          includePreview: true,
          includePanes: true,
          includeInputPrompt: true,
          ...(optionalSessionNameList(req.query.only)
            ? { onlySessionNames: optionalSessionNameList(req.query.only) }
            : {})
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions-panes", async (req, res, next) => {
    try {
      res.json(
        (
          await tmuxService.listSessions({
            includePreview: false,
            includePanes: true,
            includeInputPrompt: true,
            ...(optionalSessionNameList(req.query.muted)
              ? { mutedSessionNames: optionalSessionNameList(req.query.muted) }
              : {})
          })
        ).map(stripPreview)
      );
    } catch (error) {
      next(error);
    }
  });

  app.use(
    "/api/sessions",
    createSessionRoutes({
      listSessions: tmuxService.listSessions,
      getSessionStatus: tmuxService.getSessionStatus,
      createSession: tmuxService.createSession,
      renameSession: tmuxService.renameSession,
      killSession: options.killSession ?? tmuxService.killSession,
      sendCommand: tmuxService.sendCommand,
      sendInput: tmuxService.sendInput,
      splitPane: tmuxService.splitPane,
      selectPane: tmuxService.selectPane,
      killPane: tmuxService.killPane,
      timeline: timelineStore,
      eventHub: options.eventHub,
      preferences
    })
  );

  if (existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));

    app.get("/{*path}", (_req, res, next) => {
      if (_req.path.startsWith("/api/") || _req.path.startsWith("/ws/")) {
        next();
        return;
      }

      res.sendFile(resolve(clientDistDir, "index.html"));
    });
  }

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message =
        error instanceof Error ? error.message : "Unexpected server error";
      const explicitStatusCode =
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : null;
      const statusCode =
        explicitStatusCode ??
        (error instanceof HttpError
          ? error.statusCode
          : message === "Invalid tmux session name" ||
              message === "Invalid tmux pane id" ||
              message === "Image path is required" ||
              message === "Cannot kill the only pane" ||
              message === "Pane does not belong to session" ||
              message === "Tmux session not found"
            ? 400
            : 500);

      res.status(statusCode).json({ error: message });
    }
  );

  return app;
}
