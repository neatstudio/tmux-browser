export type SessionSettings = {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  themeId: string;
};

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  fontSize: 14,
  fontFamily:
    "Iosevka Term, Menlo, PingFang SC, Hiragino Sans GB, Noto Sans Mono CJK SC, Microsoft YaHei UI, monospace",
  lineHeight: 1.1,
  themeId: "graphite"
};

export const FONT_FAMILY_OPTIONS = [
  DEFAULT_SESSION_SETTINGS.fontFamily,
  "JetBrains Mono, PingFang SC, Hiragino Sans GB, Noto Sans Mono CJK SC, Microsoft YaHei UI, monospace",
  "Menlo, PingFang SC, Hiragino Sans GB, Noto Sans Mono CJK SC, Microsoft YaHei UI, monospace",
  "SFMono-Regular, Consolas, PingFang SC, Hiragino Sans GB, Noto Sans Mono CJK SC, Microsoft YaHei UI, monospace",
  "monospace"
];

const FONT_FAMILY_MIGRATIONS = new Map<string, string>([
  ["Iosevka Term, Menlo, monospace", FONT_FAMILY_OPTIONS[0]!],
  ["JetBrains Mono, monospace", FONT_FAMILY_OPTIONS[1]!],
  ["Menlo, monospace", FONT_FAMILY_OPTIONS[2]!],
  ["SFMono-Regular, Consolas, monospace", FONT_FAMILY_OPTIONS[3]!]
]);

const SESSION_SETTINGS_STORAGE_KEY = "browser-tmux-dashboard-session-settings";
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const MIN_LINE_HEIGHT = 1;
const MAX_LINE_HEIGHT = 1.8;

function clampFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_SETTINGS.fontSize;
  }

  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

function clampLineHeight(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_SETTINGS.lineHeight;
  }

  return Number(
    Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, value)).toFixed(2)
  );
}

function normalizeFontFamily(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_SESSION_SETTINGS.fontFamily;
  }

  return FONT_FAMILY_MIGRATIONS.get(value) ?? value;
}

function normalizeSettings(value: unknown): SessionSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_SESSION_SETTINGS;
  }

  return {
    fontSize: clampFontSize(
      "fontSize" in value ? Number(value.fontSize) : DEFAULT_SESSION_SETTINGS.fontSize
    ),
    fontFamily: normalizeFontFamily(
      "fontFamily" in value ? value.fontFamily : undefined
    ),
    lineHeight: clampLineHeight(
      "lineHeight" in value
        ? Number(value.lineHeight)
        : DEFAULT_SESSION_SETTINGS.lineHeight
    ),
    themeId:
      "themeId" in value && typeof value.themeId === "string"
        ? value.themeId
        : DEFAULT_SESSION_SETTINGS.themeId
  };
}

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
        normalizeSettings(settings)
      ])
    );
  } catch {
    return {};
  }
}

export function createSessionSettingsStore(
  storage: Storage = window.localStorage
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

  return {
    get,
    setFontSize(sessionName: string, fontSize: number): SessionSettings {
      const nextSettings = {
        ...get(sessionName),
        fontSize: clampFontSize(fontSize)
      };

      settingsBySession = {
        ...settingsBySession,
        [sessionName]: nextSettings
      };
      persist();

      return nextSettings;
    },
    setFontFamily(sessionName: string, fontFamily: string): SessionSettings {
      const nextSettings = {
        ...get(sessionName),
        fontFamily: normalizeFontFamily(fontFamily)
      };

      settingsBySession = {
        ...settingsBySession,
        [sessionName]: nextSettings
      };
      persist();

      return nextSettings;
    },
    setLineHeight(sessionName: string, lineHeight: number): SessionSettings {
      const nextSettings = {
        ...get(sessionName),
        lineHeight: clampLineHeight(lineHeight)
      };

      settingsBySession = {
        ...settingsBySession,
        [sessionName]: nextSettings
      };
      persist();

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
