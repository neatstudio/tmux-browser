import {
  HOOK_EVENT_SCHEMA_VERSION,
  type HookEvent,
  type HookEventAction,
  type HookEventActionStyle,
  type HookEventContentBlock,
  type HookEventSeverity,
  type HookEventStatus,
  type HookEventTarget,
  type HookEventTargetView
} from "../../../shared/hookEvents.js";
import { normalizeEventMetadata } from "./normalizeEventMetadata.js";

const TEXT_LIMIT = 4_000;
const TITLE_LIMIT = 160;
const ACTION_LIMIT = 8;
const ACTION_LABEL_LIMIT = 80;
const TARGET_LIMIT = 128;
const CONTENT_BLOCK_LIMIT = 12;
const CONTENT_TITLE_LIMIT = 120;
const CONTENT_LANGUAGE_LIMIT = 32;
const STATUSES = new Set<HookEventStatus>(["waiting", "blocked", "need-input", "running", "done", "failed", "info"]);
const SEVERITIES = new Set<HookEventSeverity>(["info", "warning", "error"]);
const ACTION_STYLES = new Set<HookEventActionStyle>(["primary", "secondary", "danger"]);
const TARGET_VIEWS = new Set<HookEventTargetView>(["terminal", "kanban"]);

export class HookEventNormalizationError extends Error {
  readonly statusCode = 400;
}

function readString(value: unknown, fallback = "", maxLength = TEXT_LIMIT) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}
function nullable(value: unknown, maxLength = TEXT_LIMIT) {
  return readString(value, "", maxLength) || null;
}
function raw(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, TEXT_LIMIT) : null;
}
function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function validSessionName(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value);
}
function targetString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = nullable(payload[key], TARGET_LIMIT);
    if (value) return value;
  }
  return null;
}
function optionalTarget(value: unknown): HookEventTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const sessionName = targetString(payload, ["sessionName", "session", "session_name"]);
  if (sessionName && !validSessionName(sessionName)) {
    throw new HookEventNormalizationError("Invalid hook target session name");
  }
  const view = readString(payload.view, "terminal", 40);
  return {
    sessionName,
    projectName: targetString(payload, ["projectName", "project", "groupName", "group"]),
    view: TARGET_VIEWS.has(view as HookEventTargetView) ? view as HookEventTargetView : "terminal"
  };
}
function actions(value: unknown): HookEventAction[] {
  if (!Array.isArray(value)) return [];
  const result: HookEventAction[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (result.length >= ACTION_LIMIT) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const payload = entry as Record<string, unknown>;
    let id = readString(payload.id, `action-${index + 1}`, ACTION_LABEL_LIMIT);
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    const style = readString(payload.style, "secondary", 40);
    result.push({
      id,
      label: readString(payload.label, id, ACTION_LABEL_LIMIT),
      input: raw(payload.input),
      open: bool(payload.open),
      target: optionalTarget(payload.target),
      style: ACTION_STYLES.has(style as HookEventActionStyle) ? style as HookEventActionStyle : "secondary"
    });
  }
  return result;
}
function content(value: unknown): HookEventContentBlock[] {
  if (!Array.isArray(value)) return [];
  const result: HookEventContentBlock[] = [];
  for (const entry of value) {
    if (result.length >= CONTENT_BLOCK_LIMIT) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const payload = entry as Record<string, unknown>;
    const text = nullable(payload.text);
    if (!text) continue;
    if (payload.type === "summary" || payload.type === "text") {
      result.push({ type: payload.type, text });
    } else if (payload.type === "code") {
      const title = nullable(payload.title, CONTENT_TITLE_LIMIT);
      const language = nullable(payload.language, CONTENT_LANGUAGE_LIMIT);
      result.push({ type: "code", text, ...(title ? { title } : {}), ...(language ? { language } : {}), collapsed: bool(payload.collapsed, true) });
    } else if (payload.type === "details") {
      result.push({ type: "details", title: readString(payload.title, "Details", CONTENT_TITLE_LIMIT), text, collapsed: bool(payload.collapsed, true) });
    }
  }
  return result;
}

export function normalizeHookEvent(body: unknown): HookEvent {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const source = readString(payload.source, "custom", 40);
  const sessionName = readString(payload.sessionName, "", 128);
  if (!validSessionName(sessionName)) throw new HookEventNormalizationError("Invalid hook session name");
  const eventType = readString(payload.eventType, "event", 80);
  const rawStatus = readString(payload.status, "info", 40);
  const rawSeverity = readString(payload.severity, "info", 40);
  return {
    schemaVersion: HOOK_EVENT_SCHEMA_VERSION,
    source,
    sessionName,
    eventType,
    status: STATUSES.has(rawStatus as HookEventStatus) ? rawStatus as HookEventStatus : "info",
    title: readString(payload.title, `${source} ${eventType}`, TITLE_LIMIT),
    body: nullable(payload.body),
    cwd: nullable(payload.cwd),
    taskId: nullable(payload.taskId, 160),
    severity: SEVERITIES.has(rawSeverity as HookEventSeverity) ? rawSeverity as HookEventSeverity : "info",
    target: optionalTarget(payload.target) ?? { sessionName, projectName: null, view: "terminal" },
    actions: actions(payload.actions),
    content: content(payload.content),
    metadata: normalizeEventMetadata(payload.metadata)
  };
}
