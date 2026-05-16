import type { ServerStatus, SessionApi, SessionSummary } from "../api/sessionApi";
import type { BrowserTab } from "./tabState";

export type DashboardState = {
  sessions: SessionSummary[];
  serverStatus: ServerStatus | null;
  loading: boolean;
  error: string | null;
};

type DashboardStoreDeps = {
  api: Pick<
    SessionApi,
    | "listSessions"
    | "getServerStatus"
    | "createSession"
    | "renameSession"
    | "killSession"
  >;
  pollMs: number;
  pruneTabs?: (validSessionNames: string[]) => void;
};

export function createDashboardStore(deps: DashboardStoreDeps) {
  let state: DashboardState = {
    sessions: [],
    serverStatus: null,
    loading: false,
    error: null
  };
  const listeners = new Set<(state: DashboardState) => void>();
  let timer: number | null = null;

  function sessionsEqual(previous: SessionSummary[], next: SessionSummary[]) {
    if (previous.length !== next.length) {
      return false;
    }

    return previous.every((session, index) => {
      const nextSession = next[index];

      return (
        nextSession !== undefined &&
        session.name === nextSession.name &&
        session.windows === nextSession.windows &&
        session.status === nextSession.status &&
        session.lastActivityAt === nextSession.lastActivityAt &&
        session.paneCount === nextSession.paneCount &&
        session.activeWindowName === nextSession.activeWindowName &&
        session.currentCommand === nextSession.currentCommand &&
        session.currentPath === nextSession.currentPath &&
        session.gitBranch === nextSession.gitBranch &&
        session.gitDirty === nextSession.gitDirty &&
        session.paneDead === nextSession.paneDead &&
        session.paneDeadStatus === nextSession.paneDeadStatus
      );
    });
  }

  function commit(nextState: DashboardState) {
    const changed =
      state.loading !== nextState.loading ||
      state.error !== nextState.error ||
      JSON.stringify(state.serverStatus) !==
        JSON.stringify(nextState.serverStatus) ||
      !sessionsEqual(state.sessions, nextState.sessions);

    state = nextState;

    if (changed) {
      notify();
    }
  }

  function notify() {
    listeners.forEach((listener) => listener(state));
  }

  async function refresh() {
    try {
      const [sessions, serverStatus] = await Promise.all([
        deps.api.listSessions(),
        deps.api.getServerStatus()
      ]);
      deps.pruneTabs?.(sessions.map((session) => session.name));

      commit({
        sessions,
        serverStatus,
        loading: false,
        error: null
      });
    } catch (error) {
      commit({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to refresh sessions"
      });
    }
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener: (state: DashboardState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    async createSession(name: string) {
      await deps.api.createSession(name);
      await refresh();
    },
    async renameSession(fromName: string, toName: string) {
      await deps.api.renameSession(fromName, toName);
      await refresh();
    },
    async killSession(name: string) {
      await deps.api.killSession(name);
      await refresh();
    },
    startPolling() {
      if (timer !== null) {
        return;
      }

      timer = window.setInterval(() => {
        void refresh();
      }, deps.pollMs);
    },
    stopPolling() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }
  };
}

export type DashboardTabDescriptor = BrowserTab;
