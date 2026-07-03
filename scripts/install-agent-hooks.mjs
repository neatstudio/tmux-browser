#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const args = new Set(process.argv.slice(2));
const home = homedir();
const codexHooksPath = process.env.CODEX_HOOKS_FILE || join(home, ".codex", "hooks.json");
const claudeSettingsPath =
  process.env.CLAUDE_SETTINGS_FILE || join(home, ".claude", "settings.json");
const helperPath =
  process.env.TMUX_UI_AGENT_HOOK ||
  (existsSync(join(home, ".tmux-ui", "tmux-ui-agent-hook.mjs"))
    ? join(home, ".tmux-ui", "tmux-ui-agent-hook.mjs")
    : join(home, ".tmux-ui", "bin", "tmux-ui-agent-hook"));
const hookUrl = process.env.TMUX_UI_HOOK_URL || "";
const hookToken = process.env.TMUX_UI_HOOK_TOKEN || "";

function readJson(path, fallback) {
  if (!existsSync(path)) {
    return fallback;
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function backupFile(path) {
  if (!existsSync(path)) {
    return;
  }

  copyFileSync(path, `${path}.bak.${Date.now()}`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  backupFile(path);
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  writeFileSync(path, readFileSync(`${path}.tmp`, "utf8"), "utf8");
}

function buildCommand(mode) {
  const env = [];

  if (hookUrl) {
    env.push(`TMUX_UI_HOOK_URL=${JSON.stringify(hookUrl)}`);
  }

  if (hookToken) {
    env.push(`TMUX_UI_HOOK_TOKEN=${JSON.stringify(hookToken)}`);
  }

  env.push(`node ${JSON.stringify(helperPath)} ${mode}`);

  return env.join(" ");
}

function hasCommandHook(entries, command) {
  return entries.some((entry) =>
    entry.hooks?.some((hook) => hook.type === "command" && hook.command === command)
  );
}

function isTmuxUiHookEntry(entry) {
  return entry.hooks?.some(
    (hook) =>
      hook.type === "command" &&
      typeof hook.command === "string" &&
      hook.command.includes("tmux-ui-agent-hook")
  );
}

function installCodexHooks() {
  const config = readJson(codexHooksPath, { hooks: {} });
  config.hooks ||= {};
  config.hooks.PermissionRequest ||= [];
  const command = buildCommand("codex-permission");

  if (!hasCommandHook(config.hooks.PermissionRequest, command)) {
    config.hooks.PermissionRequest.push({
      matcher: "*",
      hooks: [
        {
          type: "command",
          command,
          async: true
        }
      ]
    });
  }

  writeJson(codexHooksPath, config);
  return codexHooksPath;
}

function installClaudeHooks() {
  const config = readJson(claudeSettingsPath, {});
  config.hooks ||= {};
  config.hooks.Notification ||= [];
  const command = buildCommand("claude-notification");

  if (!hasCommandHook(config.hooks.Notification, command)) {
    config.hooks.Notification.push({
      matcher: "permission_prompt|idle_prompt",
      hooks: [
        {
          type: "command",
          command,
          async: true
        }
      ]
    });
  }

  writeJson(claudeSettingsPath, config);
  return claudeSettingsPath;
}

function uninstallCodexHooks() {
  const config = readJson(codexHooksPath, { hooks: {} });
  config.hooks ||= {};

  if (Array.isArray(config.hooks.PermissionRequest)) {
    config.hooks.PermissionRequest =
      config.hooks.PermissionRequest.filter((entry) => !isTmuxUiHookEntry(entry));
  }

  writeJson(codexHooksPath, config);
  return codexHooksPath;
}

function uninstallClaudeHooks() {
  const config = readJson(claudeSettingsPath, {});
  config.hooks ||= {};

  if (Array.isArray(config.hooks.Notification)) {
    config.hooks.Notification =
      config.hooks.Notification.filter((entry) => !isTmuxUiHookEntry(entry));
  }

  writeJson(claudeSettingsPath, config);
  return claudeSettingsPath;
}

function printHelp() {
  console.log(`Install tmux-ui agent hooks.

Usage:
  node scripts/install-agent-hooks.mjs [--codex] [--claude]
  node scripts/install-agent-hooks.mjs --uninstall [--codex] [--claude]

Environment:
  TMUX_UI_AGENT_HOOK   Path to tmux-ui-agent-hook helper
  TMUX_UI_HOOK_URL     Optional hook endpoint URL
  TMUX_UI_HOOK_TOKEN   Optional token for non-local/non-Tailscale endpoints
  CODEX_HOOKS_FILE     Override ~/.codex/hooks.json
  CLAUDE_SETTINGS_FILE Override ~/.claude/settings.json
`);
}

if (args.has("--help") || args.has("-h")) {
  printHelp();
  process.exit(0);
}

const uninstall = args.has("--uninstall");
const hasToolFilter = args.has("--codex") || args.has("--claude");
const installCodex = !hasToolFilter || args.has("--codex");
const installClaude = !hasToolFilter || args.has("--claude");

if (uninstall && installCodex) {
  console.log(`Uninstalled Codex hook: ${uninstallCodexHooks()}`);
} else if (installCodex) {
  console.log(`Installed Codex hook: ${installCodexHooks()}`);
}

if (uninstall && installClaude) {
  console.log(`Uninstalled Claude hook: ${uninstallClaudeHooks()}`);
} else if (installClaude) {
  console.log(`Installed Claude hook: ${installClaudeHooks()}`);
}
