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

  it("loads recent timeline events", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          events: [
            {
              id: "1",
              type: "session-created",
              sessionName: "build",
              message: "created session build",
              createdAt: "2026-05-24T03:00:00.000Z"
            }
          ]
        })
    });
    vi.stubGlobal("fetch", fetch);

    await expect(createSessionApi().listTimelineEvents(8)).resolves.toEqual([
      {
        id: "1",
        type: "session-created",
        sessionName: "build",
        message: "created session build",
        createdAt: "2026-05-24T03:00:00.000Z"
      }
    ]);

    expect(fetch).toHaveBeenCalledWith("/api/timeline?limit=8");
  });

  it("loads and updates server-backed preferences", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            pinnedSessionNames: ["build"],
            mutedSessionNames: ["tmux-ui"],
            sessionSettings: {
              build: {
                fontSize: 16,
                fontFamily: "Menlo, monospace",
                lineHeight: 1.2,
                themeId: "paper"
              }
            }
          })
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const api = createSessionApi();

    await expect(api.getPreferences()).resolves.toEqual({
      pinnedSessionNames: ["build"],
      mutedSessionNames: ["tmux-ui"],
      sessionSettings: {
        build: {
          fontSize: 16,
          fontFamily: "Menlo, monospace",
          lineHeight: 1.2,
          themeId: "paper"
        }
      }
    });
    await api.setPinnedSession("build", false);
    await api.setMutedSession("tmux-ui", false);
    await api.setSessionSettings("build", {
      fontSize: 18,
      fontFamily: "Menlo, monospace",
      lineHeight: 1.35,
      themeId: "solar"
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/preferences");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/preferences/pinned-sessions/build",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ pinned: false })
      }
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/preferences/muted-sessions/tmux-ui",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ muted: false })
      }
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/preferences/session-settings/build",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          settings: {
            fontSize: 18,
            fontFamily: "Menlo, monospace",
            lineHeight: 1.35,
            themeId: "solar"
          }
        })
      }
    );
  });

  it("loads and creates kanban projects", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            projects: [
              {
                name: "xxvisa",
                path: "/srv/xxvisa",
                server: "tw1",
                agents: [
                  {
                    kind: "claude",
                    name: "claude",
                    command: "claude --resume xxvisa"
                  }
                ]
              }
            ]
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            sessions: ["xxvisa-pm", "xxvisa-codex"]
          })
      });
    vi.stubGlobal("fetch", fetch);
    const api = createSessionApi();

    await expect(api.listKanbanProjects()).resolves.toEqual([
      {
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: "tw1",
        agents: [
          {
            kind: "claude",
            name: "claude",
            command: "claude --resume xxvisa"
          }
        ]
      }
    ]);
    await expect(
      api.createKanbanProject({
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: "tw1",
        selectedAgentNames: ["pm", "codex"]
      })
    ).resolves.toEqual(["xxvisa-pm", "xxvisa-codex"]);

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/kanban/projects");
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/kanban/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "xxvisa",
        path: "/srv/xxvisa",
        server: "tw1",
        selectedAgentNames: ["pm", "codex"],
        agents: [
          { kind: "pm", name: "pm", command: null },
          { kind: "review", name: "review", command: null },
          { kind: "codex", name: "codex", command: null },
          { kind: "claude", name: "claude", command: null },
          { kind: "scratch", name: "scratch", command: null }
        ]
      })
    });
  });

  it("removes, kills, and deletes kanban projects", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, preferences: {} })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, preferences: {} })
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetch);
    const api = createSessionApi();

    await api.removeKanbanSession("xxvisa", "codex", { kill: false });
    await api.removeKanbanSession("xxvisa", "pm", { kill: true });
    await api.deleteKanbanProject("xxvisa");

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/kanban/projects/xxvisa/sessions/codex?kill=false",
      { method: "DELETE" }
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/kanban/projects/xxvisa/sessions/pm?kill=true",
      { method: "DELETE" }
    );
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/kanban/projects/xxvisa", {
      method: "DELETE"
    });
  });

  it("adds an existing session to a kanban project", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, preferences: {} })
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().addKanbanSession("xxvisa", "local-ssh");

    expect(fetch).toHaveBeenCalledWith("/api/kanban/projects/xxvisa/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sessionName: "local-ssh" })
    });
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

  it("loads pane-aware sessions with muted session names", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { name: "build", windows: 1, status: "attached", panes: [] }
        ])
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().listPaneSessions(["tmux-ui", "background logs"]);

    expect(fetch).toHaveBeenCalledWith(
      "/api/sessions-panes?muted=tmux-ui%2Cbackground+logs"
    );
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

  it("sends raw prompt input to a tmux session", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true
    });
    vi.stubGlobal("fetch", fetch);

    await createSessionApi().sendInput("build", "\u001b");

    expect(fetch).toHaveBeenCalledWith("/api/sessions/build/input", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ input: "\u001b" })
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
