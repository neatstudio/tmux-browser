import type { SessionSummary } from "../api/sessionApi";

const SESSION_LIST_CACHE_STORAGE_KEY = "tmux-ui.session-list-cache.v1";

export type SessionListCache = {
  read: () => SessionSummary[];
  write: (sessions: SessionSummary[]) => void;
};

type SessionListCacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type SessionListCachePayload = {
  sessions: SessionSummary[];
  updatedAt: string;
};

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNullableNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeSessionSummary(value: unknown): SessionSummary | null {
  const record = getObjectRecord(value);

  if (!record) {
    return null;
  }

  const name = getTrimmedString(record.name);

  if (!name) {
    return null;
  }

  return {
    name,
    windows: Number(record.windows ?? 0) || 0,
    status: record.status === "attached" ? "attached" : "detached",
    lastActivityAt: getNullableNumber(record.lastActivityAt),
    paneCount: Number(record.paneCount ?? 0) || 0,
    activeWindowName:
      typeof record.activeWindowName === "string" && record.activeWindowName.trim()
        ? record.activeWindowName.trim()
        : null,
    currentCommand:
      typeof record.currentCommand === "string" && record.currentCommand.trim()
        ? record.currentCommand.trim()
        : null,
    runtimeKind:
      typeof record.runtimeKind === "string" && record.runtimeKind.trim()
        ? record.runtimeKind
        : undefined,
    currentPath:
      typeof record.currentPath === "string" && record.currentPath.trim()
        ? record.currentPath.trim()
        : null,
    gitBranch:
      typeof record.gitBranch === "string" && record.gitBranch.trim()
        ? record.gitBranch.trim()
        : null,
    gitDirty:
      typeof record.gitDirty === "boolean" ? record.gitDirty : record.gitDirty === null
        ? null
        : null,
    paneDead: record.paneDead === true,
    paneDeadStatus: getNullableNumber(record.paneDeadStatus),
    preview: null,
    inputPrompt: null
  };
}

function normalizeSessionList(value: unknown): SessionSummary[] {
  const record = getObjectRecord(value);
  const source =
    record && Array.isArray(record.sessions) ? record.sessions : value;

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((session) => normalizeSessionSummary(session))
    .filter((session): session is SessionSummary => session !== null);
}

function getDefaultSessionListCacheStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createSessionListCache(
  storage: SessionListCacheStorage | null = getDefaultSessionListCacheStorage()
) {
  return {
    read() {
      if (!storage) {
        return [];
      }

      try {
        const raw = storage.getItem(SESSION_LIST_CACHE_STORAGE_KEY);

        return raw ? normalizeSessionList(JSON.parse(raw)) : [];
      } catch {
        return [];
      }
    },
    write(sessions: SessionSummary[]) {
      if (!storage) {
        return;
      }

      const normalizedSessions = normalizeSessionList(sessions);

      try {
        if (normalizedSessions.length === 0) {
          storage.removeItem(SESSION_LIST_CACHE_STORAGE_KEY);
          return;
        }

        storage.setItem(
          SESSION_LIST_CACHE_STORAGE_KEY,
          JSON.stringify({
            sessions: normalizedSessions,
            updatedAt: new Date().toISOString()
          } satisfies SessionListCachePayload)
        );
      } catch {
        // localStorage can be unavailable in private mode or quota constrained states.
      }
    }
  };
}
