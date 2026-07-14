#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { basename } from "node:path";

const mode = process.argv[2] || "generic";
const hookEndpoint =
  process.env.TMUX_UI_HOOK_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}/api/hooks/events`;
const conversationEndpoint =
  process.env.TMUX_UI_CONVERSATION_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}/api/conversation/messages`;
const token = process.env.TMUX_UI_HOOK_TOKEN || "";
const schemaVersion = "tmux-ui.hook/v1";

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

function readString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseEnvJson(name) {
  const value = process.env[name];

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeTarget(value, fallbackSessionName) {
  const target = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

  return {
    sessionName: readString(
      target.sessionName ?? target.session ?? target.session_name,
      fallbackSessionName
    ),
    projectName:
      readString(
        target.projectName ?? target.project ?? target.groupName ?? target.group,
        readString(process.env.TMUX_UI_HOOK_TARGET_PROJECT)
      ) || null,
    view: target.view === "kanban" ? "kanban" : "terminal"
  };
}

function normalizeAction(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = readString(value.id, `action-${index + 1}`);
  const label = readString(value.label, id);

  return {
    id,
    label,
    input: typeof value.input === "string" ? value.input : null,
    open: value.open === true,
    target:
      value.target && typeof value.target === "object" && !Array.isArray(value.target)
        ? normalizeTarget(value.target, "")
        : null,
    style:
      value.style === "primary" || value.style === "danger"
        ? value.style
        : "secondary"
  };
}

function normalizeActions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeAction).filter(Boolean).slice(0, 8);
}

function readPayloadActions(payload, fallback = []) {
  const explicitActions =
    Array.isArray(payload.actions)
      ? payload.actions
      : Array.isArray(payload.options)
        ? payload.options
        : Array.isArray(payload.choices)
          ? payload.choices
          : parseEnvJson("TMUX_UI_HOOK_ACTIONS_JSON");

  const actions = normalizeActions(explicitActions);

  return actions.length > 0 ? actions : fallback;
}

function approvalActions() {
  return [
    { id: "approve", label: "Approve", input: "y\r", open: false, target: null, style: "primary" },
    { id: "deny", label: "Deny", input: "n\r", open: false, target: null, style: "danger" },
    { id: "details", label: "Details", input: "p\r", open: true, target: null, style: "secondary" }
  ];
}

function enterAction() {
  return [
    { id: "enter", label: "Enter", input: "\r", open: false, target: null, style: "primary" }
  ];
}

function readPayloadTarget(payload) {
  return payload.target ?? parseEnvJson("TMUX_UI_HOOK_TARGET_JSON") ?? {
    projectName: process.env.TMUX_UI_HOOK_TARGET_PROJECT || null,
    view: process.env.TMUX_UI_HOOK_TARGET_VIEW || "terminal"
  };
}

function summaryContent(text, existing = []) {
  if (existing.some((block) => block?.type === "summary" && readString(block.text))) {
    return existing;
  }

  const summary = readString(text);
  return summary ? [{ type: "summary", text: summary }, ...existing] : existing;
}

function toStandardEvent(payload) {
  const body =
    typeof payload.body === "string"
      ? payload.body
      : typeof payload.message === "string"
        ? payload.message
        : "";
  const content = Array.isArray(payload.content) ? payload.content : [];

  return {
    schemaVersion,
    source: readString(payload.source, process.env.TMUX_UI_HOOK_SOURCE || "custom"),
    eventType: readString(
      payload.eventType,
      process.env.TMUX_UI_HOOK_EVENT_TYPE || "event"
    ),
    status: readString(payload.status, process.env.TMUX_UI_HOOK_STATUS || "info"),
    severity: readString(
      payload.severity,
      process.env.TMUX_UI_HOOK_SEVERITY || "info"
    ),
    title: readString(
      payload.title,
      process.env.TMUX_UI_HOOK_TITLE || "Agent hook event"
    ),
    body,
    content: summaryContent(body, content),
    metadata:
      payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
        ? payload.metadata
        : undefined,
    taskId:
      typeof payload.taskId === "string"
        ? payload.taskId
        : typeof payload.task_id === "string"
          ? payload.task_id
          : null,
    cwd: typeof payload.cwd === "string" ? payload.cwd : process.cwd(),
    target: readPayloadTarget(payload),
    actions: readPayloadActions(payload)
  };
}

function toHookEvent(payload) {
  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();

  if (
    payload.schemaVersion === schemaVersion ||
    payload.target ||
    Array.isArray(payload.actions)
  ) {
    return toStandardEvent(payload);
  }

  if (mode === "codex-permission") {
    const explicitToolName = readString(payload.tool_name);
    const toolName = explicitToolName || "tool";
    const description = readToolDescription(payload);

    return {
      source: "codex",
      eventType: "approval-required",
      status: "waiting",
      severity: "warning",
      title: `Codex permission requested: ${toolName}`,
      body: description || "Codex is waiting for permission.",
      content: summaryContent(description),
      metadata: explicitToolName ? { toolName: explicitToolName } : undefined,
      taskId: typeof payload.turn_id === "string" ? payload.turn_id : null,
      cwd,
      actions: readPayloadActions(payload, approvalActions()),
      target: readPayloadTarget(payload)
    };
  }

  if (mode === "claude-notification") {
    const notificationType =
      typeof payload.notification_type === "string"
        ? payload.notification_type
        : "notification";
    const explicitNotificationType = readString(payload.notification_type);
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
      content: summaryContent(
        typeof payload.message === "string" ? payload.message : ""
      ),
      metadata: explicitNotificationType
        ? { notificationType: explicitNotificationType }
        : undefined,
      taskId: typeof payload.session_id === "string" ? payload.session_id : null,
      cwd,
      actions: readPayloadActions(payload, isPermission ? approvalActions() : enterAction()),
      target: readPayloadTarget(payload)
    };
  }

  if (mode === "claude-permission") {
    const explicitToolName = readString(payload.tool_name);
    const toolName = explicitToolName || "tool";
    const description = readToolDescription(payload);

    return {
      source: "claude",
      eventType: "approval-required",
      status: "waiting",
      severity: "warning",
      title: `Claude permission requested: ${toolName}`,
      body: description || "Claude is waiting for permission.",
      content: summaryContent(description),
      metadata: explicitToolName ? { toolName: explicitToolName } : undefined,
      taskId: typeof payload.session_id === "string" ? payload.session_id : null,
      cwd,
      actions: readPayloadActions(payload, approvalActions()),
      target: readPayloadTarget(payload)
    };
  }

  return toStandardEvent({
    ...payload,
    cwd,
    title: payload.title ?? process.env.TMUX_UI_HOOK_TITLE,
    body: payload.body ?? payload.message
  });
}

function toConversationOutput(payload, sessionName) {
  if (
    payload.sessionName !== undefined &&
    (typeof payload.sessionName !== "string" || payload.sessionName !== sessionName)
  ) {
    throw new Error("Agent output sessionName does not match the active tmux session");
  }

  return {
    ...payload,
    sessionName
  };
}

async function main() {
  const payload = parseJson(await readStdin());
  const sessionName = inferTmuxSessionName();
  const isAgentOutput = mode === "agent-output";
  const hookEvent = isAgentOutput ? null : toHookEvent(payload);
  const event = isAgentOutput
    ? toConversationOutput(payload, sessionName)
    : {
        schemaVersion,
        ...hookEvent,
        sessionName,
        target: normalizeTarget(hookEvent.target, sessionName),
        actions: normalizeActions(hookEvent.actions)
      };
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(isAgentOutput ? conversationEndpoint : hookEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    throw new Error(`tmux-ui ${isAgentOutput ? "conversation" : "hook"} endpoint returned ${response.status}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  // Notification hooks must never block Codex/Claude approval flows.
  process.exit(0);
});
