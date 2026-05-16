import { describe, expect, it, vi } from "vitest";

import { createTmuxService } from "../../../../src/server/services/tmux/createTmuxService";

describe("createTmuxService", () => {
  it("lists sessions with attached status from tmux format fields", async () => {
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
          "build\tserver\t1\t1\tnpm\t/tmp/project\t0\t\t100\nops\tzsh\t1\t1\tzsh\t/tmp/ops\t0\t\t101",
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
        paneDeadStatus: null
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
        paneDeadStatus: null
      }
    ]);
    expect(run).toHaveBeenNthCalledWith(1, "list-sessions", [
      "-F",
      "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"
    ]);
    expect(run).toHaveBeenNthCalledWith(2, "list-panes", [
      "-a",
      "-F",
      "#{session_name}\t#{window_name}\t#{window_active}\t#{pane_active}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}"
    ]);
    expect(getGitSummary).toHaveBeenNthCalledWith(1, "/tmp/project");
    expect(getGitSummary).toHaveBeenNthCalledWith(2, "/tmp/ops");
  });

  it("creates a detached session with color-capable terminal environment", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const service = createTmuxService({ run });

    await service.createSession("build");

    expect(run).toHaveBeenCalledWith("new-session", [
      "-d",
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
});
