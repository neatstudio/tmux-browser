import { describe, expect, it, vi } from "vitest";

import {
  createTerminalBridge,
  getTmuxExtendedKeyConfigCommands
} from "../../../../src/server/services/terminal/createTerminalBridge";

describe("createTerminalBridge", () => {
  it("configures tmux extended keys before attaching the PTY", () => {
    const calls: string[] = [];
    const configureTmux = vi.fn(() => {
      calls.push("configure");
    });
    const spawnPty = vi.fn(() => {
      calls.push("spawn");
      return {
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        onData: vi.fn(),
        onExit: vi.fn()
      };
    });

    createTerminalBridge(
      { sessionName: "build", cols: 120, rows: 40 },
      { spawnPty, configureTmux, runTmuxCommand: vi.fn() }
    );

    expect(configureTmux).toHaveBeenCalledOnce();
    expect(calls).toEqual(["configure", "spawn"]);
  });

  it("builds idempotent tmux commands for CSI-u modified key support", () => {
    expect(
      getTmuxExtendedKeyConfigCommands(
        "xterm*:clipboard:ccolour:cstyle:focus:title\nscreen*:title"
      )
    ).toEqual([
      ["set-option", "-g", "mouse", "off"],
      ["set-option", "-s", "extended-keys", "always"],
      ["set-option", "-s", "extended-keys-format", "csi-u"],
      ["set-option", "-gq", "-as", "terminal-features", ",xterm*:extkeys"]
    ]);

    expect(
      getTmuxExtendedKeyConfigCommands(
        "xterm*:clipboard:extkeys:focus:title\nscreen*:title"
      )
    ).toEqual([
      ["set-option", "-g", "mouse", "off"],
      ["set-option", "-s", "extended-keys", "always"],
      ["set-option", "-s", "extended-keys-format", "csi-u"]
    ]);
  });

  it("spawns tmux attach in a PTY and forwards IO lifecycle", () => {
    const outputListeners: Array<(data: string) => void> = [];
    const exitListeners: Array<() => void> = [];
    const write = vi.fn();
    const resize = vi.fn();
    const kill = vi.fn();
    const runTmuxCommand = vi.fn();
    const configureTmux = vi.fn();
    const spawnPty = vi.fn(() => ({
      write,
      resize,
      kill,
      onData(listener: (data: string) => void) {
        outputListeners.push(listener);
      },
      onExit(listener: () => void) {
        exitListeners.push(listener);
      }
    }));

    const bridge = createTerminalBridge(
      { sessionName: "build", cols: 120, rows: 40 },
      { spawnPty, configureTmux, runTmuxCommand }
    );

    const onData = vi.fn();
    const onExit = vi.fn();

    bridge.onData(onData);
    bridge.onExit(onExit);

    outputListeners[0]?.("hello from tmux");
    exitListeners[0]?.();

    bridge.write("ls -alh\r");
    bridge.resize(100, 30);
    bridge.scroll(-8);
    bridge.scroll(3);
    bridge.clearHistory();
    bridge.kill();

    expect(spawnPty).toHaveBeenCalledWith("tmux", ["-u", "attach-session", "-t", "build"], {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: process.cwd(),
      env: process.env
    });
    expect(onData).toHaveBeenCalledWith("hello from tmux");
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("ls -alh\r");
    expect(resize).toHaveBeenCalledWith(100, 30);
    expect(runTmuxCommand).toHaveBeenNthCalledWith(1, [
      "copy-mode",
      "-e",
      "-t",
      "build",
      ";",
      "send-keys",
      "-t",
      "build",
      "-X",
      "-N",
      "8",
      "scroll-up"
    ]);
    expect(runTmuxCommand).toHaveBeenNthCalledWith(2, [
      "send-keys",
      "-t",
      "build",
      "-X",
      "-N",
      "3",
      "scroll-down"
    ]);
    expect(runTmuxCommand).toHaveBeenNthCalledWith(3, [
      "clear-history",
      "-t",
      "build"
    ]);
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("sends Ctrl-C through tmux instead of an attaching PTY", () => {
    const write = vi.fn();
    const runTmuxCommand = vi.fn();
    const bridge = createTerminalBridge(
      { sessionName: "build", cols: 120, rows: 40 },
      {
        configureTmux: vi.fn(),
        runTmuxCommand,
        spawnPty: vi.fn(() => ({
          write,
          resize: vi.fn(),
          kill: vi.fn(),
          onData: vi.fn(),
          onExit: vi.fn()
        }))
      }
    );

    bridge.write("\x03");

    expect(runTmuxCommand).toHaveBeenCalledWith([
      "send-keys",
      "-t",
      "build",
      "C-c"
    ]);
    expect(write).not.toHaveBeenCalled();
  });

  it("normalizes CSI-u Ctrl-C before writing to the terminal PTY", () => {
    const write = vi.fn();
    const runTmuxCommand = vi.fn();
    const bridge = createTerminalBridge(
      { sessionName: "build", cols: 120, rows: 40 },
      {
        configureTmux: vi.fn(),
        runTmuxCommand,
        spawnPty: vi.fn(() => ({
          write,
          resize: vi.fn(),
          kill: vi.fn(),
          onData: vi.fn(),
          onExit: vi.fn()
        }))
      }
    );

    bridge.write("\x1b[99;5u");

    expect(runTmuxCommand).toHaveBeenCalledWith([
      "send-keys",
      "-t",
      "build",
      "C-c"
    ]);
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps non-interrupt CSI-u input on the terminal PTY path", () => {
    const write = vi.fn();
    const runTmuxCommand = vi.fn();
    const bridge = createTerminalBridge(
      { sessionName: "build", cols: 120, rows: 40 },
      {
        configureTmux: vi.fn(),
        runTmuxCommand,
        spawnPty: vi.fn(() => ({
          write,
          resize: vi.fn(),
          kill: vi.fn(),
          onData: vi.fn(),
          onExit: vi.fn()
        }))
      }
    );

    bridge.write("\x1b[13;2u");

    expect(write).toHaveBeenCalledWith("\x1b[13;2u");
    expect(runTmuxCommand).not.toHaveBeenCalled();
  });
});
