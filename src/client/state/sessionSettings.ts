import type { Preferences, SessionApi } from "../api/sessionApi";
import {
  clampSessionFontSize,
  clampSessionLineHeight,
  DEFAULT_SESSION_SETTINGS,
  FONT_FAMILY_OPTIONS,
  normalizeSessionFontFamily,
  normalizeSessionSettings,
  type SessionSettings
} from "../../shared/sessionSettings";

export {
  DEFAULT_SESSION_SETTINGS,
  FONT_FAMILY_OPTIONS,
  type SessionSettings
};

const SESSION_SETTINGS_STORAGE_KEY = "browser-tmux-dashboard-session-settings";

type SessionSettingsApi = Pick<
  SessionApi,
  "getPreferences" | "setSessionSettings"
>;

function readSettings(storage: Storage): Record<string, SessionSettings> {
  const stored = storage.getItem(SESSION_SETTINGS_STORAGE_KEY);

  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([sessionName, settings]) => [
        sessionName,
        normalizeSessionSettings(settings)
      ])
    );
  } catch {
    return {};
  }
}

function normalizeSettingsRecord(
  settings: Preferences["sessionSettings"] | undefined
) {
  return Object.fromEntries(
    Object.entries(settings ?? {})
      .map(([sessionName, value]) => [sessionName.trim(), normalizeSessionSettings(value)])
      .filter(([sessionName]) => sessionName)
  );
}

export function createSessionSettingsStore(
  storage: Storage = window.localStorage,
  api?: SessionSettingsApi
) {
  let settingsBySession = readSettings(storage);

  function get(sessionName: string): SessionSettings {
    return settingsBySession[sessionName] ?? DEFAULT_SESSION_SETTINGS;
  }

  function persist() {
    storage.setItem(
      SESSION_SETTINGS_STORAGE_KEY,
      JSON.stringify(settingsBySession)
    );
  }

  function persistRemote(sessionName: string, settings: SessionSettings) {
    void api?.setSessionSettings(sessionName, settings).catch(() => {
      // Local settings remain usable when the preference API is temporarily unavailable.
    });
  }

  return {
    async load() {
      if (!api) {
        return;
      }

      try {
        settingsBySession = normalizeSettingsRecord(
          (await api.getPreferences()).sessionSettings
        );
        persist();
      } catch {
        settingsBySession = readSettings(storage);
      }
    },
    get,
    setFontSize(sessionName: string, fontSize: number): SessionSettings {
      const nextSettings = {
        ...get(sessionName),
        fontSize: clampSessionFontSize(fontSize)
      };

      settingsBySession = {
        ...settingsBySession,
        [sessionName]: nextSettings
      };
      persist();
      persistRemote(sessionName, nextSettings);

      return nextSettings;
    },
    setFontFamily(
      sessionName: string,
      fontFamily: string
    ): SessionSettings {
      const nextSettings = {
        ...get(sessionName),
        fontFamily: normalizeSessionFontFamily(fontFamily)
      };

      settingsBySession = {
        ...settingsBySession,
        [sessionName]: nextSettings
      };
      persist();
      persistRemote(sessionName, nextSettings);

      return nextSettings;
    },
    setLineHeight(
      sessionName: string,
      lineHeight: number
    ): SessionSettings {
      const nextSettings = {
        ...get(sessionName),
        lineHeight: clampSessionLineHeight(lineHeight)
      };

      settingsBySession = {
        ...settingsBySession,
        [sessionName]: nextSettings
      };
      persist();
      persistRemote(sessionName, nextSettings);

      return nextSettings;
    },
    setThemeId(sessionName: string, themeId: string): SessionSettings {
      const nextSettings = {
        ...get(sessionName),
        themeId
      };

      settingsBySession = {
        ...settingsBySession,
        [sessionName]: nextSettings
      };
      persist();
      persistRemote(sessionName, nextSettings);

      return nextSettings;
    },
    renameSession(fromName: string, toName: string) {
      const existing = settingsBySession[fromName];

      if (!existing) {
        return;
      }

      const { [fromName]: _removed, ...rest } = settingsBySession;
      settingsBySession = {
        ...rest,
        [toName]: existing
      };
      persist();
    }
  };
}
