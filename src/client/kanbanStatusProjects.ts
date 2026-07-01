import type {
  KanbanProject,
  SessionSummary
} from "./api/sessionApi";
import type {
  KanbanStatusProject,
  KanbanStatusSession
} from "./render/sessionStatusBar";

const UNGROUPED_PROJECT_NAME = "ungrouped";
const KANBAN_STATUS_PROJECTS_STORAGE_KEY =
  "tmux-ui.kanban-status-projects.v1";

type KanbanStatusProjectsStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

function normalizeSessionNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getKanbanAgentSessionName(projectName: string, agentName: string) {
  const normalizedProjectName = normalizeSessionNamePart(projectName);
  const normalizedAgentName = normalizeSessionNamePart(agentName);

  return normalizedProjectName && normalizedAgentName
    ? `${normalizedProjectName}-${normalizedAgentName}`
    : "";
}

function getKanbanConfiguredSessionName(
  projectName: string,
  agent: KanbanProject["agents"][number]
) {
  return agent.sessionName ?? getKanbanAgentSessionName(projectName, agent.name);
}

function getConfiguredProjectSessions(
  project: KanbanProject,
  existingSessionNames: Set<string>
): KanbanStatusSession[] {
  return project.agents
    .map((agent) => {
      const name = getKanbanConfiguredSessionName(project.name, agent);

      return {
        name,
        label: agent.name || name,
        live: existingSessionNames.has(name)
      };
    })
    .filter((projectSession) => projectSession.name);
}

function getGroupedSessionNames(projects: KanbanProject[]) {
  return new Set(
    projects.flatMap((project) =>
      project.agents.map((agent) =>
        getKanbanConfiguredSessionName(project.name, agent)
      )
    )
  );
}

function getUngroupedProject(
  sessions: SessionSummary[],
  projects: KanbanProject[]
): KanbanStatusProject | null {
  const groupedSessionNames = getGroupedSessionNames(projects);
  const ungroupedSessions = sessions
    .map((session) => session.name)
    .filter((sessionName) => !groupedSessionNames.has(sessionName))
    .map((sessionName) => ({
      name: sessionName,
      label: sessionName,
      live: true
    }));

  if (ungroupedSessions.length === 0) {
    return null;
  }

  return {
    name: UNGROUPED_PROJECT_NAME,
    virtual: true,
    sessions: ungroupedSessions
  };
}

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCachedSession(
  value: unknown,
  seenSessionNames: Set<string>
): KanbanStatusSession | null {
  const record = getObjectRecord(value);

  if (!record) {
    return null;
  }

  const name = getTrimmedString(record.name);

  if (!name || seenSessionNames.has(name)) {
    return null;
  }

  seenSessionNames.add(name);

  const label = getTrimmedString(record.label);
  const live = typeof record.live === "boolean" ? record.live : undefined;

  return {
    name,
    label: label || name,
    ...(live === undefined ? {} : { live })
  };
}

function normalizeCachedProject(value: unknown): KanbanStatusProject | null {
  const record = getObjectRecord(value);

  if (!record) {
    return null;
  }

  const name = getTrimmedString(record.name);

  if (!name || !Array.isArray(record.sessions)) {
    return null;
  }

  const seenSessionNames = new Set<string>();
  const sessions = record.sessions
    .map((session) => normalizeCachedSession(session, seenSessionNames))
    .filter((session): session is KanbanStatusSession => session !== null);

  if (sessions.length === 0) {
    return null;
  }

  return {
    name,
    virtual: record.virtual === true,
    sessions
  };
}

function normalizeCachedProjects(value: unknown): KanbanStatusProject[] {
  const record = getObjectRecord(value);
  const source =
    record && Array.isArray(record.projects) ? record.projects : value;

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((project) => normalizeCachedProject(project))
    .filter((project): project is KanbanStatusProject => project !== null);
}

function getDefaultKanbanStatusProjectsStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createKanbanStatusProjectsCache(
  storage: KanbanStatusProjectsStorage | null =
    getDefaultKanbanStatusProjectsStorage()
) {
  return {
    read() {
      if (!storage) {
        return [];
      }

      try {
        const raw = storage.getItem(KANBAN_STATUS_PROJECTS_STORAGE_KEY);

        return raw ? normalizeCachedProjects(JSON.parse(raw)) : [];
      } catch {
        return [];
      }
    },

    write(projects: KanbanStatusProject[]) {
      if (!storage) {
        return;
      }

      const normalizedProjects = normalizeCachedProjects(projects);

      try {
        if (normalizedProjects.length === 0) {
          storage.removeItem(KANBAN_STATUS_PROJECTS_STORAGE_KEY);
          return;
        }

        storage.setItem(
          KANBAN_STATUS_PROJECTS_STORAGE_KEY,
          JSON.stringify({
            projects: normalizedProjects,
            updatedAt: new Date().toISOString()
          })
        );
      } catch {
        // Storage can be unavailable in private mode or full quota states.
      }
    }
  };
}

export function getKanbanStatusProjects(
  sessions: SessionSummary[],
  projects: KanbanProject[]
): KanbanStatusProject[] {
  const existingSessionNames = new Set(sessions.map((session) => session.name));
  const configuredStatusProjects = projects
    .map((project) => ({
      name: project.name,
      virtual: false,
      sessions: getConfiguredProjectSessions(project, existingSessionNames)
    }))
    .filter((project) => project.sessions.length > 0);
  const ungrouped = getUngroupedProject(sessions, projects);

  return ungrouped
    ? [...configuredStatusProjects, ungrouped]
    : configuredStatusProjects;
}

export function getKanbanStatusProject(
  sessionName: string,
  sessions: SessionSummary[],
  projects: KanbanProject[]
): KanbanStatusProject | null {
  return (
    getKanbanStatusProjects(sessions, projects).find((project) =>
      project.sessions.some((session) => session.name === sessionName)
    ) ?? null
  );
}
