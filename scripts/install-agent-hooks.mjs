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

function shellQuote(value) {
  if (value.includes("\0")) {
    throw new TypeError("Shell command values cannot contain NUL bytes");
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildCommand(mode) {
  const env = [];

  if (hookUrl) {
    env.push(`TMUX_UI_HOOK_URL=${shellQuote(hookUrl)}`);
  }

  if (hookToken) {
    env.push(`TMUX_UI_HOOK_TOKEN=${shellQuote(hookToken)}`);
  }

  env.push(`node ${shellQuote(helperPath)} ${shellQuote(mode)}`);

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
  console.log(`Install tmux-ui agent hooks that emit standard tmux-ui.hook/v1 events.

Usage:
  node scripts/install-agent-hooks.mjs [--codex] [--claude]
  node scripts/install-agent-hooks.mjs --uninstall [--codex] [--claude]
  node scripts/install-agent-hooks.mjs --examples

Environment:
  TMUX_UI_AGENT_HOOK   Path to tmux-ui-agent-hook helper
  TMUX_UI_HOOK_URL     Optional hook endpoint URL
  TMUX_UI_HOOK_TOKEN   Optional token for non-local/non-Tailscale endpoints
  CODEX_HOOKS_FILE     Override ~/.codex/hooks.json
  CLAUDE_SETTINGS_FILE Override ~/.claude/settings.json
`);
}

function printExamples() {
  console.log(`Bundled Codex/Claude hooks emit hook events, not conversation messages.
They include a summary content block only when the source payload contains the
corresponding fact. Do not infer file counts, test results, durations, or outcomes.

Hook event example:
${JSON.stringify({
  schemaVersion: "tmux-ui.hook/v1",
  source: "codex",
  sessionName: "project-codex",
  eventType: "approval-required",
  status: "waiting",
  title: "Codex permission requested: apply_patch",
  body: "Update README examples",
  content: [{ type: "summary", text: "Update README examples" }],
  metadata: { toolName: "apply_patch" }
}, null, 2)}

Conversation streaming producer example. POST each complete snapshot to
/api/conversation/messages with the same sessionName and messageId:
${[
  { messageId: "msg-example", sessionName: "project-codex", role: "assistant", contentType: "text", content: "Reading project docs", summary: "Reading project docs", status: "streaming", revision: 1 },
  { messageId: "msg-example", sessionName: "project-codex", role: "assistant", contentType: "text", content: "Reading project docs and updating examples", summary: "Updating integration examples", status: "streaming", revision: 2 },
  { messageId: "msg-example", sessionName: "project-codex", role: "assistant", contentType: "text", content: "Updated the integration examples", summary: "Integration examples updated", status: "complete", revision: 3 }
].map((entry) => JSON.stringify(entry, null, 2)).join("\n")}

Before a production server release, register every strict decoder and repeated-
message streaming producer in config/structured-events-compat.json with its
minimumCompatibleVersion and verified compatible status. This illustrative
manifest fragment shows both entry shapes; replace example ids, owners, and
versions with deployed facts:
${JSON.stringify({
  strictDecoders: {
    entries: [{ id: "native-client-example", owner: "client team", minimumCompatibleVersion: "1.2.3", compatible: true }]
  },
  repeatedMessageStreamingProducers: {
    entries: [{ id: "streaming-producer-example", owner: "producer team", minimumCompatibleVersion: "2.3.4", compatible: true }]
  }
}, null, 2)}

The Phase 1 server release gate is:

  npm run check:structured-events-compat
`);
}

if (args.has("--help") || args.has("-h")) {
  printHelp();
  process.exit(0);
}

if (args.has("--examples")) {
  printExamples();
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
