import type { SessionApi, SessionSummary } from "../api/sessionApi";
import type { BrowserTab } from "./tabState";

export type DashboardState = {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
};

type DashboardStoreDeps = {
  api: Pick<SessionApi, "listSessions" | "createSession" | "killSession">;
  pollMs: number;
  pruneTabs?: (validSessionNames: string[]) => void;
};

export function createDashboardStore(deps: DashboardStoreDeps) {
  let state: DashboardState = {
    sessions: [],
    loading: false,
    error: null
  };
  const listeners = new Set<(state: DashboardState) => void>();
  let timer: number | null = null;

  function notify() {
    listeners.forEach((listener) => listener(state));
  }

  async function refresh() {
    state = {
      ...state,
      loading: true,
      error: null
    };
    notify();

    try {
      const sessions = await deps.api.listSessions();
      deps.pruneTabs?.(sessions.map((session) => session.name));

      state = {
        sessions,
        loading: false,
        error: null
      };
      notify();
    } catch (error) {
      state = {
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to refresh sessions"
      };
      notify();
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
