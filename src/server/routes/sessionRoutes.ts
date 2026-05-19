import { Router } from "express";

import type {
  SplitPaneDirection,
  TmuxService
} from "../services/tmux/createTmuxService.js";

type SessionRoutesDeps = Pick<
  TmuxService,
  | "listSessions"
  | "getSessionStatus"
  | "createSession"
  | "renameSession"
  | "killSession"
  | "sendCommand"
  | "splitPane"
  | "selectPane"
  | "killPane"
>;

function parseSplitPaneDirection(direction: unknown): SplitPaneDirection {
  if (direction === "horizontal" || direction === "vertical") {
    return direction;
  }

  throw new Error("Invalid split pane direction");
}

function stripPreview<T extends { preview?: string | null }>(session: T) {
  const {
    preview: _preview,
    panes: _panes,
    ...lightweightSession
  } = session as T & { panes?: unknown };

  return lightweightSession;
}

function stripPreviewOnly<T extends { preview?: string | null }>(session: T) {
  const { preview: _preview, ...statusSession } = session;

  return statusSession;
}

export function createSessionRoutes(deps: SessionRoutesDeps): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const sessions = await deps.listSessions();
      res.json(sessions.map(stripPreview));
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

  router.get("/:name/status", async (req, res, next) => {
    try {
      res.json(stripPreviewOnly(await deps.getSessionStatus(req.params.name)));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:name", async (req, res, next) => {
    try {
      await deps.renameSession(req.params.name, req.body.name);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:name/send", async (req, res, next) => {
    try {
      await deps.sendCommand(req.params.name, req.body.command);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:name/split", async (req, res, next) => {
    try {
      await deps.splitPane(
        req.params.name,
        parseSplitPaneDirection(req.body.direction)
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:name/select-pane", async (req, res, next) => {
    try {
      await deps.selectPane(req.params.name, req.body.paneId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:name/panes/:paneId", async (req, res, next) => {
    try {
      await deps.killPane(req.params.name, req.params.paneId);
      res.status(204).send();
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
