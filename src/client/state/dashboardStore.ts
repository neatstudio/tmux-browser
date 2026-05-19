import type {
  ServerStatus,
  SessionApi,
  SessionSummary,
  SplitPaneDirection
} from "../api/sessionApi";
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
    | "listPaneSessions"
    | "listDashboardSessions"
    | "getSessionStatus"
    | "getServerStatus"
    | "createSession"
    | "renameSession"
    | "killSession"
    | "sendCommand"
    | "splitPane"
    | "selectPane"
    | "killPane"
  >;
  pollMs: number;
  dashboardPollMs?: number;
  serverStatusPollMs?: number;
  pruneTabs?: (validSessionNames: string[]) => void;
  shouldIncludePreview?: () => boolean;
  shouldIncludePanes?: () => boolean;
  getActiveSessionName?: () => string | null;
  isActiveSessionBusy?: () => boolean;
};

type RefreshOptions = {
  includePreview?: boolean;
  includePanes?: boolean;
  includeServerStatus?: boolean;
};

export function createDashboardStore(deps: DashboardStoreDeps) {
  let state: DashboardState = {
    sessions: [],
    serverStatus: null,
    loading: false,
    error: null
  };
  const listeners = new Set<(state: DashboardState) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let dashboardTimer: ReturnType<typeof setInterval> | null = null;
  let serverStatusTimer: ReturnType<typeof setInterval> | null = null;

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
        session.paneDeadStatus === nextSession.paneDeadStatus &&
        session.preview === nextSession.preview &&
        JSON.stringify(session.inputPrompt ?? null) ===
          JSON.stringify(nextSession.inputPrompt ?? null) &&
        JSON.stringify(session.panes ?? null) ===
          JSON.stringify(nextSession.panes ?? null)
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

  async function refreshServerStatus() {
    try {
      const serverStatus = await deps.api.getServerStatus();

      commit({
        ...state,
        serverStatus,
        loading: false,
        error: null
      });
    } catch (error) {
      commit({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to refresh server status"
      });
    }
  }

  function mergeSessionStatus(session: SessionSummary) {
    const existingIndex = state.sessions.findIndex(
      (existingSession) => existingSession.name === session.name
    );
    const sessions =
      existingIndex === -1
        ? [session]
        : state.sessions.map((existingSession, index) =>
            index === existingIndex ? session : existingSession
          );

    commit({
      ...state,
      sessions,
      loading: false,
      error: null
    });
  }

  async function refresh(options: RefreshOptions = {}) {
    try {
      const activeSessionName =
        (options.includePreview === false && options.includePanes) ||
        (options.includePreview === undefined && options.includePanes === undefined)
          ? deps.getActiveSessionName?.() ?? null
          : null;

      if (activeSessionName) {
        mergeSessionStatus(await deps.api.getSessionStatus(activeSessionName));
        return;
      }

      const loadSessions =
        options.includePreview === false
          ? options.includePanes
            ? deps.api.listPaneSessions()
            : deps.api.listSessions()
          : deps.api.listDashboardSessions();
      const [sessions, serverStatus] = await Promise.all([
        loadSessions,
        options.includeServerStatus === false
          ? Promise.resolve(state.serverStatus)
          : deps.api.getServerStatus()
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
    async sendCommand(name: string, command: string) {
      await deps.api.sendCommand(name, command);
    },
    async splitPane(name: string, direction: SplitPaneDirection) {
      await deps.api.splitPane(name, direction);
      await refresh();
    },
    async selectPane(name: string, paneId: string) {
      await deps.api.selectPane(name, paneId);
    },
    async killPane(name: string, paneId: string) {
      await deps.api.killPane(name, paneId);
      await refresh({ includePanes: true });
    },
    startPolling() {
      if (timer !== null || dashboardTimer !== null || serverStatusTimer !== null) {
        return;
      }

      timer = globalThis.setInterval(() => {
        const activeSessionName = deps.getActiveSessionName?.() ?? null;

        if (!activeSessionName || deps.isActiveSessionBusy?.()) {
          return;
        }

        void refresh({
          includePreview: false,
          includePanes: true
        });
      }, deps.pollMs);

      dashboardTimer = globalThis.setInterval(() => {
        if (!deps.shouldIncludePreview?.()) {
          return;
        }

        void refresh({
          includePreview: true,
          includePanes: deps.shouldIncludePanes?.() ?? false,
          includeServerStatus: false
        });
      }, deps.dashboardPollMs ?? Math.max(deps.pollMs, 30_000));

      serverStatusTimer = globalThis.setInterval(() => {
        if (!deps.shouldIncludePreview?.()) {
          return;
        }

        void refreshServerStatus();
      }, deps.serverStatusPollMs ?? Math.max(deps.pollMs, 60_000));
    },
    stopPolling() {
      if (timer !== null) {
        globalThis.clearInterval(timer);
        timer = null;
      }

      if (dashboardTimer !== null) {
        globalThis.clearInterval(dashboardTimer);
        dashboardTimer = null;
      }

      if (serverStatusTimer !== null) {
        globalThis.clearInterval(serverStatusTimer);
        serverStatusTimer = null;
      }
    }
  };
}

export type DashboardTabDescriptor = BrowserTab;
