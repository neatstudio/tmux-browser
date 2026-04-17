import express from "express";

import { createTmuxService, type TmuxService } from "./services/tmux/createTmuxService";
import { createSessionRoutes } from "./routes/sessionRoutes";

export function createApp(tmuxService: TmuxService = createTmuxService()) {
  const app = express();

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/sessions", createSessionRoutes(tmuxService));

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message =
        error instanceof Error ? error.message : "Unexpected server error";
      const statusCode = message === "Invalid tmux session name" ? 400 : 500;

      res.status(statusCode).json({ error: message });
    }
  );

  return app;
}
