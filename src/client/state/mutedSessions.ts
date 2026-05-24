const MUTED_SESSIONS_STORAGE_KEY = "browser-tmux-dashboard.muted-sessions";
const DEFAULT_MUTED_SESSION_NAMES = ["tmux-ui"];

type MutedSessionsPayload = {
  names: string[];
};

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

export function createMutedSessionsStore(storage: Storage = window.localStorage) {
  let mutedSessionNames = readMutedSessionNames(storage);

  function persist() {
    storage.setItem(
      MUTED_SESSIONS_STORAGE_KEY,
      JSON.stringify({ names: mutedSessionNames })
    );
  }

  return {
    getMutedSessionNames() {
      return mutedSessionNames;
    },
    isMuted(sessionName: string) {
      return mutedSessionNames.includes(sessionName);
    },
    toggleMuted(sessionName: string) {
      mutedSessionNames = mutedSessionNames.includes(sessionName)
        ? mutedSessionNames.filter((name) => name !== sessionName)
        : normalizeSessionNames([...mutedSessionNames, sessionName]);
      persist();
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
