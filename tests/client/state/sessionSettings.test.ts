import { describe, expect, it, vi } from "vitest";

import {
  createSessionSettingsStore,
  DEFAULT_SESSION_SETTINGS,
  FONT_FAMILY_OPTIONS
} from "../../../src/client/state/sessionSettings";

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key) {
      return items.get(key) ?? null;
    },
    key(index) {
      return [...items.keys()][index] ?? null;
    },
    removeItem(key) {
      items.delete(key);
    },
    setItem(key, value) {
      items.set(key, value);
    }
  };
}

describe("createSessionSettingsStore", () => {
  it("returns default settings for sessions without overrides", () => {
    const store = createSessionSettingsStore(createMemoryStorage());

    expect(store.get("build")).toEqual(DEFAULT_SESSION_SETTINGS);
  });

  it("includes CJK fallback fonts in the default terminal font stack", () => {
    expect(DEFAULT_SESSION_SETTINGS.fontFamily).toContain("PingFang SC");
    expect(DEFAULT_SESSION_SETTINGS.fontFamily).toContain("Noto Sans Mono CJK SC");
  });

  it("persists clamped font sizes per session", () => {
    const storage = createMemoryStorage();
    const store = createSessionSettingsStore(storage);

    store.setFontSize("build", 42);
    store.setFontSize("ops", 11);

    const restored = createSessionSettingsStore(storage);

    expect(restored.get("build").fontSize).toBe(24);
    expect(restored.get("ops").fontSize).toBe(11);
  });

  it("persists theme ids per session", () => {
    const storage = createMemoryStorage();
    const store = createSessionSettingsStore(storage);

    store.setThemeId("build", "paper");

    const restored = createSessionSettingsStore(storage);

    expect(restored.get("build").themeId).toBe("paper");
  });

  it("persists typography settings per session", () => {
    const storage = createMemoryStorage();
    const store = createSessionSettingsStore(storage);

    store.setFontFamily("build", "Menlo, monospace");
    store.setLineHeight("build", 2.8);
    store.setLineHeight("ops", 0.5);

    const restored = createSessionSettingsStore(storage);

    expect(restored.get("build").fontFamily).toBe(FONT_FAMILY_OPTIONS[2]);
    expect(restored.get("build").lineHeight).toBe(1.8);
    expect(restored.get("ops").lineHeight).toBe(1);
  });

  it("migrates stored legacy font stacks to CJK-safe equivalents", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "browser-tmux-dashboard-session-settings",
      JSON.stringify({
        build: {
          fontSize: 14,
          fontFamily: "Menlo, monospace",
          lineHeight: 1.1,
          themeId: "graphite"
        }
      })
    );

    const store = createSessionSettingsStore(storage);

    expect(store.get("build").fontFamily).toBe(FONT_FAMILY_OPTIONS[2]);
  });

  it("renames per-session overrides", () => {
    const storage = createMemoryStorage();
    const store = createSessionSettingsStore(storage);

    store.setFontSize("build", 18);
    store.renameSession("build", "build-test");

    const restored = createSessionSettingsStore(storage);

    expect(restored.get("build")).toEqual(DEFAULT_SESSION_SETTINGS);
    expect(restored.get("build-test").fontSize).toBe(18);
  });

  it("loads and updates per-session settings through server preferences", async () => {
    const api = {
      getPreferences: vi.fn().mockResolvedValue({
        pinnedSessionNames: [],
        mutedSessionNames: [],
        sessionSettings: {
          build: {
            fontSize: 19,
            fontFamily: "Menlo, monospace",
            lineHeight: 1.25,
            themeId: "paper"
          }
        }
      }),
      setSessionSettings: vi.fn().mockResolvedValue(undefined)
    };
    const store = createSessionSettingsStore(createMemoryStorage(), api);

    await store.load();
    const nextSettings = store.setFontSize("build", 42);

    expect(store.get("build").fontFamily).toBe(FONT_FAMILY_OPTIONS[2]);
    expect(nextSettings.fontSize).toBe(24);
    await vi.waitFor(() => {
      expect(api.setSessionSettings).toHaveBeenCalledWith("build", {
        fontSize: 24,
        fontFamily: FONT_FAMILY_OPTIONS[2],
        lineHeight: 1.25,
        themeId: "paper"
      });
    });
  });
});
