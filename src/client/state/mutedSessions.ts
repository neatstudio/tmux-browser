import type { SessionApi } from "../api/sessionApi";

const MUTED_SESSIONS_STORAGE_KEY = "browser-tmux-dashboard.muted-sessions";
const DEFAULT_MUTED_SESSION_NAMES = ["tmux-ui"];

type MutedSessionsPayload = {
  names: string[];
};

type MutedSessionsApi = Pick<SessionApi, "getPreferences" | "setMutedSession">;

function normalizeSessionNames(names: Iterable<unknown>) {
  return [...new Set([...names].filter((name): name is string => typeof name === "string"))]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function readMutedSessionNames(storage: Storage) {
  const stored = storage.getItem(MUTED_SESSIONS_STORAGE_KEY);

  if (!stored) {
    return DEFAULT_MUTED_SESSION_NAMES;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<MutedSessionsPayload>;

    return normalizeSessionNames(parsed.names ?? []);
  } catch {
    return DEFAULT_MUTED_SESSION_NAMES;
  }
}

export function createMutedSessionsStore(
  storage: Storage = window.localStorage,
  api?: MutedSessionsApi
) {
  let mutedSessionNames = readMutedSessionNames(storage);

  function persist() {
    storage.setItem(
      MUTED_SESSIONS_STORAGE_KEY,
      JSON.stringify({ names: mutedSessionNames })
    );
  }

  function persistRemote(sessionName: string, muted: boolean) {
    void api?.setMutedSession(sessionName, muted).catch(() => {
      // Local mute state remains available when the preference API is offline.
    });
  }

  return {
    async load() {
      if (!api) {
        return;
      }

      try {
        mutedSessionNames = normalizeSessionNames(
          (await api.getPreferences()).mutedSessionNames ?? DEFAULT_MUTED_SESSION_NAMES
        );
        persist();
      } catch {
        mutedSessionNames = readMutedSessionNames(storage);
      }
    },
    getMutedSessionNames() {
      return mutedSessionNames;
    },
    isMuted(sessionName: string) {
      return mutedSessionNames.includes(sessionName);
    },
    toggleMuted(sessionName: string) {
      const muted = !mutedSessionNames.includes(sessionName);
      mutedSessionNames = muted
        ? normalizeSessionNames([...mutedSessionNames, sessionName])
        : mutedSessionNames.filter((name) => name !== sessionName);
      persist();
      persistRemote(sessionName, muted);
    },
    renameSession(fromName: string, toName: string) {
      if (!mutedSessionNames.includes(fromName)) {
        return;
      }

      mutedSessionNames = normalizeSessionNames(
        mutedSessionNames.map((name) => (name === fromName ? toName : name))
      );
      persist();
    }
  };
}
