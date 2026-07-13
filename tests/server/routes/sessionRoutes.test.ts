import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createSessionRoutes } from "../../../src/server/routes/sessionRoutes";

describe("sessionRoutes", () => {
  it("returns session rows from the tmux service", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi
          .fn()
          .mockResolvedValue([{ name: "build", windows: 2, status: "attached" }]),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn(),
        getSessionStatus: vi.fn()
      })
    );

    const response = await request(app).get("/api/sessions");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { name: "build", windows: 2, status: "attached" }
    ]);
    expect(response.body[0]).not.toHaveProperty("preview");
  });

  it("returns one session status with pane details", async () => {
    const app = express();
    const getSessionStatus = vi.fn().mockResolvedValue({
      name: "build",
      windows: 1,
      status: "attached",
      panes: [{ paneId: "%1" }]
    });
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn(),
        getSessionStatus
      })
    );

    const response = await request(app).get("/api/sessions/build/status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      name: "build",
      windows: 1,
      status: "attached",
      panes: [{ paneId: "%1" }]
    });
    expect(response.body).not.toHaveProperty("preview");
    expect(getSessionStatus).toHaveBeenCalledWith("build");
  });

  it("renames a session", async () => {
    const app = express();
    const renameSession = vi.fn().mockResolvedValue(undefined);
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession,
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn(),
        getSessionStatus: vi.fn()
      })
    );

    const response = await request(app)
      .patch("/api/sessions/build")
      .send({ name: "build-test" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(renameSession).toHaveBeenCalledWith("build", "build-test");
  });

  it("sends commands to a target session", async () => {
    const app = express();
    const sendCommand = vi.fn().mockResolvedValue(undefined);
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand,
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn(),
        getSessionStatus: vi.fn()
      })
    );

    const response = await request(app)
      .post("/api/sessions/build/send")
      .send({ command: "npm test" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(sendCommand).toHaveBeenCalledWith("build", "npm test");
  });

  it("sends prompt input to a target session", async () => {
    const app = express();
    const sendInput = vi.fn().mockResolvedValue(undefined);
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        sendInput,
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane: vi.fn(),
        getSessionStatus: vi.fn().mockResolvedValue({
          name: "build", paneDead: false, inputPrompt: { snippet: "Continue?", actions: [] }
        })
      })
    );

    const response = await request(app)
      .post("/api/sessions/build/input")
      .send({ input: "\u001b" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(sendInput).toHaveBeenCalledWith("build", "\u001b");
  });

  it("uses fresh prompt validation only when structured action input requires it", async () => {
    const app = express();
    const sendInput = vi.fn();
    const sendInputIfPromptAvailable = vi.fn().mockResolvedValue("unavailable");
    app.use(express.json());
    app.use("/api/sessions", createSessionRoutes({
      listSessions: vi.fn(), createSession: vi.fn(), renameSession: vi.fn(),
      killSession: vi.fn(), sendCommand: vi.fn(), sendInput, sendInputIfPromptAvailable,
      splitPane: vi.fn(), selectPane: vi.fn(), killPane: vi.fn(), getSessionStatus: vi.fn()
    }));
    const response = await request(app).post("/api/sessions/build/input")
      .send({ input: "y\r", requirePrompt: true });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "target_session_unavailable" });
    expect(sendInputIfPromptAvailable).toHaveBeenCalledWith("build", "y\r");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("returns a stable 404 code when the input target no longer exists", async () => {
    const app = express();
    const sendInput = vi.fn();
    app.use(express.json());
    app.use("/api/sessions", createSessionRoutes({
      listSessions: vi.fn(), createSession: vi.fn(), renameSession: vi.fn(),
      killSession: vi.fn(), sendCommand: vi.fn(), sendInput,
      sendInputIfPromptAvailable: vi.fn().mockResolvedValue("not_found"), splitPane: vi.fn(),
      selectPane: vi.fn(), killPane: vi.fn(),
      getSessionStatus: vi.fn().mockRejectedValue(new Error("Tmux session not found"))
    }));
    const response = await request(app).post("/api/sessions/gone/input").send({ input: "y", requirePrompt: true });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: "target_session_not_found" });
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("returns a stable 409 code when the target is not waiting for input", async () => {
    const app = express();
    const sendInput = vi.fn();
    app.use(express.json());
    app.use("/api/sessions", createSessionRoutes({
      listSessions: vi.fn(), createSession: vi.fn(), renameSession: vi.fn(),
      killSession: vi.fn(), sendCommand: vi.fn(), sendInput,
      sendInputIfPromptAvailable: vi.fn().mockResolvedValue("unavailable"), splitPane: vi.fn(),
      selectPane: vi.fn(), killPane: vi.fn(),
      getSessionStatus: vi.fn().mockResolvedValue({ name: "busy", paneDead: false, inputPrompt: null })
    }));
    const response = await request(app).post("/api/sessions/busy/input").send({ input: "y", requirePrompt: true });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "target_session_unavailable" });
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("returns the stable 404 when the target disappears during send", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/sessions", createSessionRoutes({
      listSessions: vi.fn(), createSession: vi.fn(), renameSession: vi.fn(),
      killSession: vi.fn(), sendCommand: vi.fn(),
      sendInput: vi.fn(),
      sendInputIfPromptAvailable: vi.fn().mockResolvedValue("not_found"),
      splitPane: vi.fn(), selectPane: vi.fn(), killPane: vi.fn(),
      getSessionStatus: vi.fn().mockResolvedValue({
        name: "vanished", paneDead: false, inputPrompt: { snippet: "Continue?", actions: [] }
      })
    }));
    const response = await request(app).post("/api/sessions/vanished/input").send({ input: "y", requirePrompt: true });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ code: "target_session_not_found" });
  });

  it("splits a target session pane", async () => {
    const app = express();
    const splitPane = vi.fn().mockResolvedValue(undefined);
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane,
        selectPane: vi.fn(),
        killPane: vi.fn(),
        getSessionStatus: vi.fn()
      })
    );

    const response = await request(app)
      .post("/api/sessions/build/split")
      .send({ direction: "horizontal" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(splitPane).toHaveBeenCalledWith("build", "horizontal");
  });

  it("selects a target pane inside a session", async () => {
    const app = express();
    const selectPane = vi.fn().mockResolvedValue(undefined);
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane,
        killPane: vi.fn(),
        getSessionStatus: vi.fn()
      })
    );

    const response = await request(app)
      .post("/api/sessions/build/select-pane")
      .send({ paneId: "%2" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(selectPane).toHaveBeenCalledWith("build", "%2");
  });

  it("kills a target pane inside a session", async () => {
    const app = express();
    const killPane = vi.fn().mockResolvedValue(undefined);
    app.use(express.json());
    app.use(
      "/api/sessions",
      createSessionRoutes({
        listSessions: vi.fn(),
        createSession: vi.fn(),
        renameSession: vi.fn(),
        killSession: vi.fn(),
        sendCommand: vi.fn(),
        splitPane: vi.fn(),
        selectPane: vi.fn(),
        killPane,
        getSessionStatus: vi.fn()
      })
    );

    const response = await request(app)
      .delete("/api/sessions/build/panes/%252")
      .send();

    expect(response.status).toBe(204);
    expect(killPane).toHaveBeenCalledWith("build", "%2");
  });
});
