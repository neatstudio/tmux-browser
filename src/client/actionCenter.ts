import type { SessionSummary } from "./api/sessionApi";
import type { InputPromptNotice } from "./state/inputPromptRegistry";
import type { TerminalInputPromptAction } from "../shared/inputPromptDetector";
import type {
  HookEventAction,
  HookEventContentBlock,
  HookEventTarget
} from "../shared/hookEvents";
import type { TimelineEvent } from "../shared/timeline";

export type ActionCenterInputPromptItem = {
  type: "input-prompt";
  id: string;
  sessionName: string;
  promptKey: string;
  title: string;
  snippet: string;
  actions: TerminalInputPromptAction[];
};

export type ActionCenterDeadPaneItem = {
  type: "dead-pane";
  id: string;
  sessionName: string;
  paneId?: string;
  title: string;
  status: number | null;
};

export type ActionCenterHookEventItem = {
  type: "hook-event";
  id: string;
  sessionName: string;
  source: string;
  eventType: string;
  status: string;
  title: string;
  body: string | null;
  content?: HookEventContentBlock[];
  taskId: string | null;
  target: HookEventTarget;
  actions: HookEventAction[];
};

export type ActionCenterItem =
  | ActionCenterInputPromptItem
  | ActionCenterDeadPaneItem
  | ActionCenterHookEventItem;

const ACTIONABLE_HOOK_STATUSES = new Set([
  "waiting",
  "blocked",
  "need-input",
  "failed"
]);

function readMetadataString(
  metadata: TimelineEvent["metadata"] | undefined,
  key: string
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value : null;
}

function readMetadataJson(
  metadata: TimelineEvent["metadata"] | undefined,
  key: string
) {
  const value = readMetadataString(metadata, key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readHookTarget(value: unknown, fallbackSessionName: string): HookEventTarget {
  const target = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const sessionName =
    typeof target.sessionName === "string" && target.sessionName.trim()
      ? target.sessionName.trim()
      : fallbackSessionName || null;
  const projectName =
    typeof target.projectName === "string" && target.projectName.trim()
      ? target.projectName.trim()
      : null;
  const view = target.view === "kanban" ? "kanban" : "terminal";

  return { sessionName, projectName, view };
}

function readOptionalHookTarget(value: unknown): HookEventTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const target = readHookTarget(value, "");

  return target.sessionName || target.projectName ? target : null;
}

function readHookActionStyle(value: unknown): HookEventAction["style"] {
  return value === "primary" || value === "danger" ? value : "secondary";
}

function readHookActions(value: unknown): HookEventAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap<HookEventAction>((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const action = entry as Record<string, unknown>;
    const id =
      typeof action.id === "string" && action.id.trim()
        ? action.id.trim()
        : "";
    const label =
      typeof action.label === "string" && action.label.trim()
        ? action.label.trim()
        : id;

    if (!id || !label) {
      return [];
    }

    return [
      {
        id,
        label,
        input: typeof action.input === "string" ? action.input : null,
        open: action.open === true,
        target: readOptionalHookTarget(action.target),
        style: readHookActionStyle(action.style)
      }
    ];
  });
}

function readHookContentBlocks(value: unknown): HookEventContentBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap<HookEventContentBlock>((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const block = entry as Record<string, unknown>;
    const text =
      typeof block.text === "string" && block.text.trim()
        ? block.text.trim()
        : "";

    if (!text) {
      return [];
    }

    if (block.type === "summary" || block.type === "text") {
      return [{ type: block.type, text }];
    }

    if (block.type === "code") {
      return [
        {
          type: "code",
          text,
          ...(typeof block.title === "string" && block.title.trim()
            ? { title: block.title.trim() }
            : {}),
          ...(typeof block.language === "string" && block.language.trim()
            ? { language: block.language.trim() }
            : {}),
          collapsed: block.collapsed !== false
        }
      ];
    }

    if (block.type === "details") {
      return [
        {
          type: "details",
          title:
            typeof block.title === "string" && block.title.trim()
              ? block.title.trim()
              : "Details",
          text,
          collapsed: block.collapsed !== false
        }
      ];
    }

    return [];
  });
}

export function deriveActionCenterItems(input: {
  prompts: InputPromptNotice[];
  sessions: SessionSummary[];
  timelineEvents?: TimelineEvent[];
}): ActionCenterItem[] {
  const promptItems: ActionCenterItem[] = input.prompts.map((notice) => ({
    type: "input-prompt",
    id: `prompt:${notice.key}`,
    sessionName: notice.sessionName,
    promptKey: notice.key,
    title: `${notice.sessionName} waiting`,
    snippet: notice.prompt.snippet,
    actions: notice.prompt.actions
  }));

  const deadPaneItems = input.sessions.flatMap<ActionCenterItem>((session) => {
    const paneItems =
      session.panes
        ?.filter((pane) => pane.paneDead)
        .map<ActionCenterItem>((pane) => ({
          type: "dead-pane",
          id: `dead-pane:${session.name}:${pane.paneId}`,
          sessionName: session.name,
          paneId: pane.paneId,
          title: `${session.name} pane ${pane.paneId} exited`,
          status: pane.paneDeadStatus
        })) ?? [];

    if (paneItems.length > 0) {
      return paneItems;
    }

    if (!session.paneDead) {
      return [];
    }

    return [
      {
        type: "dead-pane",
        id: `dead-pane:${session.name}`,
        sessionName: session.name,
        title: `${session.name} pane exited`,
        status: session.paneDeadStatus
      }
    ];
  });

  const hookItems =
    input.timelineEvents
      ?.filter((event) => event.type === "hook-event")
      .flatMap<ActionCenterItem>((event) => {
        const status = readMetadataString(event.metadata, "status") ?? "info";

        if (!ACTIONABLE_HOOK_STATUSES.has(status)) {
          return [];
        }

        const content = readHookContentBlocks(
          readMetadataJson(event.metadata, "content")
        );
        const item: ActionCenterHookEventItem = {
            type: "hook-event",
            id: `hook:${event.id}`,
            sessionName: event.sessionName ?? "",
            source: readMetadataString(event.metadata, "source") ?? "custom",
            eventType: readMetadataString(event.metadata, "eventType") ?? "event",
            status,
            title: event.message,
            body: readMetadataString(event.metadata, "body"),
            taskId: readMetadataString(event.metadata, "taskId"),
            target: readHookTarget(
              readMetadataJson(event.metadata, "target"),
              event.sessionName ?? ""
            ),
            actions: readHookActions(readMetadataJson(event.metadata, "actions"))
          };

        if (content.length > 0) {
          item.content = content;
        }

        return [item];
      }) ?? [];

  return [...promptItems, ...hookItems, ...deadPaneItems];
}
