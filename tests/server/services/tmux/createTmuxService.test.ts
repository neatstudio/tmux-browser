import { describe, expect, it, vi } from "vitest";

import { createTmuxService } from "../../../../src/server/services/tmux/createTmuxService";

describe("createTmuxService", () => {
  it("lists lightweight sessions without capturing pane previews by default", async () => {
    const getGitSummary = vi
      .fn()
      .mockResolvedValueOnce({ branch: "main", dirty: true })
      .mockResolvedValueOnce(null);
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t2\t1\t1714200000\nops\t1\t0\t1714200060",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout:
          "build\t%1\t0\tserver\t1\t0\t1\tnpm\t/tmp/project\t0\t\t100\nops\t%2\t0\tzsh\t1\t0\t1\tzsh\t/tmp/ops\t0\t\t101",
        stderr: ""
      });
    const service = createTmuxService({ run, getGitSummary });

    await expect(service.listSessions()).resolves.toEqual([
      {
        name: "build",
        windows: 2,
        status: "attached",
        lastActivityAt: 1714200000,
        paneCount: 1,
        activeWindowName: "server",
        currentCommand: "npm",
        currentPath: "/tmp/project",
        gitBranch: "main",
        gitDirty: true,
        paneDead: false,
        paneDeadStatus: null,
        preview: null,
        inputPrompt: null
      },
      {
        name: "ops",
        windows: 1,
        status: "detached",
        lastActivityAt: 1714200060,
        paneCount: 1,
        activeWindowName: "zsh",
        currentCommand: "zsh",
        currentPath: "/tmp/ops",
        gitBranch: null,
        gitDirty: null,
        paneDead: false,
        paneDeadStatus: null,
        preview: null,
        inputPrompt: null
      }
    ]);
    expect(run).toHaveBeenNthCalledWith(1, "list-sessions", [
      "-F",
      "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "list-panes", [
      "-a",
      "-F",
      "#{session_name}\t#{pane_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{pane_index}\t#{pane_active}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}"
    ]);
    expect(run.mock.calls.filter(([command]) => command === "capture-pane")).toHaveLength(0);
    expect(getGitSummary).toHaveBeenNthCalledWith(1, "/tmp/project");
    expect(getGitSummary).toHaveBeenNthCalledWith(2, "/tmp/ops");
  });

  it("captures pane previews only when explicitly requested", async () => {
    const longPreview = Array.from({ length: 30 }, (_, index) => `line-${index + 1}`).join("\n");
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/tmp/project\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: `${longPreview}\n`,
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue(null)
    });

    await expect(service.listSessions({ includePreview: true })).resolves.toMatchObject([
      {
        name: "build",
        preview: Array.from({ length: 20 }, (_, index) => `line-${index + 11}`).join("\n")
      }
    ]);
    expect(run).toHaveBeenNthCalledWith(3, "capture-pane", [
      "-p",
      "-t",
      "build",
      "-S",
      "-20"
    ]);
  });

  it("detects input prompts from captured panes when requested", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tcodex\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout:
          "1. Yes, proceed (y)\n2. Yes, and don't ask again for these files (a)\n3. No, and tell Codex what to do differently (esc)\n",
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue(null)
    });

    await expect(
      service.listSessions({ includeInputPrompt: true })
    ).resolves.toMatchObject([
      {
        name: "build",
        inputPrompt: {
          actions: [
            { label: "y", input: "y\r" },
            { label: "a", input: "a\r" },
            { label: "esc", input: "\u001b" }
          ]
        }
      }
    ]);
    expect(run.mock.calls.filter(([command]) => command === "capture-pane")).toHaveLength(1);
  });

  it("reuses one pane capture for preview and input prompt detection", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tcodex\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout:
          "1. Yes, proceed (y)\n2. Yes, and don't ask again for these files (a)\n3. No, and tell Codex what to do differently (esc)\n",
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue(null)
    });

    await expect(
      service.listSessions({ includePreview: true, includeInputPrompt: true })
    ).resolves.toMatchObject([
      {
        name: "build",
        preview:
          "1. Yes, proceed (y)\n2. Yes, and don't ask again for these files (a)\n3. No, and tell Codex what to do differently (esc)",
        inputPrompt: {
          actions: [
            { label: "y", input: "y\r" },
            { label: "a", input: "a\r" },
            { label: "esc", input: "\u001b" }
          ]
        }
      }
    ]);
    expect(run.mock.calls.filter(([command]) => command === "capture-pane")).toHaveLength(1);
  });

  it("caches input prompt captures for one minute", async () => {
    let nowMs = 1000;
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tcodex\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "1. Yes, proceed (y)\n",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200001",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tcodex\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200065",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tcodex\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "2. Yes, and don't ask again for these files (a)\n",
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue(null),
      now: () => nowMs,
      inputPromptTtlMs: 60_000
    });

    await service.listSessions({ includeInputPrompt: true });
    nowMs = 2000;
    await service.listSessions({ includeInputPrompt: true });
    nowMs = 62_000;
    await service.listSessions({ includeInputPrompt: true });

    expect(run.mock.calls.filter(([command]) => command === "capture-pane")).toHaveLength(2);
  });

  it("creates a detached session under the user home with color-capable terminal environment", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run, homeDirectory: "/home/app" });

    await service.createSession("build");

    expect(run).toHaveBeenCalledWith("new-session", [
      "-d",
      "-c",
      "/home/app",
      "-e",
      "CLICOLOR=1",
      "-e",
      "COLORTERM=truecolor",
      "-e",
      "TERM=xterm-256color",
      "-s",
      "build"
    ]);
  });

  it("creates project agent sessions with stable names and project paths", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const service = createTmuxService({ run, homeDirectory: "/home/app" });

    await service.createProjectSessions({
      projectName: "xxvisa",
      projectPath: "/srv/xxvisa",
      agents: [
        { name: "claude", command: "claude --resume xxvisa-claude" },
        { name: "codex", command: "" },
        { name: "kiro", command: null }
      ]
    });

    expect(run).toHaveBeenNthCalledWith(1, "has-session", [
      "-t",
      "xxvisa-claude"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "new-session", [
      "-d",
      "-c",
      "/srv/xxvisa",
      "-e",
      "CLICOLOR=1",
      "-e",
      "COLORTERM=truecolor",
      "-e",
      "TERM=xterm-256color",
      "-s",
      "xxvisa-claude",
      "claude --resume xxvisa-claude"
    ]);
    expect(run).toHaveBeenNthCalledWith(3, "has-session", [
      "-t",
      "xxvisa-codex"
    ]);
    expect(run).toHaveBeenNthCalledWith(4, "new-session", [
      "-d",
      "-c",
      "/srv/xxvisa",
      "-e",
      "CLICOLOR=1",
      "-e",
      "COLORTERM=truecolor",
      "-e",
      "TERM=xterm-256color",
      "-s",
      "xxvisa-codex"
    ]);
    expect(run).toHaveBeenNthCalledWith(5, "has-session", [
      "-t",
      "xxvisa-kiro"
    ]);
    expect(run).toHaveBeenNthCalledWith(6, "new-session", [
      "-d",
      "-c",
      "/srv/xxvisa",
      "-e",
      "CLICOLOR=1",
      "-e",
      "COLORTERM=truecolor",
      "-e",
      "TERM=xterm-256color",
      "-s",
      "xxvisa-kiro"
    ]);
  });

  it("creates project agent sessions on the selected remote server", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const service = createTmuxService({ run, homeDirectory: "/home/app" });

    await service.createProjectSessions({
      projectName: "xxvisa",
      projectPath: "/srv/xxvisa",
      server: "tw1",
      agents: [{ name: "claude", command: "claude --resume xxvisa-claude" }]
    });

    expect(run).toHaveBeenNthCalledWith(1, "has-session", [
      "-t",
      "xxvisa-claude"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "new-session", [
      "-d",
      "-c",
      "/home/app",
      "-e",
      "CLICOLOR=1",
      "-e",
      "COLORTERM=truecolor",
      "-e",
      "TERM=xterm-256color",
      "-s",
      "xxvisa-claude",
      "ssh -tt tw1 'tmux new-session -A -s xxvisa-claude -c /srv/xxvisa '\\''claude --resume xxvisa-claude'\\'''"
    ]);
  });

  it("skips project agent sessions that already exist", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const service = createTmuxService({ run, homeDirectory: "/home/app" });

    await expect(
      service.createProjectSessions({
        projectName: "xxvisa",
        projectPath: "/srv/xxvisa",
        agents: [
          { name: "claude", command: "claude --resume xxvisa-claude" },
          { name: "codex", command: null }
        ]
      })
    ).resolves.toEqual(["xxvisa-claude", "xxvisa-codex"]);

    expect(run).toHaveBeenNthCalledWith(1, "has-session", [
      "-t",
      "xxvisa-claude"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "has-session", [
      "-t",
      "xxvisa-codex"
    ]);
    expect(run).toHaveBeenNthCalledWith(3, "new-session", [
      "-d",
      "-c",
      "/srv/xxvisa",
      "-e",
      "CLICOLOR=1",
      "-e",
      "COLORTERM=truecolor",
      "-e",
      "TERM=xterm-256color",
      "-s",
      "xxvisa-codex"
    ]);
  });

  it("caches captured pane previews for one minute", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "first preview\n",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200001",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200002",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "second preview\n",
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue(null),
      now: () => 1000,
      previewTtlMs: 60_000
    });

    await service.listSessions({ includePreview: true });
    await service.listSessions({ includePreview: true });
    await service.sendCommand("build", "pwd");
    await service.listSessions({ includePreview: true });

    expect(run.mock.calls.filter(([command]) => command === "capture-pane")).toHaveLength(2);
  });

  it("caches git summaries across dashboard refreshes", async () => {
    let nowMs = 1000;
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200001",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200065",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100",
        stderr: ""
      });
    const getGitSummary = vi
      .fn()
      .mockResolvedValueOnce({ branch: "main", dirty: false })
      .mockResolvedValueOnce({ branch: "main", dirty: true });
    const service = createTmuxService({
      run,
      getGitSummary,
      now: () => nowMs,
      gitSummaryTtlMs: 60_000
    });

    await service.listSessions();
    nowMs = 2000;
    await service.listSessions();
    nowMs = 62_000;
    await service.listSessions();

    expect(getGitSummary).toHaveBeenCalledTimes(2);
    expect(getGitSummary).toHaveBeenNthCalledWith(1, "/home/app");
    expect(getGitSummary).toHaveBeenNthCalledWith(2, "/home/app");
  });

  it("types a command literally and sends enter to execute it", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.sendCommand("build", "npm test");

    expect(run).toHaveBeenNthCalledWith(1, "send-keys", [
      "-t",
      "build",
      "-l",
      "npm test"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "send-keys", [
      "-t",
      "build",
      "Enter"
    ]);
  });

  it("sends prompt choices literally and presses enter", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.sendInput("build", "a\r");

    expect(run).toHaveBeenNthCalledWith(1, "send-keys", [
      "-t",
      "build",
      "-l",
      "a"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "send-keys", [
      "-t",
      "build",
      "Enter"
    ]);
  });

  it("sends escape prompt input as a tmux key", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.sendInput("build", "\u001b");

    expect(run).toHaveBeenCalledWith("send-keys", [
      "-t",
      "build",
      "Escape"
    ]);
  });

  it("returns pane summaries only when explicitly requested", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout:
          "build\t%1\t0\tzsh\t1\t0\t0\tzsh\t/home/app\t0\t\t100\nbuild\t%2\t0\tzsh\t1\t1\t1\ttail\t/home/app/logs\t0\t\t101",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "Do you want to continue? [y/a/n]\n",
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue(null)
    });

    await expect(service.listSessions({ includePanes: true })).resolves.toMatchObject([
      {
        name: "build",
        paneCount: 2,
        panes: [
          {
            paneId: "%1",
            windowIndex: 0,
            paneIndex: 0,
            paneActive: false,
            currentCommand: "zsh"
          },
          {
            paneId: "%2",
            windowIndex: 0,
            paneIndex: 1,
            paneActive: true,
            currentCommand: "tail"
          }
        ]
      }
    ]);
  });

  it("loads one session status without scanning every session", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t1\t1714200000",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout:
          "build\t%1\t0\tzsh\t1\t0\t0\tzsh\t/home/app\t0\t\t100\nbuild\t%2\t0\tzsh\t1\t1\t1\ttail\t/home/app/logs\t0\t\t101",
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue({ branch: "main", dirty: false })
    });

    await expect(service.getSessionStatus("build")).resolves.toMatchObject({
      name: "build",
      paneCount: 2,
      currentCommand: "tail",
      gitBranch: "main",
      gitDirty: false,
      panes: [
        { paneId: "%1", paneIndex: 0 },
        { paneId: "%2", paneIndex: 1 }
      ]
    });
    expect(run).toHaveBeenNthCalledWith(3, "capture-pane", [
      "-p",
      "-t",
      "build",
      "-S",
      "-20"
    ]);
    expect(run).toHaveBeenNthCalledWith(1, "display-message", [
      "-p",
      "-t",
      "build",
      "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "list-panes", [
      "-t",
      "build",
      "-F",
      "#{session_name}\t#{pane_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{pane_index}\t#{pane_active}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}"
    ]);
    expect(run.mock.calls.some(([command]) => command === "list-sessions")).toBe(false);
  });

  it("splits the active pane in the current pane directory", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.splitPane("build", "horizontal");
    await service.splitPane("build", "vertical");

    expect(run).toHaveBeenNthCalledWith(1, "split-window", [
      "-h",
      "-d",
      "-t",
      "build",
      "-c",
      "#{pane_current_path}"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "split-window", [
      "-v",
      "-d",
      "-t",
      "build",
      "-c",
      "#{pane_current_path}"
    ]);
  });

  it("selects a specific pane by tmux pane id", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.selectPane("build", "%2");

    expect(run).toHaveBeenCalledWith("select-pane", ["-t", "%2"]);
  });

  it("kills a pane only after confirming it belongs to the session", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "%1\n%2\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.killPane("build", "%2");

    expect(run).toHaveBeenNthCalledWith(1, "list-panes", [
      "-t",
      "build",
      "-F",
      "#{pane_id}"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "kill-pane", ["-t", "%2"]);
  });

  it("does not kill the only pane in a session", async () => {
    const run = vi.fn().mockResolvedValueOnce({ stdout: "%1\n", stderr: "" });
    const service = createTmuxService({ run });

    await expect(service.killPane("build", "%1")).rejects.toThrow(
      "Cannot kill the only pane"
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("renames an existing session with validated target names", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.renameSession("build", "build-test");

    expect(run).toHaveBeenCalledWith("rename-session", [
      "-t",
      "build",
      "build-test"
    ]);
  });

  it("skips capture and git work for muted sessions", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000\ntmux-ui\t1\t0\t1714200001",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout:
          "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100\ntmux-ui\t%2\t0\tzsh\t1\t0\t1\tnode\t/home/app/tmux-ui\t0\t\t101",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "build preview\n",
        stderr: ""
      });
    const getGitSummary = vi
      .fn()
      .mockResolvedValueOnce({ branch: "main", dirty: false });
    const service = createTmuxService({ run, getGitSummary });

    await expect(
      service.listSessions({
        includePreview: true,
        includeInputPrompt: true,
        mutedSessionNames: ["tmux-ui"]
      })
    ).resolves.toMatchObject([
      {
        name: "build",
        gitBranch: "main",
        preview: "build preview"
      },
      {
        name: "tmux-ui",
        gitBranch: null,
        gitDirty: null,
        preview: null,
        inputPrompt: null
      }
    ]);
    expect(run.mock.calls.filter(([command]) => command === "capture-pane")).toEqual([
      [
        "capture-pane",
        ["-p", "-t", "build", "-S", "-20"]
      ]
    ]);
    expect(getGitSummary).toHaveBeenCalledOnce();
    expect(getGitSummary).toHaveBeenCalledWith("/home/app");
  });

  it("can return only the requested sessions for manual muted refresh", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "build\t1\t0\t1714200000\ntmux-ui\t1\t0\t1714200001",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout:
          "build\t%1\t0\tzsh\t1\t0\t1\tzsh\t/home/app\t0\t\t100\ntmux-ui\t%2\t0\tzsh\t1\t0\t1\tnode\t/home/app/tmux-ui\t0\t\t101",
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: "service output\n",
        stderr: ""
      });
    const service = createTmuxService({
      run,
      getGitSummary: vi.fn().mockResolvedValue(null)
    });

    await expect(
      service.listSessions({
        includePreview: true,
        includeInputPrompt: true,
        onlySessionNames: ["tmux-ui"]
      })
    ).resolves.toMatchObject([
      {
        name: "tmux-ui",
        preview: "service output"
      }
    ]);
  });
});
