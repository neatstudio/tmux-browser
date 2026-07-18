import { spawnSync } from "node:child_process";

import {
  createTerminalBridge,
  getTmuxExtendedKeyConfigCommands,
  type CreateTerminalBridge,
  type RunTmuxCommand,
  type SpawnPty
} from "./createTerminalBridge.js";

type SyncTmuxResult = {
  status: number | null;
  stdout?: string;
  stderr?: string;
};

type RunTmuxCommandSync = (args: string[]) => SyncTmuxResult;

type TerminalBridgeFactoryDeps = {
  runTmuxCommandSync?: RunTmuxCommandSync;
  spawnPty?: SpawnPty;
  runTmuxCommand?: RunTmuxCommand;
};

const defaultRunTmuxCommandSync: RunTmuxCommandSync = (args) => {
  const result = spawnSync("tmux", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8"
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
};

function requireSuccessfulTmuxCommand(
  result: SyncTmuxResult,
  args: string[]
) {
  if (result.status !== 0) {
    throw new Error(
      `tmux configuration failed (${result.status ?? "no status"}): tmux ${args.join(" ")}`
    );
  }
}

function isUnsupportedOptionalTmuxCommand(
  result: SyncTmuxResult,
  args: string[]
) {
  return (
    result.status !== 0 &&
    args[0] === "set-option" &&
    args[2] === "extended-keys-format" &&
    /invalid option:\s*extended-keys-format/i.test(result.stderr ?? "")
  );
}

export function createTerminalBridgeFactory(
  deps: TerminalBridgeFactoryDeps = {}
): CreateTerminalBridge {
  const runTmuxCommandSync =
    deps.runTmuxCommandSync ?? defaultRunTmuxCommandSync;
  let configured = false;

  function configureOnce() {
    if (configured) return;
    const showArgs = ["show-options", "-gqv", "terminal-features"];
    const showResult = runTmuxCommandSync(showArgs);
    requireSuccessfulTmuxCommand(showResult, showArgs);
    for (const command of getTmuxExtendedKeyConfigCommands(showResult.stdout ?? "")) {
      const result = runTmuxCommandSync(command);

      if (!isUnsupportedOptionalTmuxCommand(result, command)) {
        requireSuccessfulTmuxCommand(result, command);
      }
    }
    configured = true;
  }

  return (options) => {
    configureOnce();
    return createTerminalBridge(options, {
      ...(deps.spawnPty ? { spawnPty: deps.spawnPty } : {}),
      ...(deps.runTmuxCommand ? { runTmuxCommand: deps.runTmuxCommand } : {}),
      configureTmux: () => {}
    });
  };
}

export const defaultTerminalBridgeFactory = createTerminalBridgeFactory();
