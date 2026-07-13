import type { SessionSummary } from "./api/sessionApi";
import type {
  StructuredAction,
  StructuredPresentationItem
} from "./structuredPresentation";
import type { HookEventTarget } from "../shared/hookEvents";

export type StructuredActionError = Error & {
  status?: number;
  code?: string;
};

function isCurrentSession(sessions: SessionSummary[], sessionName: string) {
  return sessions.some((session) => session.name === sessionName && !session.paneDead);
}

function isInputEligibleSession(sessions: SessionSummary[], sessionName: string) {
  return sessions.some((session) =>
    session.name === sessionName && !session.paneDead && session.inputPrompt !== null
  );
}

function actionAvailability(action: StructuredAction, sessions: SessionSummary[]) {
  const target = action.effectiveTarget;
  if (action.input !== null) {
    return !!target?.sessionName && isInputEligibleSession(sessions, target.sessionName);
  }
  if (!action.open || !target) return false;
  if (target.view === "kanban") return !!target.projectName;
  return !!target.sessionName && isCurrentSession(sessions, target.sessionName);
}

export function applyStructuredActionAvailability(
  items: StructuredPresentationItem[],
  sessions: SessionSummary[]
): StructuredPresentationItem[] {
  return items.map((item) => ({
    ...item,
    actions: item.actions.map((action) => {
      const enabled = actionAvailability(action, sessions);
      return {
        ...action,
        enabled,
        disabledReason: enabled ? null : action.input !== null
          ? "目标会话不可用" : "操作不可用"
      };
    })
  }));
}

export function createStructuredActionRunner(deps: {
  getSessions: () => SessionSummary[];
  sendInput: (sessionName: string, input: string) => Promise<void>;
  navigate: (target: HookEventTarget) => void;
  refreshSessions: () => Promise<unknown>;
}) {
  return {
    async run(item: StructuredPresentationItem, actionId: string) {
      const action = item.actions.find((candidate) => candidate.id === actionId);
      if (!action || !actionAvailability(action, deps.getSessions())) {
        return { ok: false as const };
      }
      const target = action.effectiveTarget!;
      if (action.input !== null) {
        try {
          await deps.sendInput(target.sessionName!, action.input);
        } catch (caught) {
          const error = caught as StructuredActionError;
          if (error.code === "target_session_not_found" || error.code === "target_session_unavailable") {
            await deps.refreshSessions();
          }
          return { ok: false as const, error };
        }
      }
      if (action.open) deps.navigate(target);
      return { ok: true as const };
    }
  };
}
