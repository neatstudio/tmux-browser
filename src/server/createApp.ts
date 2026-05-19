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
