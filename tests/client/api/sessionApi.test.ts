import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionApi } from "../../../src/client/api/sessionApi";

describe("createSessionApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads server status for the dashboard header", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          platform: "linux",
          cpuCount: 4,
          loadAverage: [1, 0.5, 0.25],
          loadPercent: 25,
          memoryTotalBytes: 1024,
          memoryFreeBytes: 512,
          memoryUsedPercent: 50,
          uptimeSeconds: 60,
          homeDirectory: "/home/app"
        })
    });
    vi.stubGlobal("fetch", fetch);

    await expect(createSessionApi().getServerStatus()).resolves.toMatchObject({
      platform: "linux",
      memoryUsedPercent: 50,
      homeDirectory: "/home/app"
    });

    expect(fetch).toHaveBeenCalledWith("/api/server-status");
  });

  it("loads lightweight sessions without previews by default", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "build", windows: 1, status: "attached", preview: null }
        ])
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().listSessions();

    expect(fetch).toHaveBeenCalledWith("/api/sessions");
  });

  it("loads dashboard sessions from the preview-enabled endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "build", windows: 1, status: "attached", preview: "npm run dev" }
        ])
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().listDashboardSessions();

    expect(fetch).toHaveBeenCalledWith("/api/sessions-all");
  });

  it("loads pane-aware sessions without previews", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "build", windows: 1, status: "attached", panes: [] }
        ])
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().listPaneSessions();

    expect(fetch).toHaveBeenCalledWith("/api/sessions-panes");
  });

  it("loads one session status without server status polling", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: "build",
          windows: 1,
          status: "attached",
          panes: [{ paneId: "%1" }]
        })
    });
    vi.stubGlobal("fetch", fetch);

    await expect(createSessionApi().getSessionStatus("build")).resolves.toEqual({
      name: "build",
      windows: 1,
      status: "attached",
      panes: [{ paneId: "%1" }]
    });

    expect(fetch).toHaveBeenCalledWith("/api/sessions/build/status");
  });

  it("sends a command to a tmux session", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().sendCommand("build", "npm test");

    expect(fetch).toHaveBeenCalledWith("/api/sessions/build/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ command: "npm test" })
    });
  });

  it("splits a tmux session pane", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().splitPane("build", "vertical");

    expect(fetch).toHaveBeenCalledWith("/api/sessions/build/split", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ direction: "vertical" })
    });
  });

  it("selects a tmux pane before opening a session", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().selectPane("build", "%2");

    expect(fetch).toHaveBeenCalledWith("/api/sessions/build/select-pane", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paneId: "%2" })
    });
  });

  it("kills a tmux pane by pane id", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().killPane("build", "%2");

    expect(fetch).toHaveBeenCalledWith("/api/sessions/build/panes/%252", {
      method: "DELETE"
    });
  });
});
