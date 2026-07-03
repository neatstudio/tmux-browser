export type SessionSettings = {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  themeId: string;
};

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  fontSize: 13,
  fontFamily:
    "Iosevka Term, Menlo, PingFang SC, Hiragino Sans GB, Noto Sans Mono CJK SC, Microsoft YaHei UI, monospace",
  lineHeight: 1,
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

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const MIN_LINE_HEIGHT = 1;
const MAX_LINE_HEIGHT = 1.8;

export function clampSessionFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_SETTINGS.fontSize;
  }

  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export function clampSessionLineHeight(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_SETTINGS.lineHeight;
  }

  return Number(
    Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, value)).toFixed(2)
  );
}

export function normalizeSessionFontFamily(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_SESSION_SETTINGS.fontFamily;
  }

  return FONT_FAMILY_MIGRATIONS.get(value) ?? value;
}

export function normalizeSessionSettings(value: unknown): SessionSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_SESSION_SETTINGS;
  }

  return {
    fontSize: clampSessionFontSize(
      "fontSize" in value ? Number(value.fontSize) : DEFAULT_SESSION_SETTINGS.fontSize
    ),
    fontFamily: normalizeSessionFontFamily(
      "fontFamily" in value ? value.fontFamily : undefined
    ),
    lineHeight: clampSessionLineHeight(
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
