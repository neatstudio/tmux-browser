import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  normalizeSessionSettings,
  type SessionSettings
} from "../../../shared/sessionSettings.js";

export type Preferences = {
  pinnedSessionNames: string[];
  mutedSessionNames: string[];
  sessionSettings: Record<string, SessionSettings>;
  kanbanProjects: KanbanProject[];
};

export type KanbanAgent = {
  kind: string;
  name: string;
  command: string | null;
};

export type KanbanProject = {
  name: string;
  path: string;
  server: string | null;
  agents: KanbanAgent[];
};

export type PreferenceStore = {
  getPreferences: () => Preferences;
  setPinnedSession: (sessionName: string, pinned: boolean) => Promise<Preferences>;
  setMutedSession: (sessionName: string, muted: boolean) => Promise<Preferences>;
  setSessionSettings: (
    sessionName: string,
    settings: SessionSettings
  ) => Promise<Preferences>;
  upsertKanbanProject: (project: KanbanProject) => Promise<Preferences>;
  deleteKanbanProject: (projectName: string) => Promise<Preferences>;
  renameSession: (fromName: string, toName: string) => Promise<Preferences>;
};

const DEFAULT_PREFERENCES: Preferences = {
  pinnedSessionNames: [],
  mutedSessionNames: ["tmux-ui"],
  sessionSettings: {},
  kanbanProjects: []
};

function normalizeSessionNames(names: Iterable<unknown>) {
  return [...new Set([...names].filter((name): name is string => typeof name === "string"))]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

function normalizeKanbanAgents(agents: unknown): KanbanAgent[] {
  if (!Array.isArray(agents)) {
    return [];
  }

  return agents
    .map((agent) => {
      if (!agent || typeof agent !== "object") {
        return null;
      }

      const record = agent as Record<string, unknown>;
      const kind = normalizeNullableString(record.kind);
      const name = normalizeNullableString(record.name);

      if (!kind || !name) {
        return null;
      }

      return {
        kind,
        name,
        command: normalizeNullableString(record.command)
      };
    })
    .filter((agent): agent is KanbanAgent => agent !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeKanbanProjects(projects: unknown): KanbanProject[] {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects
    .map((project) => {
      if (!project || typeof project !== "object") {
        return null;
      }

      const record = project as Record<string, unknown>;
      const name = normalizeNullableString(record.name);
      const path = normalizeNullableString(record.path);

      if (!name || !path) {
        return null;
      }

      return {
        name,
        path,
        server: normalizeNullableString(record.server),
        agents: normalizeKanbanAgents(record.agents)
      };
    })
    .filter((project): project is KanbanProject => project !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizePreferences(preferences: Partial<Preferences>): Preferences {
  return {
    pinnedSessionNames: normalizeSessionNames(preferences.pinnedSessionNames ?? []),
    mutedSessionNames: normalizeSessionNames(
      preferences.mutedSessionNames ?? DEFAULT_PREFERENCES.mutedSessionNames
    ),
    sessionSettings: Object.fromEntries(
      Object.entries(preferences.sessionSettings ?? {})
        .map(([sessionName, settings]) => [
          sessionName.trim(),
          normalizeSessionSettings(settings)
        ] as const)
        .filter(([sessionName]) => sessionName)
        .sort((left, right) => left[0].localeCompare(right[0]))
    ),
    kanbanProjects: normalizeKanbanProjects(preferences.kanbanProjects ?? [])
  };
}

function getDefaultPreferenceFilePath() {
  return join(homedir(), ".tmux-ui", "preferences.json");
}

function readPreferences(filePath: string): Preferences {
  if (!existsSync(filePath)) {
    return DEFAULT_PREFERENCES;
  }

  try {
    return normalizePreferences(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function createPreferenceStore(
  options: { filePath?: string } = {}
): PreferenceStore {
  const filePath = options.filePath ?? getDefaultPreferenceFilePath();
  let preferences = readPreferences(filePath);

  async function persist() {
    const temporaryFilePath = `${filePath}.tmp`;

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryFilePath, `${JSON.stringify(preferences, null, 2)}\n`);
    await rename(temporaryFilePath, filePath);
  }

  return {
    getPreferences() {
      return {
        pinnedSessionNames: [...preferences.pinnedSessionNames],
        mutedSessionNames: [...preferences.mutedSessionNames],
        sessionSettings: Object.fromEntries(
          Object.entries(preferences.sessionSettings).map(([sessionName, settings]) => [
            sessionName,
            { ...settings }
          ])
        ),
        kanbanProjects: preferences.kanbanProjects.map((project) => ({
          ...project,
          agents: project.agents.map((agent) => ({ ...agent }))
        }))
      };
    },
    async setPinnedSession(sessionName, pinned) {
      const normalizedName = sessionName.trim();

      preferences = normalizePreferences({
        ...preferences,
        pinnedSessionNames: pinned
          ? [...preferences.pinnedSessionNames, normalizedName]
          : preferences.pinnedSessionNames.filter((name) => name !== normalizedName)
      });
      await persist();

      return this.getPreferences();
    },
    async setMutedSession(sessionName, muted) {
      const normalizedName = sessionName.trim();

      if (!normalizedName) {
        return this.getPreferences();
      }

      preferences = normalizePreferences({
        ...preferences,
        mutedSessionNames: muted
          ? [...preferences.mutedSessionNames, normalizedName]
          : preferences.mutedSessionNames.filter((name) => name !== normalizedName)
      });
      await persist();

      return this.getPreferences();
    },
    async setSessionSettings(sessionName, settings) {
      const normalizedName = sessionName.trim();

      if (!normalizedName) {
        return this.getPreferences();
      }

      preferences = normalizePreferences({
        ...preferences,
        sessionSettings: {
          ...preferences.sessionSettings,
          [normalizedName]: normalizeSessionSettings(settings)
        }
      });
      await persist();

      return this.getPreferences();
    },
    async upsertKanbanProject(project) {
      const [normalizedProject] = normalizeKanbanProjects([project]);

      if (!normalizedProject) {
        return this.getPreferences();
      }

      preferences = normalizePreferences({
        ...preferences,
        kanbanProjects: [
          ...preferences.kanbanProjects.filter(
            (existingProject) => existingProject.name !== normalizedProject.name
          ),
          normalizedProject
        ]
      });
      await persist();

      return this.getPreferences();
    },
    async deleteKanbanProject(projectName) {
      const normalizedName = projectName.trim();

      if (!normalizedName) {
        return this.getPreferences();
      }

      preferences = normalizePreferences({
        ...preferences,
        kanbanProjects: preferences.kanbanProjects.filter(
          (project) => project.name !== normalizedName
        )
      });
      await persist();

      return this.getPreferences();
    },
    async renameSession(fromName, toName) {
      const normalizedFromName = fromName.trim();
      const normalizedToName = toName.trim();

      if (!normalizedFromName || !normalizedToName) {
        return this.getPreferences();
      }

      preferences = normalizePreferences({
        ...preferences,
        pinnedSessionNames: preferences.pinnedSessionNames.map((name) =>
          name === normalizedFromName ? normalizedToName : name
        ),
        mutedSessionNames: preferences.mutedSessionNames.map((name) =>
          name === normalizedFromName ? normalizedToName : name
        ),
        sessionSettings:
          preferences.sessionSettings[normalizedFromName] === undefined
            ? preferences.sessionSettings
            : {
                ...Object.fromEntries(
                  Object.entries(preferences.sessionSettings).filter(
                    ([sessionName]) => sessionName !== normalizedFromName
                  )
                ),
                [normalizedToName]: preferences.sessionSettings[normalizedFromName]
              }
      });
      await persist();

      return this.getPreferences();
    }
  };
}
