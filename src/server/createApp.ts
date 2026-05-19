import express from "express";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, resolve } from "node:path";

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

function stripPreview<T extends { preview?: string | null }>(session: T) {
  const { preview: _preview, ...lightweightSession } = session;

  return lightweightSession;
}

function resolvePreviewImagePath(imagePath: string, basePath: string | undefined) {
  const trimmedPath = imagePath.trim();

  if (!trimmedPath) {
    throw new Error("Image path is required");
  }

  if (trimmedPath.startsWith("~/")) {
    return resolve(homedir(), trimmedPath.slice(2));
  }

  if (isAbsolute(trimmedPath)) {
    return resolve(trimmedPath);
  }

  return resolve(basePath?.trim() || process.cwd(), trimmedPath);
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
} = {}) {
  const tmuxService = options.tmuxService ?? createTmuxService();
  const readServerStatus = options.getServerStatus ?? getServerStatus;
  const readAppInfo = options.getAppInfo ?? getAppInfo;
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

  app.get("/api/image-preview", async (req, res, next) => {
    try {
      const imagePath = String(req.query.path ?? "");
      const basePath =
        typeof req.query.basePath === "string" ? req.query.basePath : undefined;
      const resolvedPath = resolvePreviewImagePath(imagePath, basePath);
      const extension = extname(resolvedPath).toLowerCase();
      const contentType = IMAGE_MIME_TYPES.get(extension);

      if (!contentType) {
        res.status(415).json({ error: "Unsupported image type" });
        return;
      }

      const stats = await stat(resolvedPath);

      if (!stats.isFile()) {
        res.status(404).json({ error: "Image not found" });
        return;
      }

      res
        .status(200)
        .type(contentType)
        .set("Cache-Control", "no-store")
        .set("X-Preview-Image-Path", resolvedPath);
      createReadStream(resolvedPath).pipe(res);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        res.status(404).json({ error: "Image not found" });
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

  app.get("/api/sessions-all", async (_req, res, next) => {
    try {
      res.json(
        await tmuxService.listSessions({
          includePreview: true,
          includePanes: true
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions-panes", async (_req, res, next) => {
    try {
      res.json(
        (
          await tmuxService.listSessions({
            includePreview: false,
            includePanes: true
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
      splitPane: tmuxService.splitPane,
      selectPane: tmuxService.selectPane,
      killPane: tmuxService.killPane
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
      const statusCode =
        message === "Invalid tmux session name" ||
        message === "Invalid tmux pane id" ||
        message === "Image path is required" ||
        message === "Cannot kill the only pane" ||
        message === "Pane does not belong to session" ||
        message === "Tmux session not found"
          ? 400
          : 500;

      res.status(statusCode).json({ error: message });
    }
  );

  return app;
}
