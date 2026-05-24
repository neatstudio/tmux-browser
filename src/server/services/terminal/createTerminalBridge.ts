import { spawn as spawnProcess, spawnSync } from "node:child_process";

import { spawn as spawnPtyProcess, type IPty } from "node-pty";

import { ensureNodePtySpawnHelperExecutable } from "./ensureNodePtySpawnHelperExecutable.js";

export type TerminalBridge = {
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: () => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  scroll: (lines: number) => void;
  clearHistory: () => void;
  kill: () => void;
};

type PtyProcess = {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (listener: (data: string) => void) => void;
  onExit: (listener: () => void) => void;
};

type SpawnPty = (
  file: string,
  args: string[],
  options: {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }
) => PtyProcess;

type RunTmuxCommand = (args: string[]) => void;
type ConfigureTmux = () => void;

export type CreateTerminalBridge = (
  options: {
    sessionName: string;
    cols: number;
    rows: number;
  },
  deps?: {
    spawnPty?: SpawnPty;
    runTmuxCommand?: RunTmuxCommand;
    configureTmux?: ConfigureTmux;
  }
) => TerminalBridge;

function createNodePtyProcess(pty: IPty): PtyProcess {
  return {
    write(data) {
      pty.write(data);
    },
    resize(cols, rows) {
      pty.resize(cols, rows);
    },
    kill() {
      pty.kill();
    },
    onData(listener) {
      pty.onData(listener);
    },
    onExit(listener) {
      pty.onExit(() => listener());
    }
  };
}

const defaultSpawnPty: SpawnPty = (file, args, options) => {
  ensureNodePtySpawnHelperExecutable();
  return createNodePtyProcess(spawnPtyProcess(file, args, options));
};

const defaultRunTmuxCommand: RunTmuxCommand = (args) => {
  const child = spawnProcess("tmux", args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore"
  });
  child.unref();
};

function runTmuxCommandSync(args: string[]) {
  spawnSync("tmux", args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore"
  });
}

function getTmuxTerminalFeatures() {
  const result = spawnSync("tmux", ["show-options", "-gqv", "terminal-features"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8"
  });

  return result.stdout ?? "";
}

function hasXtermExtkeys(terminalFeatures: string) {
  return terminalFeatures
    .split(/\r?\n/)
    .some((line) => line.startsWith("xterm*") && line.split(":").includes("extkeys"));
}

export function getTmuxExtendedKeyConfigCommands(
  terminalFeatures: string
): string[][] {
  const commands = [
    ["set-option", "-s", "extended-keys", "always"],
    ["set-option", "-s", "extended-keys-format", "csi-u"]
  ];

  if (!hasXtermExtkeys(terminalFeatures)) {
    commands.push([
      "set-option",
      "-gq",
      "-as",
      "terminal-features",
      ",xterm*:extkeys"
    ]);
  }

  return commands;
}

function configureTmuxExtendedKeys() {
  const terminalFeatures = getTmuxTerminalFeatures();

  for (const command of getTmuxExtendedKeyConfigCommands(terminalFeatures)) {
    runTmuxCommandSync(command);
  }
}

export const createTerminalBridge: CreateTerminalBridge = (
  { sessionName, cols, rows },
  deps = {}
) => {
  const runTmuxCommand = deps.runTmuxCommand ?? defaultRunTmuxCommand;
  const configureTmux = deps.configureTmux ?? configureTmuxExtendedKeys;

  configureTmux();

  const pty = (deps.spawnPty ?? defaultSpawnPty)("tmux", [
    "-u",
    "attach-session",
    "-t",
    sessionName
  ], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env
  });

  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<() => void>();

  pty.onData((data) => {
    dataListeners.forEach((listener) => listener(data));
  });

  pty.onExit(() => {
    exitListeners.forEach((listener) => listener());
  });

  return {
    onData(listener) {
      dataListeners.add(listener);
    },
    onExit(listener) {
      exitListeners.add(listener);
    },
    write(data) {
      pty.write(data);
    },
    resize(nextCols, nextRows) {
      pty.resize(nextCols, nextRows);
    },
    scroll(lines) {
      const lineCount = Math.abs(Math.trunc(lines));

      if (lineCount === 0) {
        return;
      }

      const scrollCommand = lines < 0 ? "scroll-up" : "scroll-down";
      const commandArgs =
        lines < 0
          ? [
              "copy-mode",
              "-e",
              "-t",
              sessionName,
              ";",
              "send-keys",
              "-t",
              sessionName,
              "-X",
              "-N",
              String(lineCount),
              scrollCommand
            ]
          : [
              "send-keys",
              "-t",
              sessionName,
              "-X",
              "-N",
              String(lineCount),
              scrollCommand
            ];

      runTmuxCommand(commandArgs);
    },
    clearHistory() {
      runTmuxCommand(["clear-history", "-t", sessionName]);
    },
    kill() {
      pty.kill();
    }
  };
};
