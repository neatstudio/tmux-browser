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
  return { status: result.status, stdout: result.stdout ?? "" };
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
      requireSuccessfulTmuxCommand(runTmuxCommandSync(command), command);
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
