import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Preferences = {
  pinnedSessionNames: string[];
};

export type PreferenceStore = {
  getPreferences: () => Preferences;
  setPinnedSession: (sessionName: string, pinned: boolean) => Promise<Preferences>;
  renameSession: (fromName: string, toName: string) => Promise<Preferences>;
};

const DEFAULT_PREFERENCES: Preferences = {
  pinnedSessionNames: []
};

function normalizeSessionNames(names: Iterable<unknown>) {
  return [...new Set([...names].filter((name): name is string => typeof name === "string"))]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function normalizePreferences(preferences: Partial<Preferences>): Preferences {
  return {
    pinnedSessionNames: normalizeSessionNames(preferences.pinnedSessionNames ?? [])
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
      return { pinnedSessionNames: [...preferences.pinnedSessionNames] };
    },
    async setPinnedSession(sessionName, pinned) {
      const normalizedName = sessionName.trim();

      preferences = normalizePreferences({
        pinnedSessionNames: pinned
          ? [...preferences.pinnedSessionNames, normalizedName]
          : preferences.pinnedSessionNames.filter((name) => name !== normalizedName)
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
        pinnedSessionNames: preferences.pinnedSessionNames.map((name) =>
          name === normalizedFromName ? normalizedToName : name
        )
      });
      await persist();

      return this.getPreferences();
    }
  };
}
