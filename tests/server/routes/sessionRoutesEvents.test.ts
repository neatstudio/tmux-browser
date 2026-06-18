import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createAppEventHub } from "../../../src/server/services/events/createAppEventHub";
import { createSessionRoutes } from "../../../src/server/routes/sessionRoutes";

describe("session route app events", () => {
  it("publishes session invalidation events after mutating operations", async () => {
    const app = express();
    const eventHub = createAppEventHub();
    const events: unknown[] = [];
    eventHub.subscribe((event) => events.push(event));
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn().mockResolvedValue(undefined),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn(),
        eventHub
      })
    );

    await request(app).post("/api/sessions").send({ name: "build" }).expect(201);

    expect(events).toMatchObject([
      {
        type: "sessions-invalidated",
        reason: "session-created",
        sessionName: "build"
      }
    ]);
  });

  it("removes killed sessions from kanban preferences", async () => {
    const app = express();
    const preferences = {
      removeKanbanSession: vi.fn().mockResolvedValue(undefined),
      renameSession: vi.fn()
    };

    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        getSessionStatus: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn(),
        preferences
      })
    );

    await request(app).delete("/api/sessions/xxvisa-codex").expect(204);

    expect(preferences.removeKanbanSession).toHaveBeenCalledWith("xxvisa-codex");
  });
});
