#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

const mode = process.argv[2] || "generic";
const endpoint =
  process.env.TMUX_UI_HOOK_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}/api/hooks/events`;
const token = process.env.TMUX_UI_HOOK_TOKEN || "";

function readStdin() {
  return new Promise((resolve) => {
    let input = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
  });
}

function parseJson(input) {
  try {
    return input.trim() ? JSON.parse(input) : {};
  } catch {
    return {};
  }
}

function inferTmuxSessionName() {
  if (process.env.TMUX_UI_SESSION_NAME) {
    return process.env.TMUX_UI_SESSION_NAME;
  }

  if (process.env.TMUX_UI_SESSION) {
    return process.env.TMUX_UI_SESSION;
  }

  if (process.env.TMUX) {
    const result = spawnSync("tmux", ["display-message", "-p", "#S"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const sessionName = result.stdout.trim();

    if (sessionName) {
      return sessionName;
    }
  }

  return process.env.TMUX_UI_DEFAULT_SESSION || basename(process.cwd()) || "hooks";
}

function readToolDescription(payload) {
  const input = payload.tool_input;

  if (!input || typeof input !== "object") {
    return "";
  }

  if (typeof input.description === "string") {
    return input.description;
  }

  if (typeof input.command === "string") {
    return input.command;
  }

  if (typeof input.file_path === "string") {
    return input.file_path;
  }

  return "";
}

function toHookEvent(payload) {
  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();

  if (mode === "codex-permission") {
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "tool";
    const description = readToolDescription(payload);

    return {
      source: "codex",
      eventType: "approval-required",
      status: "waiting",
      severity: "warning",
      title: `Codex permission requested: ${toolName}`,
      body: description || "Codex is waiting for permission.",
      taskId: typeof payload.turn_id === "string" ? payload.turn_id : null,
      cwd
    };
  }

  if (mode === "claude-notification") {
    const notificationType =
      typeof payload.notification_type === "string"
        ? payload.notification_type
        : "notification";
    const isPermission = notificationType === "permission_prompt";

    return {
      source: "claude",
      eventType: isPermission ? "approval-required" : "need-input",
      status: "waiting",
      severity: isPermission ? "warning" : "info",
      title:
        typeof payload.title === "string" && payload.title
          ? payload.title
          : `Claude ${notificationType}`,
      body:
        typeof payload.message === "string" && payload.message
          ? payload.message
          : "Claude is waiting for input.",
      taskId: typeof payload.session_id === "string" ? payload.session_id : null,
      cwd
    };
  }

  if (mode === "claude-permission") {
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "tool";
    const description = readToolDescription(payload);

    return {
      source: "claude",
      eventType: "approval-required",
      status: "waiting",
      severity: "warning",
      title: `Claude permission requested: ${toolName}`,
      body: description || "Claude is waiting for permission.",
      taskId: typeof payload.session_id === "string" ? payload.session_id : null,
      cwd
    };
  }

  return {
    source: process.env.TMUX_UI_HOOK_SOURCE || "custom",
    eventType: process.env.TMUX_UI_HOOK_EVENT_TYPE || "event",
    status: process.env.TMUX_UI_HOOK_STATUS || "info",
    severity: process.env.TMUX_UI_HOOK_SEVERITY || "info",
    title: process.env.TMUX_UI_HOOK_TITLE || "Agent hook event",
    body: typeof payload.message === "string" ? payload.message : "",
    taskId: null,
    cwd
  };
}

async function main() {
  const payload = parseJson(await readStdin());
  const event = {
    ...toHookEvent(payload),
    sessionName: inferTmuxSessionName()
  };
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    throw new Error(`tmux-ui hook endpoint returned ${response.status}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  // Notification hooks must never block Codex/Claude approval flows.
  process.exit(0);
});
