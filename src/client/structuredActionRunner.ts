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
  sendInput: (
    sessionName: string,
    input: string,
    options: { requirePrompt: true }
  ) => Promise<void>;
  navigate: (target: HookEventTarget) => void;
  refreshSessions: () => Promise<unknown>;
  onStateChange?: () => void;
}) {
  const states = new Map<string, { pending: boolean; error: string | null }>();
  const keyFor = (itemId: string, actionId: string) => JSON.stringify([itemId, actionId]);
  const stateFor = (itemId: string, actionId: string) =>
    states.get(keyFor(itemId, actionId)) ?? { pending: false, error: null };
  const setState = (itemId: string, actionId: string, state: { pending: boolean; error: string | null }) => {
    const key = keyFor(itemId, actionId);
    states.delete(key);
    states.set(key, state);
    if (states.size > 200) {
      const removable = [...states].find(([, candidate]) => !candidate.pending)?.[0];
      if (removable) states.delete(removable);
    }
    deps.onStateChange?.();
  };
  const errorMessage = (error: StructuredActionError) => {
    if (error.code === "target_session_not_found") return "目标会话不存在，操作未执行";
    if (error.code === "target_session_unavailable") return "目标会话不可用，操作未执行";
    return "操作失败，请检查网络后重试";
  };
  return {
    getActionState: stateFor,
    applyState(items: StructuredPresentationItem[]) {
      return items.map((item) => ({
        ...item,
        actions: item.actions.map((action) => ({ ...action, ...stateFor(item.id, action.id) }))
      }));
    },
    async run(item: StructuredPresentationItem, actionId: string) {
      const action = item.actions.find((candidate) => candidate.id === actionId);
      if (!action || !actionAvailability(action, deps.getSessions())) {
        return { ok: false as const };
      }
      if (stateFor(item.id, actionId).pending) {
        return { ok: false as const, pending: true as const };
      }
      const stateKey = keyFor(item.id, actionId);
      if (!states.has(stateKey) && states.size >= 200) {
        const removable = [...states].find(([, candidate]) => !candidate.pending)?.[0];
        if (removable) states.delete(removable);
        else return { ok: false as const, busy: true as const };
      }
      setState(item.id, actionId, { pending: true, error: null });
      const target = action.effectiveTarget!;
      if (action.input !== null) {
        try {
          await deps.sendInput(target.sessionName!, action.input, { requirePrompt: true });
        } catch (caught) {
          const error = caught as StructuredActionError;
          setState(item.id, actionId, { pending: false, error: errorMessage(error) });
          if (error.code === "target_session_not_found" || error.code === "target_session_unavailable") {
            await deps.refreshSessions();
          }
          return { ok: false as const, error };
        }
      }
      setState(item.id, actionId, { pending: false, error: null });
      if (action.open) deps.navigate(target);
      return { ok: true as const };
    }
  };
}
