import express from "express";
import { createReadStream, existsSync } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, relative, resolve } from "node:path";

import {
  createTmuxService,
  type TmuxService,
  validateSessionName
} from "./services/tmux/createTmuxService.js";
import { createSessionRoutes } from "./routes/sessionRoutes.js";
import {
  getServerStatus,
  type ServerStatus
} from "./services/serverStatus/getServerStatus.js";
import { getAppInfo, type AppInfo } from "./services/appInfo/getAppInfo.js";
import {
  ImageUploadError,
  saveUploadedImage
} from "./services/uploads/imageUploadService.js";
import {
  fetchRemoteImage,
} from "./services/uploads/remoteImageUploadService.js";
import {
  createTimelineStore,
  type TimelineStore
} from "./services/timeline/createTimelineStore.js";
import type { AppEventHub } from "./services/events/createAppEventHub.js";
import {
  createPreferenceStore,
  type KanbanProject,
  type PreferenceStore
} from "./services/preferences/createPreferenceStore.js";
import {
  getDefaultKanbanSelectedSessionNames
} from "../shared/kanbanTemplates.js";
import { formatGroupMessage } from "./services/groupMessages/formatGroupMessage.js";
import { parseGroupReplies } from "./services/groupMessages/parseGroupReplies.js";
import { resolveGroupMessageTargets } from "./services/groupMessages/resolveGroupMessageTargets.js";
import { createGroupMessageStore } from "./services/groupMessages/createGroupMessageStore.js";
import { classifySessionRuntime } from "./services/groupMessages/classifySessionRuntime.js";
import type {
  CreateGroupMessageRequest,
  GroupMessageKind,
  GroupMessageTarget
} from "../shared/groupMessages.js";
import type {
  HookEvent,
  HookEventAction,
  HookEventActionStyle,
  HookEventContentBlock,
  HookEventTarget,
  HookEventTargetView,
  HookEventSeverity,
  HookEventStatus
} from "../shared/hookEvents.js";
import { HOOK_EVENT_SCHEMA_VERSION } from "../shared/hookEvents.js";
import type {
  ConversationMessageContentType,
  ConversationMessageRole,
  ConversationMessageStatus,
  ConversationMessageTimelineEvent
} from "../shared/timeline.js";

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#15181c"/><path d="M14 14h36v10H37v28H27V24H14z" fill="#b7ffb0"/></svg>`;
const UNGROUPED_PROJECT_NAME = "ungrouped";
const IMAGE_MIME_TYPES = new Map([
  [".apng", "image/apng"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);
const HOOK_TEXT_LIMIT = 4_000;
const HOOK_TITLE_LIMIT = 160;
const HOOK_METADATA_LIMIT = 24;
const HOOK_ACTION_LIMIT = 8;
const HOOK_ACTION_LABEL_LIMIT = 80;
const HOOK_TARGET_LIMIT = 128;
const HOOK_CONTENT_BLOCK_LIMIT = 12;
const HOOK_CONTENT_TITLE_LIMIT = 120;
const HOOK_CONTENT_LANGUAGE_LIMIT = 32;
const CONVERSATION_CONTENT_LIMIT = 20_000;
const CONVERSATION_ID_LIMIT = 160;
const CONVERSATION_TOOL_LIMIT = 120;
const HOOK_STATUSES = new Set<HookEventStatus>([
  "waiting",
  "blocked",
  "need-input",
  "running",
  "done",
  "failed",
  "info"
]);
const HOOK_SEVERITIES = new Set<HookEventSeverity>([
  "info",
  "warning",
  "error"
]);
const HOOK_ACTION_STYLES = new Set<HookEventActionStyle>([
  "primary",
  "secondary",
  "danger"
]);
const HOOK_TARGET_VIEWS = new Set<HookEventTargetView>([
  "terminal",
  "kanban"
]);
const CONVERSATION_ROLES = new Set<ConversationMessageRole>([
  "user",
  "assistant",
  "tool"
]);
const CONVERSATION_CONTENT_TYPES = new Set<ConversationMessageContentType>([
  "text",
  "code",
  "image",
  "command"
]);
const CONVERSATION_STATUSES = new Set<ConversationMessageStatus>([
  "streaming",
  "complete",
  "failed"
]);

class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

function stripPreview<T extends { preview?: string | null }>(session: T) {
  const { preview: _preview, ...lightweightSession } = session;

  return lightweightSession;
}

async function listLiveSessionNames(tmuxService: TmuxService) {
  if (tmuxService.listSessionNames) {
    return tmuxService.listSessionNames();
  }

  return (await tmuxService.listSessions({ includePreview: false })).map(
    (session) => session.name
  );
}

function parseSessionNameList(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  return [...new Set(value.split(",").map((name) => name.trim()).filter(Boolean))];
}

function optionalSessionNameList(value: unknown) {
  const names = parseSessionNameList(value);

  return names.length > 0 ? names : undefined;
}

function normalizeSelectedAgentNames(value: unknown) {
  if (!Array.isArray(value)) {
    return getDefaultKanbanSelectedSessionNames();
  }

  return [
    ...new Set(
      value
        .filter((agentName): agentName is string => typeof agentName === "string")
        .map((agentName) => agentName.trim())
        .filter(Boolean)
    )
  ];
}

function normalizeKanbanProjectPayload(body: unknown): {
  project: KanbanProject;
  selectedAgentNames: string[];
} {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const path = typeof payload.path === "string" ? payload.path.trim() : "";
  const server =
    typeof payload.server === "string" && payload.server.trim()
      ? payload.server.trim()
      : null;
  const selectedAgentNames = normalizeSelectedAgentNames(payload.selectedAgentNames);
  const agents = Array.isArray(payload.agents)
    ? payload.agents
        .map((agent) => {
          if (!agent || typeof agent !== "object") {
            return null;
          }

          const agentRecord = agent as Record<string, unknown>;
          const kind =
            typeof agentRecord.kind === "string" ? agentRecord.kind.trim() : "";
          const agentName =
            typeof agentRecord.name === "string" ? agentRecord.name.trim() : "";
          const command =
            typeof agentRecord.command === "string" && agentRecord.command.trim()
              ? agentRecord.command.trim()
              : null;
          const sessionName =
            typeof agentRecord.sessionName === "string" &&
            agentRecord.sessionName.trim()
              ? agentRecord.sessionName.trim()
              : undefined;

          if (!kind || !agentName) {
            return null;
          }

          return {
            kind,
            name: agentName,
            command,
            ...(sessionName ? { sessionName } : {})
          };
        })
        .filter((agent): agent is KanbanProject["agents"][number] => agent !== null)
    : [];

  if (!name || !path) {
    throw new HttpError("Kanban project requires name and path", 400);
  }

  if (name.toLowerCase() === UNGROUPED_PROJECT_NAME) {
    throw new HttpError(
      "ungrouped is reserved for the virtual kanban group",
      400
    );
  }

  return {
    project: {
      name,
      path,
      server,
      agents
    },
    selectedAgentNames
  };
}

function readString(
  value: unknown,
  options: { fallback?: string; maxLength?: number } = {}
) {
  const fallback = options.fallback ?? "";
  const maxLength = options.maxLength ?? HOOK_TEXT_LIMIT;

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}

function readNullableString(value: unknown, maxLength = HOOK_TEXT_LIMIT) {
  const normalized = readString(value, { maxLength });

  return normalized || null;
}

function readOptionalRawString(value: unknown, maxLength = HOOK_TEXT_LIMIT) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value.slice(0, maxLength);
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeHookStatus(value: unknown): HookEventStatus {
  const normalized = readString(value, { fallback: "info", maxLength: 40 });

  return HOOK_STATUSES.has(normalized as HookEventStatus)
    ? (normalized as HookEventStatus)
    : "info";
}

function normalizeHookSeverity(value: unknown): HookEventSeverity {
  const normalized = readString(value, { fallback: "info", maxLength: 40 });

  return HOOK_SEVERITIES.has(normalized as HookEventSeverity)
    ? (normalized as HookEventSeverity)
    : "info";
}

function normalizeHookTargetView(value: unknown): HookEventTargetView {
  const normalized = readString(value, {
    fallback: "terminal",
    maxLength: 40
  });

  return HOOK_TARGET_VIEWS.has(normalized as HookEventTargetView)
    ? (normalized as HookEventTargetView)
    : "terminal";
}

function normalizeHookActionStyle(value: unknown): HookEventActionStyle {
  const normalized = readString(value, {
    fallback: "secondary",
    maxLength: 40
  });

  return HOOK_ACTION_STYLES.has(normalized as HookEventActionStyle)
    ? (normalized as HookEventActionStyle)
    : "secondary";
}

function readHookTargetString(
  payload: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = readNullableString(payload[key], HOOK_TARGET_LIMIT);

    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeOptionalHookTarget(value: unknown): HookEventTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const sessionName = readHookTargetString(payload, [
    "sessionName",
    "session",
    "session_name"
  ]);

  if (sessionName) {
    try {
      validateSessionName(sessionName);
    } catch {
      throw new HttpError("Invalid hook target session name", 400);
    }
  }

  return {
    sessionName,
    projectName: readHookTargetString(payload, [
      "projectName",
      "project",
      "groupName",
      "group"
    ]),
    view: normalizeHookTargetView(payload.view)
  };
}

function normalizeHookTarget(
  value: unknown,
  fallbackSessionName: string
): HookEventTarget {
  return normalizeOptionalHookTarget(value) ?? {
    sessionName: fallbackSessionName,
    projectName: null,
    view: "terminal"
  };
}

function normalizeHookActions(value: unknown): HookEventAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const actions: HookEventAction[] = [];
  const seenIds = new Set<string>();

  for (const [index, entry] of value.entries()) {
    if (actions.length >= HOOK_ACTION_LIMIT) {
      break;
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const payload = entry as Record<string, unknown>;
    const fallbackId = `action-${index + 1}`;
    let id = readString(payload.id, {
      fallback: fallbackId,
      maxLength: HOOK_ACTION_LABEL_LIMIT
    });

    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }

    seenIds.add(id);
    const label = readString(payload.label, {
      fallback: id,
      maxLength: HOOK_ACTION_LABEL_LIMIT
    });

    actions.push({
      id,
      label,
      input: readOptionalRawString(payload.input),
      open: readBoolean(payload.open),
      target: normalizeOptionalHookTarget(payload.target),
      style: normalizeHookActionStyle(payload.style)
    });
  }

  return actions;
}

function normalizeHookContentBlocks(value: unknown): HookEventContentBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const blocks: HookEventContentBlock[] = [];

  for (const entry of value) {
    if (blocks.length >= HOOK_CONTENT_BLOCK_LIMIT) {
      break;
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const payload = entry as Record<string, unknown>;
    const type = payload.type;
    const text = readNullableString(payload.text);

    if (!text) {
      continue;
    }

    if (type === "summary" || type === "text") {
      blocks.push({ type, text });
      continue;
    }

    if (type === "code") {
      const title = readNullableString(payload.title, HOOK_CONTENT_TITLE_LIMIT);
      const language = readNullableString(
        payload.language,
        HOOK_CONTENT_LANGUAGE_LIMIT
      );
      blocks.push({
        type: "code",
        text,
        ...(title ? { title } : {}),
        ...(language ? { language } : {}),
        collapsed: readBoolean(payload.collapsed, true)
      });
      continue;
    }

    if (type === "details") {
      blocks.push({
        type: "details",
        title: readString(payload.title, {
          fallback: "Details",
          maxLength: HOOK_CONTENT_TITLE_LIMIT
        }),
        text,
        collapsed: readBoolean(payload.collapsed, true)
      });
    }
  }

  return blocks;
}

function normalizeHookMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const metadata: Record<string, string | number | boolean | null> = {};

  for (const [key, entry] of Object.entries(value).slice(0, HOOK_METADATA_LIMIT)) {
    const normalizedKey = key.trim().slice(0, 80);

    if (!normalizedKey) {
      continue;
    }

    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null
    ) {
      metadata[normalizedKey] =
        typeof entry === "string" ? entry.slice(0, HOOK_TEXT_LIMIT) : entry;
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function normalizeHookEventPayload(body: unknown): HookEvent {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const source = readString(payload.source, {
    fallback: "custom",
    maxLength: 40
  });
  const sessionName = readString(payload.sessionName, { maxLength: 128 });

  try {
    validateSessionName(sessionName);
  } catch {
    throw new HttpError("Invalid hook session name", 400);
  }

  const eventType = readString(payload.eventType, {
    fallback: "event",
    maxLength: 80
  });
  const status = normalizeHookStatus(payload.status);
  const title = readString(payload.title, {
    fallback: `${source} ${eventType}`,
    maxLength: HOOK_TITLE_LIMIT
  });

  return {
    schemaVersion: HOOK_EVENT_SCHEMA_VERSION,
    source,
    sessionName,
    eventType,
    status,
    title,
    body: readNullableString(payload.body),
    cwd: readNullableString(payload.cwd),
    taskId: readNullableString(payload.taskId, 160),
    severity: normalizeHookSeverity(payload.severity),
    target: normalizeHookTarget(payload.target, sessionName),
    actions: normalizeHookActions(payload.actions),
    content: normalizeHookContentBlocks(payload.content),
    metadata: normalizeHookMetadata(payload.metadata)
  };
}

function createConversationMessageId() {
  return `msg_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeConversationRole(value: unknown): ConversationMessageRole {
  const normalized = readString(value, {
    fallback: "assistant",
    maxLength: 40
  });

  return CONVERSATION_ROLES.has(normalized as ConversationMessageRole)
    ? (normalized as ConversationMessageRole)
    : "assistant";
}

function normalizeConversationContentType(
  value: unknown
): ConversationMessageContentType {
  const normalized = readString(value, {
    fallback: "text",
    maxLength: 40
  });

  return CONVERSATION_CONTENT_TYPES.has(
    normalized as ConversationMessageContentType
  )
    ? (normalized as ConversationMessageContentType)
    : "text";
}

function normalizeConversationStatus(value: unknown): ConversationMessageStatus {
  const normalized = readString(value, {
    fallback: "complete",
    maxLength: 40
  });

  return CONVERSATION_STATUSES.has(normalized as ConversationMessageStatus)
    ? (normalized as ConversationMessageStatus)
    : "complete";
}

function normalizeConversationMessagePayload(
  body: unknown
): Omit<ConversationMessageTimelineEvent, "id" | "createdAt"> {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const sessionName = readString(payload.sessionName, { maxLength: 128 });
  const content = readOptionalRawString(
    payload.content,
    CONVERSATION_CONTENT_LIMIT
  );

  try {
    validateSessionName(sessionName);
  } catch {
    throw new HttpError("Invalid conversation session name", 400);
  }

  if (!content) {
    throw new HttpError("Conversation content is required", 400);
  }

  return {
    type: "conversation-message",
    messageId:
      readNullableString(payload.messageId, CONVERSATION_ID_LIMIT) ??
      createConversationMessageId(),
    sessionName,
    role: normalizeConversationRole(payload.role),
    contentType: normalizeConversationContentType(payload.contentType),
    content,
    status: normalizeConversationStatus(payload.status),
    toolName: readNullableString(payload.toolName, CONVERSATION_TOOL_LIMIT),
    parentMessageId: readNullableString(
      payload.parentMessageId,
      CONVERSATION_ID_LIMIT
    ),
    metadata: normalizeHookMetadata(payload.metadata)
  };
}

function getHookBearerToken(req: express.Request) {
  const authorization = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);

  return match?.[1] ?? req.get("x-tmux-ui-hook-token") ?? "";
}

function normalizeRemoteAddress(value: string | undefined | null) {
  if (!value) {
    return "";
  }

  const firstAddress = value.split(",")[0]?.trim() ?? "";

  if (firstAddress.startsWith("::ffff:")) {
    return firstAddress.slice("::ffff:".length);
  }

  return firstAddress;
}

function isTailscaleAddress(address: string) {
  const parts = address.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;

  return first === 100 && second !== undefined && second >= 64 && second <= 127;
}

function isLocalHookAddress(address: string) {
  return address === "127.0.0.1" || address === "::1" || address === "localhost";
}

export function getHookRemoteAddress(req: {
  ip?: string;
  socket?: { remoteAddress?: string | null };
}) {
  return normalizeRemoteAddress(req.ip ?? req.socket?.remoteAddress);
}

export function isTrustedHookRemoteAddress(address: string) {
  return isLocalHookAddress(address) || isTailscaleAddress(address);
}

function isTrustedHookSource(req: express.Request) {
  const address = getHookRemoteAddress(req);

  return isTrustedHookRemoteAddress(address);
}

function assertHookAuthorized(req: express.Request, hookToken: string) {
  if (isTrustedHookSource(req)) {
    return;
  }

  if (!hookToken) {
    throw new HttpError("Hook token is not configured", 503);
  }

  if (getHookBearerToken(req) !== hookToken) {
    throw new HttpError("Invalid hook token", 401);
  }
}

function normalizeGroupMessageTarget(value: unknown): GroupMessageTarget {
  const target = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};

  if (target.type === "others") {
    return { type: "others" };
  }

  if (target.type === "session" && typeof target.sessionName === "string") {
    const sessionName = target.sessionName.trim();

    if (sessionName) {
      return { type: "session", sessionName };
    }
  }

  if (target.type === "role" && typeof target.role === "string") {
    const role = target.role.trim();

    if (role) {
      return { type: "role", role };
    }
  }

  throw new HttpError("Invalid group message target", 400);
}

function normalizeGroupMessageRequest(body: unknown): CreateGroupMessageRequest {
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fromSession =
    typeof payload.fromSession === "string" ? payload.fromSession.trim() : "";
  const kind = payload.kind as GroupMessageKind;
  const messageBody = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!fromSession) {
    throw new HttpError("Group message fromSession is required", 400);
  }

  if (kind !== "task" && kind !== "report") {
    throw new HttpError("Invalid group message kind", 400);
  }

  if (!messageBody) {
    throw new HttpError("Group message body is required", 400);
  }

  return {
    fromSession,
    kind,
    target: normalizeGroupMessageTarget(payload.target),
    body: messageBody
  };
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapePrintfBody(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function createGroupMessageDeliveryInput(
  formattedMessage: string,
  currentCommand: string | null | undefined
) {
  const runtime = classifySessionRuntime(currentCommand);

  if (runtime.kind === "agent") {
    return {
      mode: "agent-input" as const,
      input: `${formattedMessage}\r`
    };
  }

  if (runtime.kind === "shell") {
    return {
      mode: "shell-print" as const,
      input: `printf '%b\\n' ${shellSingleQuote(escapePrintfBody(formattedMessage))}\r`
    };
  }

  throw new Error(
    `Unsupported target command for group message: ${currentCommand ?? "unknown"}`
  );
}

function getGroupMessageDeliveryMode(currentCommand: string | null | undefined) {
  const runtime = classifySessionRuntime(currentCommand);

  if (runtime.kind === "agent") {
    return "agent-input" as const;
  }

  if (runtime.kind === "shell") {
    return "shell-print" as const;
  }

  return undefined;
}

function normalizeSessionNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getKanbanAgentSessionName(projectName: string, agentName: string) {
  const normalizedProjectName = normalizeSessionNamePart(projectName);
  const normalizedAgentName = normalizeSessionNamePart(agentName);

  if (!normalizedProjectName || !normalizedAgentName) {
    throw new HttpError("Invalid kanban session name", 400);
  }

  return `${normalizedProjectName}-${normalizedAgentName}`;
}

function getKanbanAgentActualSessionName(projectName: string, agent: KanbanProject["agents"][number]) {
  return agent.sessionName ?? getKanbanAgentSessionName(projectName, agent.name);
}

function getKanbanSessionNames(projects: KanbanProject[]) {
  return new Set(
    projects.flatMap((project) =>
      project.agents.map((agent) =>
        getKanbanAgentActualSessionName(project.name, agent)
      )
    )
  );
}

function createUngroupedProject(
  sessions: Array<{ name: string }>,
  projects: KanbanProject[]
): KanbanProject {
  const groupedSessionNames = getKanbanSessionNames(projects);

  return {
    name: UNGROUPED_PROJECT_NAME,
    path: "~",
    server: null,
    agents: sessions
      .map((session) => session.name)
      .filter((sessionName) => !groupedSessionNames.has(sessionName))
      .map((sessionName) => ({
        kind: "session",
        name: sessionName,
        command: null,
        sessionName
      }))
  };
}

function resolvePreviewImagePath(imagePath: string, basePath: string | undefined) {
  const trimmedPath = imagePath.trim();

  if (!trimmedPath) {
    throw new HttpError("Image path is required", 400);
  }

  if (trimmedPath.startsWith("~/")) {
    return resolve(homedir(), trimmedPath.slice(2));
  }

  if (isAbsolute(trimmedPath)) {
    return resolve(trimmedPath);
  }

  return resolve(basePath?.trim() || process.cwd(), trimmedPath);
}

function getImagePreviewRoots(optionRoots: string[] | undefined) {
  const envRoots = process.env.TMUX_UI_IMAGE_ROOTS?.split(",")
    .map((root) => root.trim())
    .filter(Boolean);
  const roots = optionRoots?.length ? optionRoots : envRoots?.length ? envRoots : [homedir()];

  return roots.map((root) => resolve(root));
}

function isPathInsideRoot(path: string, root: string) {
  const pathRelativeToRoot = relative(root, path);

  return (
    pathRelativeToRoot === "" ||
    (!pathRelativeToRoot.startsWith("..") && !isAbsolute(pathRelativeToRoot))
  );
}

async function getRealPreviewRoots(roots: string[]) {
  return Promise.all(
    roots.map(async (root) => {
      try {
        return await realpath(root);
      } catch {
        return root;
      }
    })
  );
}

async function resolvePreviewImageFile(
  imagePath: string,
  basePath: string | undefined,
  roots: string[]
) {
  const resolvedPath = resolvePreviewImagePath(imagePath, basePath);
  const extension = extname(resolvedPath).toLowerCase();
  const contentType = IMAGE_MIME_TYPES.get(extension);

  if (!contentType) {
    throw new HttpError("Unsupported image type", 415);
  }

  let linkStats;

  try {
    linkStats = await lstat(resolvedPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      throw new HttpError("Image not found", 404);
    }

    throw error;
  }

  if (linkStats.isSymbolicLink()) {
    throw new HttpError("Image symlinks are not allowed", 403);
  }

  if (!linkStats.isFile()) {
    throw new HttpError("Image not found", 404);
  }

  const realPath = await realpath(resolvedPath);
  const realRoots = await getRealPreviewRoots(roots);

  if (!realRoots.some((root) => isPathInsideRoot(realPath, root))) {
    throw new HttpError("Image path is outside allowed roots", 403);
  }

  const stats = await stat(realPath);

  if (!stats.isFile()) {
    throw new HttpError("Image not found", 404);
  }

  return {
    contentType,
    path: realPath,
    size: stats.size
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getImageViewPath(req: express.Request) {
  const queryPath =
    typeof req.query.path === "string"
      ? req.query.path
      : typeof req.query.image === "string"
        ? req.query.image
        : "";

  if (queryPath) {
    return queryPath;
  }

  if (req.path.startsWith("/view/")) {
    return safeDecodeURIComponent(req.path.slice("/view/".length));
  }

  return "";
}

function getImagePreviewSrc(imagePath: string, basePath: string | undefined) {
  const params = new URLSearchParams({ path: imagePath });

  if (basePath) {
    params.set("basePath", basePath);
  }

  return `/api/image-preview?${params.toString()}`;
}

function renderImageViewPage(imagePath: string, basePath: string | undefined) {
  const escapedPath = escapeHtml(imagePath);
  const escapedBasePath = escapeHtml(basePath ?? "");
  const imageSrc = imagePath ? getImagePreviewSrc(imagePath, basePath) : "";
  const escapedImageSrc = escapeHtml(imageSrc);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tmux-ui image view</title>
  <style>
    :root { color-scheme: dark; font-family: "Iosevka Term", Menlo, "PingFang SC", monospace; background: #05080b; color: #d9e2ea; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; grid-template-rows: auto 1fr; background: radial-gradient(circle at 18% 12%, rgba(112, 255, 179, 0.12), transparent 24rem), #05080b; }
    header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.75rem; align-items: center; padding: 0.55rem 0.75rem; border-bottom: 1px solid rgba(217, 226, 234, 0.16); background: rgba(16, 22, 28, 0.92); }
    form { display: grid; grid-template-columns: minmax(10rem, 1fr) minmax(8rem, 0.35fr) auto; gap: 0.45rem; min-width: 0; }
    input, button, a { border: 1px solid rgba(217, 226, 234, 0.24); border-radius: 3px; background: rgba(255, 255, 255, 0.075); color: #eff6fc; font: inherit; font-size: 0.78rem; min-height: 30px; padding: 0.28rem 0.5rem; }
    input { min-width: 0; background: rgba(0, 0, 0, 0.24); }
    button, a { cursor: pointer; font-weight: 700; text-decoration: none; }
    main { min-height: 0; overflow: auto; display: grid; place-items: center; padding: 0.75rem; background-image: linear-gradient(45deg, rgba(255,255,255,.035) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,.035) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,.035) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.035) 75%); background-size: 24px 24px; background-position: 0 0, 0 12px, 12px -12px, -12px 0; }
    img { max-width: 100%; max-height: calc(100vh - 4.4rem); object-fit: contain; box-shadow: 0 16px 70px rgba(0,0,0,.35); }
    .empty, .error { border: 1px solid rgba(217, 226, 234, 0.18); border-radius: 4px; background: rgba(16, 22, 28, 0.88); padding: 1rem; color: rgba(217, 226, 234, 0.76); }
    .error { display: none; color: #ffae98; border-color: rgba(255, 174, 152, 0.32); }
    body.image-error .error { display: block; }
    body.image-error img { display: none; }
    @media (max-width: 720px) { header { grid-template-columns: 1fr; } form { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <form method="get" action="/view">
      <input name="path" value="${escapedPath}" placeholder="/tmp/example.png or ./dist/image.png" autofocus>
      <input name="basePath" value="${escapedBasePath}" placeholder="base path optional">
      <button type="submit">View</button>
    </form>
    ${imagePath ? `<a href="${escapedImageSrc}" target="_blank" rel="noreferrer">Raw</a>` : ""}
  </header>
  <main>
    ${
      imagePath
        ? `<img src="${escapedImageSrc}" alt="${escapedPath}" onerror="document.body.classList.add('image-error')"><div class="error">Image failed to load: ${escapedPath}</div>`
        : `<div class="empty">Open an image with <code>/view?path=/tmp/example.png</code> or <code>/view/%2Ftmp%2Fexample.png</code>.</div>`
    }
  </main>
</body>
</html>`;
}

export function createApp(options: {
  tmuxService?: TmuxService;
  killSession?: (name: string) => Promise<void>;
  getServerStatus?: () => ServerStatus;
  getAppInfo?: () => AppInfo;
  imagePreviewRoots?: string[];
  uploadDir?: string;
  uploadRetentionMs?: number;
  uploadMaxTotalBytes?: number;
  fetchRemoteImage?: (url: string) => Promise<Buffer>;
  timelineStore?: TimelineStore;
  eventHub?: AppEventHub;
  preferences?: PreferenceStore;
  hookToken?: string;
  trustedProxy?: boolean | number | string | string[];
} = {}) {
  const tmuxService = options.tmuxService ?? createTmuxService();
  const readServerStatus = options.getServerStatus ?? getServerStatus;
  const readAppInfo = options.getAppInfo ?? getAppInfo;
  const timelineStore = options.timelineStore ?? createTimelineStore();
  const preferences = options.preferences ?? createPreferenceStore();
  const groupMessageStore = createGroupMessageStore();
  const imagePreviewRoots = getImagePreviewRoots(options.imagePreviewRoots);
  const uploadOptions = {
    uploadDir: options.uploadDir,
    retentionMs: options.uploadRetentionMs,
    maxTotalBytes: options.uploadMaxTotalBytes
  };
  const fetchRemoteImageBody = options.fetchRemoteImage ?? fetchRemoteImage;
  const hookToken = options.hookToken ?? process.env.TMUX_UI_HOOK_TOKEN ?? "";
  const app = express();
  const clientDistDir = resolve(process.cwd(), "dist/client");

  if (options.trustedProxy !== undefined) {
    app.set("trust proxy", options.trustedProxy);
  }

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ...readAppInfo() });
  });

  app.get("/favicon.ico", (_req, res) => {
    res
      .status(200)
      .type("image/svg+xml")
      .set("Cache-Control", "public, max-age=86400")
      .end(faviconSvg);
  });

  app.get("/favicon.svg", (_req, res) => {
    res
      .status(200)
      .type("image/svg+xml")
      .set("Cache-Control", "public, max-age=86400")
      .end(faviconSvg);
  });

  app.get("/api/server-status", (_req, res) => {
    res.json(readServerStatus());
  });

  app.get("/api/timeline", (req, res) => {
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    res.json({ events: timelineStore.listEvents({ limit }) });
  });

  app.post("/api/conversation/messages", (req, res, next) => {
    try {
      const conversationMessage = normalizeConversationMessagePayload(req.body);
      const timelineEvent = timelineStore.addEvent(
        conversationMessage
      ) as ConversationMessageTimelineEvent;
      const appEvent = options.eventHub?.publish(timelineEvent);

      res.status(201).json({
        ok: true,
        message: appEvent ?? timelineEvent
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/hooks/events", (req, res, next) => {
    try {
      assertHookAuthorized(req, hookToken);
      const hookEvent = normalizeHookEventPayload(req.body);
      const timelineEvent = timelineStore.addEvent({
        type: "hook-event",
        sessionName: hookEvent.sessionName,
        message: hookEvent.title,
        metadata: {
          ...(hookEvent.metadata ?? {}),
          source: hookEvent.source,
          eventType: hookEvent.eventType,
          status: hookEvent.status,
          severity: hookEvent.severity,
          taskId: hookEvent.taskId,
          cwd: hookEvent.cwd,
          body: hookEvent.body,
          target: JSON.stringify(hookEvent.target),
          actions: JSON.stringify(hookEvent.actions),
          ...(hookEvent.content.length > 0
            ? { content: JSON.stringify(hookEvent.content) }
            : {})
        }
      });
      const appEvent = options.eventHub?.publish({
        type: "hook-event",
        ...hookEvent
      });

      res.status(202).json({
        ok: true,
        event: {
          type: "hook-event",
          ...hookEvent,
          id: appEvent?.id ?? timelineEvent.id,
          createdAt: appEvent?.createdAt ?? timelineEvent.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/preferences", (_req, res) => {
    res.json(preferences.getPreferences());
  });

  app.patch("/api/preferences/pinned-sessions/:name", async (req, res, next) => {
    try {
      await preferences.setPinnedSession(
        req.params.name,
        req.body.pinned === true
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/preferences/muted-sessions/:name", async (req, res, next) => {
    try {
      await preferences.setMutedSession(req.params.name, req.body.muted === true);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/preferences/session-settings/:name", async (req, res, next) => {
    try {
      await preferences.setSessionSettings(req.params.name, req.body.settings);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/kanban/projects", async (_req, res, next) => {
    try {
      const liveSessionNames = await listLiveSessionNames(tmuxService);
      const nextPreferences = await preferences.syncKanbanSessions(liveSessionNames);

      res.json({ projects: nextPreferences.kanbanProjects });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kanban/projects", async (req, res, next) => {
    try {
      const { project, selectedAgentNames } = normalizeKanbanProjectPayload(req.body);
      const selectedAgents = project.agents.filter((agent) =>
        selectedAgentNames.includes(agent.name)
      );
      const createdSessions =
        selectedAgents.length === 0
          ? []
          : await tmuxService.createProjectSessions({
              projectName: project.name,
              projectPath: project.path,
              server: project.server,
              agents: selectedAgents.map((agent) => ({
                name: agent.name,
                command: agent.command
              }))
            });
      const nextPreferences = await preferences.upsertKanbanProject(project);

      options.eventHub?.publish({
        type: "sessions-invalidated",
        reason: "session-created",
        sessionName: project.name
      });
      res.status(201).json({
        ok: true,
        sessions: createdSessions,
        preferences: nextPreferences
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/kanban/projects/:name", async (req, res, next) => {
    try {
      await preferences.deleteKanbanProject(req.params.name);
      groupMessageStore.deleteProjectMessages(req.params.name);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kanban/projects/:name/sessions", async (req, res, next) => {
    try {
      const sessionName =
        typeof req.body.sessionName === "string" ? req.body.sessionName.trim() : "";

      if (!sessionName) {
        throw new HttpError("Kanban session name is required", 400);
      }

      const nextPreferences = await preferences.addKanbanSession(
        req.params.name,
        sessionName
      );
      options.eventHub?.publish({
        type: "sessions-invalidated",
        reason: "session-created",
        sessionName
      });
      res.json({ ok: true, preferences: nextPreferences });
    } catch (error) {
      next(error);
    }
  });

  app.delete(
    "/api/kanban/projects/:name/sessions/:agent",
    async (req, res, next) => {
      try {
        const sessionName = req.params.agent.includes("-")
          ? req.params.agent
          : getKanbanAgentSessionName(req.params.name, req.params.agent);
        const shouldKill = req.query.kill === "true";

        if (shouldKill) {
          await (options.killSession ?? tmuxService.killSession)(sessionName);
        }

        const nextPreferences = await preferences.removeKanbanSession(sessionName);
        options.eventHub?.publish({
          type: "sessions-invalidated",
          reason: "session-killed",
          sessionName
        });
        res.json({ ok: true, preferences: nextPreferences });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/kanban/projects/:name/messages", (req, res, next) => {
    try {
      const projectExists =
        req.params.name === UNGROUPED_PROJECT_NAME ||
        preferences
          .getPreferences()
          .kanbanProjects.some((project) => project.name === req.params.name);

      if (!projectExists) {
        throw new HttpError("Kanban project not found", 404);
      }

      res.json({
        messages: groupMessageStore.listProjectMessages(req.params.name)
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kanban/projects/:name/messages", async (req, res, next) => {
    try {
      const payload = normalizeGroupMessageRequest(req.body);
      const sessions = await tmuxService.listSessions({ includePreview: false });
      const configuredProjects = preferences.getPreferences().kanbanProjects;
      const project =
        req.params.name === UNGROUPED_PROJECT_NAME
          ? createUngroupedProject(sessions, configuredProjects)
          : configuredProjects.find((candidate) => candidate.name === req.params.name);

      if (!project) {
        throw new HttpError("Kanban project not found", 404);
      }

      const sessionByName = new Map(
        sessions.map((session) => [session.name, session])
      );
      let resolvedTargets;

      try {
        resolvedTargets = resolveGroupMessageTargets({
          project,
          liveSessionNames: sessions.map((session) => session.name),
          fromSession: payload.fromSession,
          target: payload.target
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "No live target sessions found"
        ) {
          throw new HttpError(error.message, 400);
        }

        throw error;
      }

      let message = groupMessageStore.createMessage({
        projectName: project.name,
        fromSession: payload.fromSession,
        toSessions: resolvedTargets.sessions,
        kind: payload.kind,
        body: payload.body,
        warnings: resolvedTargets.warnings
      });

      for (const sessionName of resolvedTargets.sessions) {
        try {
          const deliveryInput = createGroupMessageDeliveryInput(
            formatGroupMessage({
              id: message.id,
              projectName: project.name,
              fromSession: payload.fromSession,
              toSession: sessionName,
              kind: payload.kind,
              body: payload.body
            }),
            sessionByName.get(sessionName)?.currentCommand
          );
          await (tmuxService.sendLiteralInput ?? tmuxService.sendInput)(
            sessionName,
            deliveryInput.input
          );
          message = groupMessageStore.markDelivery(message.id, sessionName, {
            status: "sent",
            mode: deliveryInput.mode
          });
        } catch (error) {
          message = groupMessageStore.markDelivery(message.id, sessionName, {
            status: "failed",
            mode: getGroupMessageDeliveryMode(
              sessionByName.get(sessionName)?.currentCommand
            ),
            error: error instanceof Error ? error.message : "Delivery failed"
          });
        }
      }

      timelineStore.addEvent({
        type: "group-message-sent",
        sessionName: payload.fromSession,
        message: `sent ${payload.kind} to ${resolvedTargets.sessions.length} group session(s)`,
        metadata: {
          projectName: project.name,
          messageId: message.id,
          targetCount: resolvedTargets.sessions.length
        }
      });
      options.eventHub?.publish({
        type: "sessions-invalidated",
        reason: "group-message-updated",
        sessionName: payload.fromSession
      });

      res.status(201).json({ ok: true, message });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/kanban/projects/:name/messages/:messageId/scan",
    async (req, res, next) => {
      try {
        const message = groupMessageStore.getMessage(
          req.params.name,
          req.params.messageId
        );

        if (!message) {
          throw new HttpError("Group message not found", 404);
        }

        const repliedSessions = new Set(
          message.replies.map((reply) => reply.fromSession)
        );
        const sessionsToScan = message.deliveries
          .filter(
            (delivery) =>
              delivery.status === "sent" &&
              !repliedSessions.has(delivery.sessionName)
          )
          .map((delivery) => delivery.sessionName);
        const capturedAt = new Date().toISOString();
        const replies = [];

        for (const sessionName of sessionsToScan) {
          const output = await tmuxService.captureRecentOutput(sessionName, 300);
          replies.push(
            ...parseGroupReplies(output)
              .filter((reply) => reply.messageId === message.id)
              .map((reply) => ({
                ...reply,
                capturedAt
              }))
          );
        }

        const updatedMessage = replies.length > 0
          ? groupMessageStore.addReplies(message.id, replies)
          : message;

        if (replies.length > 0) {
          timelineStore.addEvent({
            type: "group-message-replied",
            sessionName: message.fromSession,
            message: `captured ${replies.length} group message repl${replies.length === 1 ? "y" : "ies"}`,
            metadata: {
              projectName: message.projectName,
              messageId: message.id,
              replyCount: replies.length
            }
          });
          options.eventHub?.publish({
            type: "sessions-invalidated",
            reason: "group-message-updated",
            sessionName: message.fromSession
          });
        }

        res.json({ ok: true, message: updatedMessage });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/uploads/image",
    express.raw({ type: "*/*", limit: "10mb" }),
    async (req, res, next) => {
      try {
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const upload = await saveUploadedImage(
          body,
          req.header("X-Tmux-Session"),
          uploadOptions
        );

        res.status(201).json(upload);
      } catch (error) {
        if (error instanceof ImageUploadError) {
          res.status(error.statusCode).json({ error: error.message });
          return;
        }

        next(error);
      }
    }
  );

  app.post("/api/uploads/image-url", async (req, res, next) => {
    try {
      if (!req.is("application/json")) {
        throw new ImageUploadError("Image url payload must be JSON", 400);
      }

      const url = typeof req.body?.url === "string" ? req.body.url : "";
      const body = await fetchRemoteImageBody(url);
      const upload = await saveUploadedImage(
        body,
        req.header("X-Tmux-Session"),
        uploadOptions
      );

      res.status(201).json(upload);
    } catch (error) {
      if (error instanceof ImageUploadError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  app.get("/api/image-preview", async (req, res, next) => {
    try {
      const imagePath = String(req.query.path ?? "");
      const basePath =
        typeof req.query.basePath === "string" ? req.query.basePath : undefined;
      const image = await resolvePreviewImageFile(
        imagePath,
        basePath,
        imagePreviewRoots
      );

      res
        .status(200)
        .type(image.contentType)
        .set("Cache-Control", "no-store")
        .set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'")
        .set("X-Content-Type-Options", "nosniff")
        .set("X-Preview-Image-Path", image.path);
      createReadStream(image.path).pipe(res);
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }

      next(error);
    }
  });

  app.get("/api/image-preview-info", async (req, res, next) => {
    try {
      const imagePath = String(req.query.path ?? "");
      const basePath =
        typeof req.query.basePath === "string" ? req.query.basePath : undefined;
      const image = await resolvePreviewImageFile(
        imagePath,
        basePath,
        imagePreviewRoots
      );

      res.status(200).json({
        ok: true,
        path: image.path,
        contentType: image.contentType,
        size: image.size
      });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({ ok: false, error: error.message });
        return;
      }

      next(error);
    }
  });

  app.get(/^\/view(?:\/.*)?$/, (req, res) => {
    const imagePath = getImageViewPath(req);
    const basePath =
      typeof req.query.basePath === "string" ? req.query.basePath : undefined;

    res
      .status(200)
      .type("html")
      .set("Cache-Control", "no-store")
      .send(renderImageViewPage(imagePath, basePath));
  });

  app.get("/api/sessions-all", async (req, res, next) => {
    try {
      res.json(
        await tmuxService.listSessions({
          includePreview: true,
          includePanes: true,
          includeInputPrompt: true,
          ...(optionalSessionNameList(req.query.only)
            ? { onlySessionNames: optionalSessionNameList(req.query.only) }
            : {})
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions-panes", async (req, res, next) => {
    try {
      res.json(
        (
          await tmuxService.listSessions({
            includePreview: false,
            includePanes: true,
            includeInputPrompt: true,
            ...(optionalSessionNameList(req.query.muted)
              ? { mutedSessionNames: optionalSessionNameList(req.query.muted) }
              : {})
          })
        ).map(stripPreview)
      );
    } catch (error) {
      next(error);
    }
  });

  app.use(
    "/api/sessions",
    createSessionRoutes({
      listSessions: tmuxService.listSessions,
      getSessionStatus: tmuxService.getSessionStatus,
      createSession: tmuxService.createSession,
      renameSession: tmuxService.renameSession,
      killSession: options.killSession ?? tmuxService.killSession,
      sendCommand: tmuxService.sendCommand,
      sendInput: tmuxService.sendInput,
      splitPane: tmuxService.splitPane,
      selectPane: tmuxService.selectPane,
      killPane: tmuxService.killPane,
      timeline: timelineStore,
      eventHub: options.eventHub,
      preferences
    })
  );

  if (existsSync(clientDistDir)) {
    app.use(express.static(clientDistDir));

    app.get("/{*path}", (_req, res, next) => {
      if (_req.path.startsWith("/api/") || _req.path.startsWith("/ws/")) {
        next();
        return;
      }

      res.sendFile(resolve(clientDistDir, "index.html"));
    });
  }

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message =
        error instanceof Error ? error.message : "Unexpected server error";
      const explicitStatusCode =
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        typeof (error as { statusCode?: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : null;
      const statusCode =
        explicitStatusCode ??
        (error instanceof HttpError
          ? error.statusCode
          : message === "Invalid tmux session name" ||
              message === "Invalid tmux pane id" ||
              message === "Image path is required" ||
              message === "Cannot kill the only pane" ||
              message === "Pane does not belong to session" ||
              message === "Tmux session not found"
            ? 400
            : 500);

      res.status(statusCode).json({ error: message });
    }
  );

  return app;
}
