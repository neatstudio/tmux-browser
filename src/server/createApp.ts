import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  createTmuxService,
  type TmuxService
} from "./services/tmux/createTmuxService.js";
import { createSessionRoutes } from "./routes/sessionRoutes.js";
import {
  getServerStatus,
  type ServerStatus
} from "./services/serverStatus/getServerStatus.js";

function stripPreview<T extends { preview?: string | null }>(session: T) {
  const { preview: _preview, ...lightweightSession } = session;

  return lightweightSession;
}

export function createApp(options: {
  tmuxService?: TmuxService;
  killSession?: (name: string) => Promise<void>;
  getServerStatus?: () => ServerStatus;
} = {}) {
  const tmuxService = options.tmuxService ?? createTmuxService();
  const readServerStatus = options.getServerStatus ?? getServerStatus;
  const app = express();
  const clientDistDir = resolve(process.cwd(), "dist/client");

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/server-status", (_req, res) => {
    res.json(readServerStatus());
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
