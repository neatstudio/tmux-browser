import { Router } from "express";

import type { TmuxService } from "../services/tmux/createTmuxService.js";

type SessionRoutesDeps = Pick<
  TmuxService,
  "listSessions" | "createSession" | "killSession"
>;

export function createSessionRoutes(deps: SessionRoutesDeps): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await deps.listSessions());
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      await deps.createSession(req.body.name);
      res.status(201).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:name", async (req, res, next) => {
    try {
      await deps.killSession(req.params.name);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
