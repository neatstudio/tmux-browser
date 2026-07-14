import type { SessionSummary } from "./api/sessionApi";
import type { InputPromptNotice } from "./state/inputPromptRegistry";
import type { TerminalInputPromptAction } from "../shared/inputPromptDetector";
import type { HookEventAction, HookEventContentBlock, HookEventTarget } from "../shared/hookEvents";
import type { TimelineEvent } from "../shared/timeline";
import { adaptStructuredHookCompatibility } from "./structuredPresentation";

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
        const adapted = adaptStructuredHookCompatibility(event);
        if (!adapted) return [];
        const status = adapted.presentation.status;

        if (!ACTIONABLE_HOOK_STATUSES.has(status) && !adapted.presentation.attentionRequired) {
          return [];
        }
        const item: ActionCenterHookEventItem = {
            type: "hook-event",
            id: `hook:${event.id}`,
            sessionName: adapted.presentation.sessionName ?? "",
            source: adapted.source,
            eventType: adapted.eventType,
            status,
            title: adapted.presentation.title,
            body: adapted.body ?? (adapted.presentation.summary === adapted.presentation.title ? null : adapted.presentation.summary),
            taskId: adapted.taskId,
            target: adapted.target,
            actions: adapted.presentation.actions
              .filter((action) => action.enabled)
              .map(({ effectiveTarget, enabled: _enabled, disabledReason: _disabledReason, ...action }) => ({
                ...action,
                target: effectiveTarget
              }))
          };

        if (adapted.content.length > 0) {
          item.content = adapted.content;
        }

        return [item];
      }) ?? [];

  return [...promptItems, ...hookItems, ...deadPaneItems];
}
