import type { SessionRuntimeKind } from "../../../shared/sessionRuntime.js";

const AGENT_INPUT_COMMANDS = new Set([
  "aider",
  "claude",
  "codex",
  "cursor-agent",
  "gemini",
  "kiro",
  "opencode",
  "qwen"
]);

const SHELL_PRINT_COMMANDS = new Set([
  "bash",
  "csh",
  "dash",
  "fish",
  "ksh",
  "sh",
  "ssh",
  "tcsh",
  "zsh"
]);

export function normalizeForegroundCommand(command: string | null | undefined) {
  if (!command) {
    return null;
  }

  return command.split(/[\\/]/).pop()?.toLowerCase() ?? null;
}

export function classifySessionRuntime(command: string | null | undefined): {
  command: string | null;
  kind: SessionRuntimeKind;
} {
  const normalizedCommand = normalizeForegroundCommand(command);

  if (normalizedCommand && AGENT_INPUT_COMMANDS.has(normalizedCommand)) {
    return {
      command: normalizedCommand,
      kind: "agent"
    };
  }

  if (normalizedCommand && SHELL_PRINT_COMMANDS.has(normalizedCommand)) {
    return {
      command: normalizedCommand,
      kind: "shell"
    };
  }

  return {
    command: normalizedCommand,
    kind: "unknown"
  };
}
