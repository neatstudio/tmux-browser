import {
  HOOK_EVENT_SCHEMA_VERSION,
  type HookEventAction,
  type HookEventContentBlock,
  type HookEventSeverity,
  type HookEventStatus,
  type HookEventTarget
} from "../shared/hookEvents";
import type {
  ConversationMessageContentType,
  ConversationMessageRole,
  TimelineEvent
} from "../shared/timeline";

export type StructuredPresentationStatus =
  | "streaming" | "complete" | "failed" | "waiting"
  | "blocked" | "need-input" | "info";
export type StructuredPresentationSeverity = "info" | "warning" | "error";
export type StructuredSummarySource =
  | "producer" | "text" | "code" | "command" | "image" | "status" | "hook";

export type StructuredAction = HookEventAction & {
  effectiveTarget: HookEventTarget | null;
  enabled: boolean;
  disabledReason: string | null;
};

export type StructuredDetailBlock = {
  type: "text" | "code" | "command" | "image" | "details" | "metadata";
  title?: string;
  language?: string;
  collapsed: boolean;
  materialize: () => string | Record<string, string | number | boolean | null>;
};

export type MaterializedStructuredDetailBlock = Omit<StructuredDetailBlock, "materialize"> & {
  text?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type StructuredPresentationStats = Partial<Record<
  "fileschanged" | "testspassed" | "testsfailed" | "durationms", number
>>;

export type StructuredPresentationItem = {
  id: string;
  kind: "conversation" | "hook";
  sessionName: string | null;
  title: string;
  summary: string;
  summarySource: StructuredSummarySource;
  status: StructuredPresentationStatus;
  severity: StructuredPresentationSeverity;
  attentionRequired: boolean;
  role: ConversationMessageRole | null;
  toolName: string | null;
  parentId: string | null;
  details: StructuredDetailBlock[];
  actions: StructuredAction[];
  stats: StructuredPresentationStats;
  createdAt: string;
};

export type DerivedStructuredPresentationItem = StructuredPresentationItem & {
  children: StructuredPresentationItem[];
  toolStepCount: number;
};

export type StructuredHookCompatibility = {
  presentation: StructuredPresentationItem;
  source: string;
  eventType: string;
  body: string | null;
  taskId: string | null;
  target: HookEventTarget;
  content: HookEventContentBlock[];
};

const SUMMARY_LIMIT = 320;
const HOOK_STATUSES = new Set<HookEventStatus>([
  "waiting", "blocked", "need-input", "running", "done", "failed", "info"
]);
const HOOK_SEVERITIES = new Set<HookEventSeverity>(["info", "warning", "error"]);

function trimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function summary(value: unknown) {
  return trimmed(value).replace(/\s+/g, " ").slice(0, SUMMARY_LIMIT);
}

function nullable(value: unknown) {
  const result = trimmed(value);
  return result || null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function json(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function normalizeTarget(value: unknown, allowEmpty = false): HookEventTarget | null {
  const target = object(value);
  if (!target) return null;
  const sessionName = nullable(target.sessionName);
  const projectName = nullable(target.projectName);
  const view = target.view === "kanban" ? "kanban" : target.view === "terminal" || target.view === undefined
    ? "terminal" : null;
  if (!view || (!allowEmpty && !sessionName && !projectName)) return null;
  return { sessionName, projectName, view };
}

function normalizeContent(value: unknown, strict = false): HookEventContentBlock[] | null {
  if (!Array.isArray(value)) return null;
  const result: HookEventContentBlock[] = [];
  for (const entry of value) {
    const block = object(entry);
    const text = trimmed(block?.text);
    if (!block || !text) {
      if (strict) return null;
      continue;
    }
    if (block.type === "summary" || block.type === "text") {
      result.push({ type: block.type, text });
    } else if (block.type === "code") {
      result.push({
        type: "code", text, collapsed: block.collapsed !== false,
        ...(nullable(block.title) ? { title: nullable(block.title)! } : {}),
        ...(nullable(block.language) ? { language: nullable(block.language)! } : {})
      });
    } else if (block.type === "details") {
      result.push({ type: "details", text, title: nullable(block.title) ?? "Details", collapsed: block.collapsed !== false });
    } else if (strict) return null;
  }
  return result;
}

function normalizeActions(value: unknown, eventTarget: HookEventTarget | null, strict = false): StructuredAction[] | null {
  if (!Array.isArray(value)) return null;
  const candidates: Array<HookEventAction & { effectiveTarget: HookEventTarget | null }> = [];
  const counts = new Map<string, number>();
  for (const entry of value) {
    const action = object(entry);
    const id = trimmed(action?.id);
    const label = trimmed(action?.label) || (!strict ? id : "");
    const style = !strict && action?.style === undefined ? "secondary" : action?.style;
    const hasCanonicalFields = !!action && !!id && !!label &&
      ["primary", "secondary", "danger"].includes(String(style)) &&
      (action.input === null || typeof action.input === "string" || (!strict && action.input === undefined)) &&
      (typeof action.open === "boolean" || (!strict && action.open === undefined)) &&
      (action.target === null || action.target === undefined || normalizeTarget(action.target) !== null);
    if (!hasCanonicalFields) {
      if (strict) return null;
      continue;
    }
    const declaredTarget = action.target === null || action.target === undefined
      ? null : normalizeTarget(action.target);
    if (action.target !== null && action.target !== undefined && !declaredTarget) continue;
    const normalized: HookEventAction & { effectiveTarget: HookEventTarget | null } = {
      id, label,
      input: typeof action.input === "string" ? action.input : null,
      open: action.open === true,
      target: declaredTarget,
      style: style as HookEventAction["style"],
      effectiveTarget: declaredTarget ?? eventTarget
    };
    candidates.push(normalized);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return candidates.filter((action) => counts.get(action.id) === 1).map((action) => {
    const needsSession = action.input !== null;
    const validNavigation = action.open && !!action.effectiveTarget && (
      !!action.effectiveTarget.sessionName ||
      (action.effectiveTarget.view === "kanban" && !!action.effectiveTarget.projectName)
    );
    const enabled = needsSession
      ? !!action.effectiveTarget?.sessionName
      : validNavigation;
    return {
      ...action,
      enabled,
      disabledReason: enabled ? null : needsSession ? "目标会话不可用" : "操作不可用"
    };
  });
}

function statusForHook(status: HookEventStatus): StructuredPresentationStatus {
  if (status === "running") return "streaming";
  if (status === "done") return "complete";
  return status;
}

function detail(type: StructuredDetailBlock["type"], value: string | Record<string, string | number | boolean | null>, options: Partial<StructuredDetailBlock> = {}): StructuredDetailBlock {
  return { type, collapsed: options.collapsed !== false, ...options, materialize: () => value };
}

function readStats(metadata: unknown): StructuredPresentationStats {
  const source = object(metadata) ?? {};
  const limits = { fileschanged: 100_000, testspassed: 1_000_000, testsfailed: 1_000_000, durationms: 86_400_000 } as const;
  const stats: StructuredPresentationStats = {};
  for (const [key, max] of Object.entries(limits) as Array<[keyof typeof limits, number]>) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max && (key === "durationms" || Number.isInteger(value))) {
      stats[key] = value;
    }
  }
  return stats;
}

function conversationFallback(record: Record<string, unknown>) {
  const status = record.status;
  const content = trimmed(record.content);
  const contentType = record.contentType as ConversationMessageContentType;
  if (status === "streaming" && !content) return { value: "正在输出…", source: "status" as const };
  if (contentType === "text" && content) {
    return { value: summary(content.split(/\n\s*\n/).find((part) => part.trim()) ?? content), source: "text" as const };
  }
  if (contentType === "code" && content) {
    const name = nullable(record.toolName) ?? "Codex";
    return { value: `${name} 输出了一段代码`, source: "code" as const };
  }
  if (contentType === "command" && content) return { value: summary(content.split(/\r?\n/)[0]), source: "command" as const };
  if (contentType === "image" && content) return { value: "发送了一张图片", source: "image" as const };
  if (status === "failed") return { value: "消息发送失败", source: "status" as const };
  if (record.role === "tool") return { value: "工具执行完成", source: "status" as const };
  return { value: status === "streaming" ? "正在输出…" : "消息已发送", source: "status" as const };
}

function adaptConversation(record: Record<string, unknown>): StructuredPresentationItem {
  const producerSummary = summary(record.summary);
  const selected = producerSummary
    ? { value: producerSummary, source: "producer" as const }
    : conversationFallback(record);
  const status = record.status as "streaming" | "complete" | "failed";
  const details: StructuredDetailBlock[] = [];
  const content = typeof record.content === "string" ? record.content : "";
  if (content) details.push(detail(record.contentType as StructuredDetailBlock["type"], content));
  const stats = readStats(record.metadata);
  if (Object.keys(object(record.metadata) ?? {}).length) details.push(detail("metadata", record.metadata as Record<string, string | number | boolean | null>));
  return {
    id: String(record.messageId ?? record.id), kind: "conversation", sessionName: nullable(record.sessionName),
    title: record.role === "tool" ? nullable(record.toolName) ?? "工具" : record.role === "user" ? "用户" : "助手",
    summary: selected.value, summarySource: selected.source, status,
    severity: status === "failed" ? "error" : "info", attentionRequired: status === "failed",
    role: record.role as ConversationMessageRole, toolName: nullable(record.toolName),
    parentId: nullable(record.parentMessageId), details, actions: [], stats,
    createdAt: String(record.createdAt)
  };
}

function corruptHook(record: Record<string, unknown>): StructuredPresentationItem {
  return {
    id: String(record.id ?? "corrupt"), kind: "hook", sessionName: nullable(record.sessionName),
    title: nullable(record.title) ?? nullable(record.message) ?? "损坏的事件",
    summary: "事件数据损坏", summarySource: "status", status: "failed", severity: "error",
    attentionRequired: true, role: null, toolName: null, parentId: null,
    details: [], actions: [], stats: {}, createdAt: String(record.createdAt ?? "")
  };
}

function adaptHook(record: Record<string, unknown>, typed: boolean): StructuredPresentationItem {
  const metadata = object(record.metadata) ?? {};
  const rawStatus = typed ? record.status : metadata.status;
  const rawSeverity = typed ? record.severity : metadata.severity;
  const status = HOOK_STATUSES.has(rawStatus as HookEventStatus)
    ? rawStatus as HookEventStatus : "info";
  const severity = HOOK_SEVERITIES.has(rawSeverity as HookEventSeverity)
    ? rawSeverity as HookEventSeverity : "info";
  const title = typed ? trimmed(record.title) : trimmed(record.message);
  const body = nullable(typed ? record.body : metadata.body);
  const eventType = trimmed(typed ? record.eventType : metadata.eventType) || "event";
  const content = normalizeContent(typed ? record.content : json(metadata.content), typed) ?? [];
  const eventTarget = normalizeTarget(typed ? record.target : json(metadata.target), typed);
  const actions = normalizeActions(typed ? record.actions : json(metadata.actions), eventTarget, typed) ?? [];
  let presentationStatus = statusForHook(status);
  const stats = readStats(typed ? record.metadata : metadata);
  const presentationSeverity = severity === "info" && (stats.testsfailed ?? 0) > 0 ? "warning" : severity;
  let attentionRequired = ["waiting", "blocked", "need-input", "failed"].includes(presentationStatus);
  if (severity === "error") {
    presentationStatus = "failed";
    attentionRequired = true;
  }
  if (eventType === "approval-required" || actions.some((action) => action.style === "danger")) attentionRequired = true;
  const selected = content.find((block) => block.type === "summary")?.text
    ?? content.find((block) => block.type === "text")?.text ?? body ?? title;
  const noReason = presentationStatus === "failed" ? "未提供失败原因"
    : attentionRequired ? "需要处理，但未提供操作说明" : "事件更新";
  const details = content.filter((block) => block.type !== "summary").map((block) =>
    detail(block.type === "text" ? "text" : block.type, block.text, {
      ...(block.type === "code" || block.type === "details" ? { collapsed: block.collapsed } : {}),
      ...(block.type === "code" ? { title: block.title, language: block.language } : {}),
      ...(block.type === "details" ? { title: block.title } : {})
    })
  );
  if (body && !content.some((block) => block.type === "text" && block.text === body)) {
    details.unshift(detail("text", body));
  }
  const userMetadata = typed ? object(record.metadata) : null;
  if (userMetadata && Object.keys(userMetadata).length) details.push(detail("metadata", userMetadata as Record<string, string | number | boolean | null>));
  return {
    id: String(record.id), kind: "hook", sessionName: nullable(record.sessionName), title: title || "事件更新",
    summary: summary(selected) || noReason, summarySource: "hook", status: presentationStatus,
    severity: presentationSeverity, attentionRequired, role: null, toolName: null, parentId: null,
    details, actions, stats, createdAt: String(record.createdAt)
  };
}

function validTypedHook(record: Record<string, unknown>) {
  return record.schemaVersion === HOOK_EVENT_SCHEMA_VERSION &&
    HOOK_STATUSES.has(record.status as HookEventStatus) &&
    HOOK_SEVERITIES.has(record.severity as HookEventSeverity) &&
    !!trimmed(record.title) && !!trimmed(record.source) && !!trimmed(record.eventType) &&
    normalizeTarget(record.target, true) !== null && normalizeContent(record.content, true) !== null &&
    normalizeActions(record.actions, normalizeTarget(record.target, true), true) !== null;
}

export function adaptStructuredRecord(record: TimelineEvent | unknown): StructuredPresentationItem | null {
  const value = object(record);
  if (!value) return null;
  if (value.type === "conversation-message") return adaptConversation(value);
  if (value.type !== "hook-event") return null;
  if (Object.prototype.hasOwnProperty.call(value, "schemaVersion")) {
    return validTypedHook(value) ? adaptHook(value, true) : corruptHook(value);
  }
  return adaptHook(value, false);
}

export function adaptStructuredHookCompatibility(record: TimelineEvent | unknown): StructuredHookCompatibility | null {
  const value = object(record);
  if (!value || value.type !== "hook-event") return null;
  const presentation = adaptStructuredRecord(value);
  if (!presentation) return null;
  if (Object.prototype.hasOwnProperty.call(value, "schemaVersion") && !validTypedHook(value)) {
    return {
      presentation,
      source: "custom",
      eventType: "corrupt",
      body: "事件数据损坏",
      taskId: null,
      target: { sessionName: nullable(value.sessionName), projectName: null, view: "terminal" },
      content: []
    };
  }
  const typed = value.schemaVersion === HOOK_EVENT_SCHEMA_VERSION;
  const metadata = object(value.metadata) ?? {};
  return {
    presentation,
    source: nullable(typed ? value.source : metadata.source) ?? "custom",
    eventType: nullable(typed ? value.eventType : metadata.eventType) ?? "event",
    body: nullable(typed ? value.body : metadata.body),
    taskId: nullable(typed ? value.taskId : metadata.taskId),
    target: normalizeTarget(typed ? value.target : json(metadata.target), typed) ?? {
      sessionName: nullable(value.sessionName), projectName: null, view: "terminal"
    },
    content: normalizeContent(typed ? value.content : json(metadata.content), typed) ?? []
  };
}

export function materializeStructuredDetails(item: StructuredPresentationItem, options: { view: "expanded" | "toast" | "compact" }): MaterializedStructuredDetailBlock[] {
  return item.details.map(({ materialize, ...descriptor }) => {
    const value = materialize();
    const collapsed = options.view === "expanded" ? descriptor.collapsed : true;
    return typeof value === "string"
      ? { ...descriptor, collapsed, text: value }
      : { ...descriptor, collapsed, metadata: value };
  });
}

export function deriveStructuredPresentation(items: StructuredPresentationItem[]): DerivedStructuredPresentationItem[] {
  const messageParents = new Map<string, StructuredPresentationItem>();
  for (const item of items) {
    if (item.kind === "conversation" && item.role !== "tool") messageParents.set(item.id, item);
  }
  const children = new Map<string, StructuredPresentationItem[]>();
  const childIds = new Set<string>();
  for (const item of items) {
    const parent = item.parentId ? messageParents.get(item.parentId) : null;
    if (!parent) continue;
    const list = children.get(parent.id) ?? [];
    list.push(item);
    children.set(parent.id, list);
    childIds.add(item.id);
  }
  return items.filter((item) => !childIds.has(item.id)).map((item) => {
    const grouped = children.get(item.id) ?? [];
    return {
      ...item,
      attentionRequired: item.attentionRequired || grouped.some((child) => child.attentionRequired),
      children: grouped,
      toolStepCount: grouped.filter((child) => child.role === "tool").length
    };
  });
}
