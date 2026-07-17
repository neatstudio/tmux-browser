import type {
  KanbanAgent,
  KanbanProject,
  PaneSummary,
  ServerStatus,
  SessionSummary
} from "../api/sessionApi";
import type { TerminalInputPrompt } from "../../shared/inputPromptDetector";
import type {
  HookEventAction,
  HookEventContentBlock,
  HookEventTarget
} from "../../shared/hookEvents";
import type { TimelineEvent } from "../../shared/timeline";

export type DashboardState = {
  sessions: SessionSummary[];
  serverStatus: ServerStatus | null;
  kanbanProjects: KanbanProject[];
  timelineEvents?: TimelineEvent[];
  timelineNextCursor?: string | null;
  timelineHistoryExpired?: boolean;
  loading: boolean;
  error: string | null;
};

function reconcileArray<T>(
  previous: T[] | undefined,
  next: T[] | undefined,
  reconcileItem: (previous: T, next: T) => T
): T[] | undefined {
  if (previous === next || (!previous && !next)) return previous;
  if (!previous || !next || previous.length !== next.length) return next;

  let changed = false;
  const reconciled = next.map((item, index) => {
    const value = reconcileItem(previous[index]!, item);
    changed ||= value !== previous[index];
    return value;
  });
  return changed ? reconciled : previous;
}

function reconcileKeyedArray<T>(
  previous: T[] | undefined,
  next: T[] | undefined,
  getKey: (item: T) => string,
  reconcileItem: (previous: T, next: T) => T
): T[] | undefined {
  if (previous === next || (!previous && !next)) return previous;
  if (!previous || !next) return next;

  const previousByKey = new Map(previous.map((item) => [getKey(item), item]));
  let changed = previous.length !== next.length;
  const reconciled = next.map((item, index) => {
    const previousItem = previousByKey.get(getKey(item));
    const value = previousItem ? reconcileItem(previousItem, item) : item;
    changed ||= value !== previous[index];
    return value;
  });
  return changed ? reconciled : previous;
}

function reconcileRecord<T extends Record<string, string | number | boolean | null>>(
  previous: T | undefined,
  next: T | undefined
): T | undefined {
  if (previous === next || (!previous && !next)) return previous;
  if (!previous || !next) return next;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (
    previousKeys.length === nextKeys.length &&
    previousKeys.every((key) => previous[key] === next[key])
  ) {
    return previous;
  }
  return next;
}

function reconcileServerStatus(
  previous: ServerStatus | null,
  next: ServerStatus | null
): ServerStatus | null {
  if (previous === next || (!previous && !next)) return previous;
  if (!previous || !next) return next;
  const loadAverage =
    previous.loadAverage[0] === next.loadAverage[0] &&
    previous.loadAverage[1] === next.loadAverage[1] &&
    previous.loadAverage[2] === next.loadAverage[2]
      ? previous.loadAverage
      : next.loadAverage;
  if (
    previous.platform === next.platform &&
    previous.cpuCount === next.cpuCount &&
    loadAverage === previous.loadAverage &&
    previous.loadPercent === next.loadPercent &&
    previous.memoryTotalBytes === next.memoryTotalBytes &&
    previous.memoryFreeBytes === next.memoryFreeBytes &&
    previous.memoryUsedPercent === next.memoryUsedPercent &&
    previous.uptimeSeconds === next.uptimeSeconds &&
    previous.homeDirectory === next.homeDirectory
  ) {
    return previous;
  }
  return { ...next, loadAverage };
}

function reconcileKanbanAgent(previous: KanbanAgent, next: KanbanAgent) {
  return previous.kind === next.kind &&
    previous.name === next.name &&
    previous.command === next.command &&
    previous.sessionName === next.sessionName
    ? previous
    : next;
}

function kanbanAgentKey(agent: KanbanAgent) {
  return [agent.kind, agent.name, agent.sessionName ?? ""]
    .map((value) => `${value.length}:${value}`)
    .join("");
}

function reconcileKanbanProject(previous: KanbanProject, next: KanbanProject) {
  const agents = reconcileKeyedArray(
    previous.agents,
    next.agents,
    kanbanAgentKey,
    reconcileKanbanAgent
  )!;
  return previous.name === next.name &&
    previous.path === next.path &&
    previous.server === next.server &&
    agents === previous.agents
    ? previous
    : { ...next, agents };
}

function reconcilePromptAction(
  previous: TerminalInputPrompt["actions"][number],
  next: TerminalInputPrompt["actions"][number]
) {
  return previous.label === next.label && previous.input === next.input
    ? previous
    : next;
}

function reconcileInputPrompt(
  previous: TerminalInputPrompt | null,
  next: TerminalInputPrompt | null
) {
  if (previous === next || (!previous && !next)) return previous;
  if (!previous || !next) return next;
  const actions = reconcileArray(previous.actions, next.actions, reconcilePromptAction)!;
  return previous.snippet === next.snippet && actions === previous.actions
    ? previous
    : { ...next, actions };
}

function reconcilePane(previous: PaneSummary, next: PaneSummary) {
  return previous.sessionName === next.sessionName &&
    previous.paneId === next.paneId &&
    previous.windowIndex === next.windowIndex &&
    previous.windowName === next.windowName &&
    previous.windowActive === next.windowActive &&
    previous.paneIndex === next.paneIndex &&
    previous.paneActive === next.paneActive &&
    previous.currentCommand === next.currentCommand &&
    previous.runtimeKind === next.runtimeKind &&
    previous.currentPath === next.currentPath &&
    previous.paneDead === next.paneDead &&
    previous.paneDeadStatus === next.paneDeadStatus &&
    previous.panePid === next.panePid &&
    previous.paneLeft === next.paneLeft &&
    previous.paneTop === next.paneTop &&
    previous.paneWidth === next.paneWidth &&
    previous.paneHeight === next.paneHeight
    ? previous
    : next;
}

function reconcileSession(previous: SessionSummary, next: SessionSummary) {
  const inputPrompt = reconcileInputPrompt(previous.inputPrompt, next.inputPrompt);
  const panes = reconcileKeyedArray(
    previous.panes,
    next.panes,
    (pane) => `${pane.sessionName}\0${pane.paneId}`,
    reconcilePane
  );
  return previous.name === next.name &&
    previous.windows === next.windows &&
    previous.status === next.status &&
    previous.lastActivityAt === next.lastActivityAt &&
    previous.paneCount === next.paneCount &&
    previous.activeWindowName === next.activeWindowName &&
    previous.currentCommand === next.currentCommand &&
    previous.runtimeKind === next.runtimeKind &&
    previous.currentPath === next.currentPath &&
    previous.gitBranch === next.gitBranch &&
    previous.gitDirty === next.gitDirty &&
    previous.paneDead === next.paneDead &&
    previous.paneDeadStatus === next.paneDeadStatus &&
    previous.preview === next.preview &&
    inputPrompt === previous.inputPrompt &&
    panes === previous.panes
    ? previous
    : { ...next, inputPrompt, panes };
}

function reconcileHookTarget(previous: HookEventTarget, next: HookEventTarget) {
  return previous.sessionName === next.sessionName &&
    previous.projectName === next.projectName &&
    previous.view === next.view
    ? previous
    : next;
}

function reconcileHookAction(previous: HookEventAction, next: HookEventAction) {
  const target =
    previous.target && next.target
      ? reconcileHookTarget(previous.target, next.target)
      : next.target;
  return previous.id === next.id &&
    previous.label === next.label &&
    previous.input === next.input &&
    previous.open === next.open &&
    previous.style === next.style &&
    target === previous.target
    ? previous
    : { ...next, target };
}

function reconcileHookContent(
  previous: HookEventContentBlock,
  next: HookEventContentBlock
) {
  if (previous.type !== next.type) return next;
  if (previous.type === "summary" || previous.type === "text") {
    return previous.text === next.text ? previous : next;
  }
  if (next.type === "code" && previous.type === "code") {
    return previous.text === next.text &&
      previous.title === next.title &&
      previous.language === next.language &&
      previous.collapsed === next.collapsed
      ? previous
      : next;
  }
  if (next.type === "details" && previous.type === "details") {
    return previous.title === next.title &&
      previous.text === next.text &&
      previous.collapsed === next.collapsed
      ? previous
      : next;
  }
  return next;
}

function reconcileTimelineEvent(previous: TimelineEvent, next: TimelineEvent) {
  if (previous.id !== next.id || previous.type !== next.type) return next;

  if (previous.type === "conversation-message" && next.type === "conversation-message") {
    const metadata = reconcileRecord(previous.metadata, next.metadata);
    return previous.messageId === next.messageId &&
      previous.sessionName === next.sessionName &&
      previous.role === next.role &&
      previous.contentType === next.contentType &&
      previous.content === next.content &&
      previous.summary === next.summary &&
      previous.status === next.status &&
      previous.createdAt === next.createdAt &&
      previous.revision === next.revision &&
      previous.updatedAt === next.updatedAt &&
      previous.toolName === next.toolName &&
      previous.parentMessageId === next.parentMessageId &&
      metadata === previous.metadata
      ? previous
      : { ...next, metadata };
  }

  if (
    previous.type === "hook-event" &&
    next.type === "hook-event" &&
    "schemaVersion" in previous &&
    "schemaVersion" in next
  ) {
    const target = reconcileHookTarget(previous.target, next.target);
    const actions = reconcileArray(previous.actions, next.actions, reconcileHookAction)!;
    const content = reconcileArray(previous.content, next.content, reconcileHookContent)!;
    const metadata = reconcileRecord(previous.metadata, next.metadata);
    return previous.schemaVersion === next.schemaVersion &&
      previous.source === next.source &&
      previous.sessionName === next.sessionName &&
      previous.eventType === next.eventType &&
      previous.status === next.status &&
      previous.title === next.title &&
      previous.body === next.body &&
      previous.cwd === next.cwd &&
      previous.taskId === next.taskId &&
      previous.severity === next.severity &&
      previous.createdAt === next.createdAt &&
      target === previous.target &&
      actions === previous.actions &&
      content === previous.content &&
      metadata === previous.metadata
      ? previous
      : { ...next, target, actions, content, metadata };
  }

  if ("message" in previous && "message" in next) {
    const metadata = reconcileRecord(previous.metadata, next.metadata);
    return previous.sessionName === next.sessionName &&
      previous.message === next.message &&
      previous.createdAt === next.createdAt &&
      metadata === previous.metadata
      ? previous
      : { ...next, metadata };
  }
  return next;
}

export function reconcileDashboardState(
  previous: DashboardState,
  next: DashboardState
): DashboardState {
  const sessions = reconcileKeyedArray(
    previous.sessions,
    next.sessions,
    (session) => session.name,
    reconcileSession
  )!;
  const serverStatus = reconcileServerStatus(previous.serverStatus, next.serverStatus);
  const kanbanProjects = reconcileKeyedArray(
    previous.kanbanProjects,
    next.kanbanProjects,
    (project) => project.name,
    reconcileKanbanProject
  )!;
  const timelineEvents = reconcileKeyedArray(
    previous.timelineEvents,
    next.timelineEvents,
    (event) => event.id,
    reconcileTimelineEvent
  );

  if (
    sessions === previous.sessions &&
    serverStatus === previous.serverStatus &&
    kanbanProjects === previous.kanbanProjects &&
    timelineEvents === previous.timelineEvents &&
    next.timelineNextCursor === previous.timelineNextCursor &&
    next.timelineHistoryExpired === previous.timelineHistoryExpired &&
    next.loading === previous.loading &&
    next.error === previous.error
  ) {
    return previous;
  }

  return {
    ...next,
    sessions,
    serverStatus,
    kanbanProjects,
    timelineEvents
  };
}
