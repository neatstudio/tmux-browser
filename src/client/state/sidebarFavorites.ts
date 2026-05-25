import type { Preferences, SessionApi } from "../api/sessionApi";

type SidebarFavoritesApi = Pick<
  SessionApi,
  "getPreferences" | "setPinnedSession"
>;

function normalizeSessionNames(names: Iterable<unknown>) {
  return [...new Set([...names].filter((name): name is string => typeof name === "string"))]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function createSidebarFavoritesStore(api: SidebarFavoritesApi) {
  let pinnedSessionNames: string[] = [];

  function applyPreferences(preferences: Preferences) {
    pinnedSessionNames = normalizeSessionNames(preferences.pinnedSessionNames);
  }

  return {
    async load() {
      try {
        applyPreferences(await api.getPreferences());
      } catch {
        pinnedSessionNames = [];
      }
    },
    getPinnedSessionNames() {
      return pinnedSessionNames;
    },
    async togglePinned(sessionName: string) {
      const pinned = !pinnedSessionNames.includes(sessionName);

      applyPreferences({
        pinnedSessionNames: pinned
          ? [...pinnedSessionNames, sessionName]
          : pinnedSessionNames.filter((name) => name !== sessionName)
      });
      await api.setPinnedSession(sessionName, pinned);
    }
  };
}
