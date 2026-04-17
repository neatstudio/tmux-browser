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
        listSessions: vi.fn().mockResolvedValue([{ name: "build", windows: 2 }]),
        createSession: vi.fn(),
        killSession: vi.fn()
      })
    );

    const response = await request(app).get("/api/sessions");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ name: "build", windows: 2 }]);
  });
});
