import type {
  KanbanProject,
  CreateKanbanProjectRequest,
  ServerStatus,
  SessionApi,
  SessionSummary,
  SplitPaneDirection
} from "../api/sessionApi";
import type { TimelineEvent } from "../../shared/timeline";
import type { BrowserTab } from "./tabState";
import type { SessionListCache } from "./sessionListCache";

const TIMELINE_LIMIT = 8;

export type DashboardState = {
  sessions: SessionSummary[];
  serverStatus: ServerStatus | null;
  kanbanProjects: KanbanProject[];
  timelineEvents?: TimelineEvent[];
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
    | "listKanbanProjects"
    | "createKanbanProject"
    | "addKanbanSession"
    | "removeKanbanSession"
    | "deleteKanbanProject"
  > &
    Partial<Pick<SessionApi, "listTimelineEvents">>;
  pollMs: number;
  dashboardPollMs?: number;
  serverStatusPollMs?: number;
  kanbanPollMs?: number;
  pruneTabs?: (validSessionNames: string[]) => void;
  shouldIncludePreview?: () => boolean;
  shouldIncludePanes?: () => boolean;
  getDashboardPollOptions?: () => RefreshOptions | null;
  getActiveSessionName?: () => string | null;
  getMutedSessionNames?: () => string[];
  isActiveSessionBusy?: () => boolean;
  preferActiveSessionStatus?: boolean;
  sessionListCache?: SessionListCache;
};

type RefreshOptions = {
  includePreview?: boolean;
  includePanes?: boolean;
  includeServerStatus?: boolean;
  preferActiveSessionStatus?: boolean;
};

export function createDashboardStore(deps: DashboardStoreDeps) {
  let state: DashboardState = {
    sessions: deps.sessionListCache?.read() ?? [],
    serverStatus: null,
    kanbanProjects: [],
    timelineEvents: [],
    loading: false,
    error: null
  };
  const listeners = new Set<(state: DashboardState) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let dashboardTimer: ReturnType<typeof setInterval> | null = null;
  let serverStatusTimer: ReturnType<typeof setInterval> | null = null;
  let kanbanTimer: ReturnType<typeof setInterval> | null = null;
  let timelineMergeSequence = 0;
  const timelineMergeSequenceById = new Map<string, number>();

  function pruneTimelineMergeSequences(timelineEvents: TimelineEvent[]) {
    const retainedIds = new Set(timelineEvents.map((event) => event.id));
    for (const eventId of timelineMergeSequenceById.keys()) {
      if (!retainedIds.has(eventId)) {
        timelineMergeSequenceById.delete(eventId);
      }
    }
  }

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
      JSON.stringify(state.kanbanProjects) !==
        JSON.stringify(nextState.kanbanProjects) ||
      JSON.stringify(state.timelineEvents ?? []) !==
        JSON.stringify(nextState.timelineEvents ?? []) ||
      !sessionsEqual(state.sessions, nextState.sessions);

    state = nextState;

    if (changed) {
      notify();
    }
  }

  function notify() {
    listeners.forEach((listener) => listener(state));
  }

  function persistSessionList(sessions: SessionSummary[]) {
    deps.sessionListCache?.write(sessions);
  }

  function mergeLightweightSessionList(nextSessions: SessionSummary[]) {
    const previousByName = new Map(
      state.sessions.map((session) => [session.name, session])
    );

    return nextSessions.map((session) => {
      const previous = previousByName.get(session.name);

      if (!previous) {
        return session;
      }

      return {
        ...previous,
        ...session,
        preview: session.preview ?? previous.preview ?? null,
        inputPrompt: session.inputPrompt ?? previous.inputPrompt ?? null,
        panes: session.panes ?? previous.panes
      };
    });
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

  async function refreshTimeline() {
    if (!deps.api.listTimelineEvents) {
      return;
    }

    try {
      const mergeSequenceAtRequest = timelineMergeSequence;
      const timelineEvents = await deps.api.listTimelineEvents(TIMELINE_LIMIT);
      const eventsReceivedDuringRefresh = (state.timelineEvents ?? []).filter(
        (event) =>
          (timelineMergeSequenceById.get(event.id) ?? 0) > mergeSequenceAtRequest
      );
      const refreshedTimelineEvents = [
        ...eventsReceivedDuringRefresh,
        ...timelineEvents.filter(
          (event) =>
            !eventsReceivedDuringRefresh.some((received) => received.id === event.id)
        )
      ]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, TIMELINE_LIMIT);
      pruneTimelineMergeSequences(refreshedTimelineEvents);

      commit({
        ...state,
        timelineEvents: refreshedTimelineEvents,
        loading: false,
        error: null
      });
    } catch (error) {
      commit({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to refresh timeline"
      });
    }
  }

  function mergeTimelineEvent(event: TimelineEvent) {
    const existing = (state.timelineEvents ?? []).find(
      (candidate) => candidate.id === event.id
    );
    if (
      existing?.type === "conversation-message" &&
      event.type === "conversation-message" &&
      event.revision <= existing.revision
    ) {
      return;
    }

    timelineMergeSequence += 1;
    timelineMergeSequenceById.set(event.id, timelineMergeSequence);
    const timelineEvents = [
      event,
      ...(state.timelineEvents ?? []).filter((existing) => existing.id !== event.id)
    ]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, TIMELINE_LIMIT);
    pruneTimelineMergeSequences(timelineEvents);

    commit({
      ...state,
      timelineEvents,
      loading: false,
      error: null
    });
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
    persistSessionList(sessions);
  }

  async function refreshSessionList() {
    try {
      const loadSessions = deps.api.listSessions ?? deps.api.listDashboardSessions;
      const sessions = mergeLightweightSessionList(await loadSessions());
      deps.pruneTabs?.(sessions.map((session) => session.name));
      persistSessionList(sessions);

      commit({
        ...state,
        sessions,
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

  async function refresh(options: RefreshOptions = {}) {
    try {
      const shouldPreferActiveSessionStatus =
        options.preferActiveSessionStatus ?? deps.preferActiveSessionStatus ?? true;
      const activeSessionName =
        shouldPreferActiveSessionStatus &&
        ((options.includePreview === false && options.includePanes) ||
          (options.includePreview === undefined &&
            options.includePanes === undefined))
          ? deps.getActiveSessionName?.() ?? null
          : null;

      if (activeSessionName) {
        mergeSessionStatus(await deps.api.getSessionStatus(activeSessionName));
        return;
      }

      const loadSessions =
        options.includePreview === false
          ? options.includePanes
            ? deps.getMutedSessionNames
              ? deps.api.listPaneSessions(deps.getMutedSessionNames())
              : deps.api.listPaneSessions()
            : deps.api.listSessions()
          : deps.api.listDashboardSessions();
      const [sessions, serverStatus] = await Promise.all([
        loadSessions,
        options.includeServerStatus === false
          ? Promise.resolve(state.serverStatus)
          : deps.api.getServerStatus()
      ]);
      persistSessionList(sessions);
      deps.pruneTabs?.(sessions.map((session) => session.name));

      commit({
        sessions,
        serverStatus,
        kanbanProjects: state.kanbanProjects,
        timelineEvents: state.timelineEvents,
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

  async function refreshKanbanProjects() {
    try {
      const kanbanProjects = await deps.api.listKanbanProjects();

      commit({
        ...state,
        kanbanProjects,
        loading: false,
        error: null
      });
    } catch (error) {
      commit({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to refresh kanban projects"
      });
    }
  }

  return {
    getState() {
      return state;
    },
    async refreshMuted(sessionNames: string[]) {
      if (sessionNames.length === 0) {
        return;
      }

      try {
        const sessions = await deps.api.listDashboardSessions(sessionNames);
        const refreshedByName = new Map(
          sessions.map((session) => [session.name, session])
        );
        const nextSessions = state.sessions.map(
          (session) => refreshedByName.get(session.name) ?? session
        );
        const missingSessions = sessions.filter(
          (session) =>
            !state.sessions.some(
              (existingSession) => existingSession.name === session.name
            )
        );
        const mergedSessions = mergeLightweightSessionList([
          ...nextSessions,
          ...missingSessions
        ]);

        commit({
          ...state,
          sessions: mergedSessions,
          loading: false,
          error: null
        });
        persistSessionList(mergedSessions);
      } catch (error) {
        commit({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to refresh muted sessions"
        });
      }
    },
    refreshKanbanProjects,
    refreshSessionList,
    async syncSessionAndKanbanState() {
      await Promise.all([
        refresh({
          includePreview: false,
          includePanes: true,
          includeServerStatus: true,
          preferActiveSessionStatus: false
        }),
        refreshKanbanProjects()
      ]);
    },
    subscribe(listener: (state: DashboardState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    refreshTimeline,
    mergeTimelineEvent,
    async createSession(name: string) {
      await deps.api.createSession(name);
      await refreshTimeline();
      await refreshSessionList();
    },
    async renameSession(fromName: string, toName: string) {
      await deps.api.renameSession(fromName, toName);
      await refreshTimeline();
      await Promise.all([refreshSessionList(), refreshKanbanProjects()]);
    },
    async killSession(name: string) {
      await deps.api.killSession(name);
      await refreshTimeline();
      await refreshSessionList();
    },
    async sendCommand(name: string, command: string) {
      await deps.api.sendCommand(name, command);
      await refreshTimeline();
    },
    async splitPane(name: string, direction: SplitPaneDirection) {
      await deps.api.splitPane(name, direction);
      await refreshTimeline();
      await refresh();
    },
    async selectPane(name: string, paneId: string) {
      await deps.api.selectPane(name, paneId);
      await refreshTimeline();
      await refresh({
        includePreview: false,
        includePanes: true,
        includeServerStatus: false
      });
    },
    async killPane(name: string, paneId: string) {
      await deps.api.killPane(name, paneId);
      await refreshTimeline();
      await refresh({ includePanes: true });
    },
    async createKanbanProject(project: CreateKanbanProjectRequest) {
      await deps.api.createKanbanProject(project);
      await refreshKanbanProjects();
    },
    async addKanbanSession(projectName: string, sessionName: string) {
      await deps.api.addKanbanSession(projectName, sessionName);
      await refreshKanbanProjects();
    },
    async moveKanbanSession(
      fromProjectName: string | null,
      toProjectName: string,
      sessionName: string
    ) {
      const trimmedSessionName = sessionName.trim();
      const trimmedToProjectName = toProjectName.trim();
      const trimmedFromProjectName = fromProjectName?.trim() || null;

      if (!trimmedSessionName || !trimmedToProjectName) {
        return;
      }

      if (trimmedToProjectName === "ungrouped") {
        if (trimmedFromProjectName) {
          await deps.api.removeKanbanSession(trimmedFromProjectName, trimmedSessionName, {
            kill: false
          });
          await refreshKanbanProjects();
        }
        return;
      }

      if (trimmedFromProjectName && trimmedFromProjectName !== trimmedToProjectName) {
        await deps.api.removeKanbanSession(trimmedFromProjectName, trimmedSessionName, {
          kill: false
        });
      }

      await deps.api.addKanbanSession(trimmedToProjectName, trimmedSessionName);
      await refreshKanbanProjects();
    },
    async removeKanbanSession(
      projectName: string,
      agentName: string,
      options: { kill?: boolean } = {}
    ) {
      await deps.api.removeKanbanSession(projectName, agentName, options);
      await refreshKanbanProjects();
      if (options.kill) {
        await refreshSessionList();
      }
    },
    async deleteKanbanProject(projectName: string) {
      await deps.api.deleteKanbanProject(projectName);
      await refreshKanbanProjects();
    },
    startPolling() {
      if (
        timer !== null ||
        dashboardTimer !== null ||
        serverStatusTimer !== null ||
        kanbanTimer !== null
      ) {
        return;
      }

      timer = globalThis.setInterval(() => {
        const activeSessionName = deps.getActiveSessionName?.() ?? null;

        if (!activeSessionName || deps.isActiveSessionBusy?.()) {
          return;
        }

        void refresh({
          includePreview: false,
          includePanes: true,
          includeServerStatus: false
        });
      }, deps.pollMs);

      dashboardTimer = globalThis.setInterval(() => {
        const dashboardPollOptions = deps.getDashboardPollOptions?.();

        if (dashboardPollOptions) {
          void refresh(dashboardPollOptions);
          return;
        }

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

      kanbanTimer = globalThis.setInterval(() => {
        void refreshKanbanProjects();
      }, deps.kanbanPollMs ?? Math.max(deps.pollMs, 300_000));
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

      if (kanbanTimer !== null) {
        globalThis.clearInterval(kanbanTimer);
        kanbanTimer = null;
      }
    }
  };
}

export type DashboardTabDescriptor = BrowserTab;
