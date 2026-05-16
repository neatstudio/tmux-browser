// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  formatCompactDateTime,
  formatDashboardSessionActivity,
  formatDateTime,
  formatDisplayPath,
  formatSessionActivity,
  renderDashboard
} from "../../../src/client/render/renderDashboard";
import { FONT_FAMILY_OPTIONS } from "../../../src/client/state/sessionSettings";
import { THEMES } from "../../../src/client/theme/themeState";

const SESSION_SETTINGS = {
  fontSize: 14,
  fontFamily: FONT_FAMILY_OPTIONS[2]!,
  lineHeight: 1.1,
  themeId: THEMES[0]!.id
};

const SERVER_STATUS = {
  platform: "linux",
  cpuCount: 4,
  loadAverage: [1, 0.5, 0.25] as [number, number, number],
  loadPercent: 25,
  memoryTotalBytes: 8 * 1024 * 1024 * 1024,
  memoryFreeBytes: 3 * 1024 * 1024 * 1024,
  memoryUsedPercent: 63,
  uptimeSeconds: 3661,
  homeDirectory: "/home/dashboard"
};

describe("renderDashboard", () => {
  it("formats dashboard timestamps as YYYY-MM-DD HH:mm", () => {
    expect(formatDateTime(new Date(2026, 4, 2, 9, 5))).toBe(
      "2026-05-02 09:05"
    );
  });

  it("formats card timestamps as MM-DD HH:mm", () => {
    expect(formatCompactDateTime(new Date(2026, 4, 2, 9, 5))).toBe(
      "05-02 09:05"
    );
  });

  it("combines relative activity with an absolute dashboard timestamp", () => {
    const activityAt = Math.floor(new Date(2026, 4, 2, 9, 5).getTime() / 1000);
    const nowMs = new Date(2026, 4, 2, 9, 8).getTime();

    expect(formatSessionActivity(activityAt, nowMs)).toBe(
      "idle 3m · 2026-05-02 09:05"
    );
    expect(formatDashboardSessionActivity(activityAt, nowMs)).toBe(
      "idle 3m · 05-02 09:05"
    );
  });

  it("shortens paths under the server home directory", () => {
    expect(formatDisplayPath("/Users/gouki/server/wwwroot", "/Users/gouki")).toBe(
      "~/server/wwwroot"
    );
    expect(formatDisplayPath("/Users/gouki", "/Users/gouki")).toBe("~");
    expect(formatDisplayPath("/Users/goukix/app", "/Users/gouki")).toBe(
      "/Users/goukix/app"
    );
    expect(formatDisplayPath("/root/tmux", "/root/")).toBe("~/tmux");
    expect(formatDisplayPath(null, "/root")).toBe("path unavailable");
    expect(formatDisplayPath("/var/www", "/root")).toBe("/var/www");
  });

  it("preserves the new-session draft across rerenders", () => {
    const root = document.createElement("div");
    let draft = "";

    const actions = {
      onCreateSession: vi.fn(),
      onOpenSession: vi.fn(),
      onKillSession: vi.fn(),
      onRenameSession: vi.fn(),
      getSessionSettings: vi.fn(() => SESSION_SETTINGS),
      onSessionFontSizeChange: vi.fn(),
      onSessionFontFamilyChange: vi.fn(),
      onSessionLineHeightChange: vi.fn(),
      onSessionThemeChange: vi.fn(),
      activeConfigSessionName: null,
      onOpenSessionConfig: vi.fn(),
      onCloseSessionConfig: vi.fn(),
      onThemeChange: vi.fn(),
      onDraftChange: (value: string) => {
        draft = value;
      }
    };

    renderDashboard(
      root,
      {
        sessions: [],
        loading: false,
        error: null
      },
      {
        ...actions,
        draftSessionName: draft,
        themes: THEMES,
        activeThemeId: THEMES[0]!.id
      }
    );

    const input = root.querySelector<HTMLInputElement>("input[name='sessionName']")!;
    input.value = "demo";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    renderDashboard(
      root,
      {
        sessions: [],
        loading: false,
        error: null
      },
      {
        ...actions,
        draftSessionName: draft,
        themes: THEMES,
        activeThemeId: THEMES[0]!.id
      }
    );

    const rerenderedInput =
      root.querySelector<HTMLInputElement>("input[name='sessionName']")!;

    expect(rerenderedInput.value).toBe("demo");
  });

  it("renders visible theme settings and applies the selected theme", () => {
    const root = document.createElement("div");
    const onThemeChange = vi.fn();

    renderDashboard(
      root,
      {
        sessions: [],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange
      }
    );

    expect(
      root.querySelectorAll<HTMLButtonElement>(".dashboard-header .theme-swatch")
    ).toHaveLength(THEMES.length);
    expect(root.querySelector(".dashboard-theme-menu summary")?.textContent).toContain(
      "Theme"
    );

    root.querySelectorAll<HTMLButtonElement>(".theme-swatch")[1]?.click();

    expect(onThemeChange).toHaveBeenCalledWith(THEMES[1]!.id);
  });

  it("shows current server load in the dashboard header", () => {
    const root = document.createElement("div");

    renderDashboard(
      root,
      {
        sessions: [],
        serverStatus: SERVER_STATUS,
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const status = root.querySelector<HTMLElement>(".server-status")!;

    expect(status.textContent).toContain("linux");
    expect(status.textContent).toContain("load 25%");
    expect(status.textContent).toContain("mem 63%");
    expect(status.textContent).toContain("up 1h 1m");
  });

  it("opens per-session configuration from a compact row action", () => {
    const root = document.createElement("div");
    const onOpenSessionConfig = vi.fn();

    renderDashboard(
      root,
      {
        sessions: [{ name: "build", windows: 1, status: "detached" }],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => ({ ...SESSION_SETTINGS, fontSize: 16 })),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig,
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    expect(root.querySelector(".session-config-modal")).toBeNull();

    root
      .querySelector<HTMLButtonElement>("button[data-action='configure-build']")
      ?.click();

    expect(onOpenSessionConfig).toHaveBeenCalledWith("build");
  });

  it("renames a session from a compact row action", () => {
    const root = document.createElement("div");
    const onRenameSession = vi.fn();

    renderDashboard(
      root,
      {
        sessions: [{ name: "build", windows: 1, status: "detached" }],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession,
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    root
      .querySelector<HTMLButtonElement>(
        ".session-title-cluster button[data-action='rename-build']"
      )
      ?.click();

    const input = root.querySelector<HTMLInputElement>(
      "input[name='rename-build']"
    )!;
    input.value = "build-test";
    input
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onRenameSession).toHaveBeenCalledWith("build", "build-test");
  });

  it("keeps rename and status in the session header and reserves the path row", () => {
    const root = document.createElement("div");

    renderDashboard(
      root,
      {
        sessions: [
          {
            name: "build",
            windows: 1,
            status: "attached",
            currentPath: "/srv/app/current",
            currentCommand: "zsh"
          }
        ],
        loading: false,
        error: null,
        serverStatus: {
          ...SERVER_STATUS,
          homeDirectory: "/srv"
        }
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const titleCluster = root.querySelector(".session-title-cluster")!;
    const headerActions = root.querySelector(".session-heading-actions")!;
    const path = root.querySelector(".session-path")!;
    const bottomButtons = root.querySelectorAll<HTMLButtonElement>(
      ".session-action-buttons > button"
    );
    const renameButton = root.querySelector<HTMLButtonElement>(
      ".session-title-cluster button[data-action='rename-build']"
    )!;
    const configButton = root.querySelector<HTMLButtonElement>(
      ".session-title-cluster button[data-action='configure-build']"
    )!;

    expect(titleCluster.textContent).toContain("build");
    expect(renameButton).toBeTruthy();
    expect(renameButton.classList.contains("session-icon-button")).toBe(true);
    expect(renameButton.getAttribute("aria-label")).toBe("Rename build");
    expect(renameButton.textContent).toBe("✎");
    expect(headerActions.textContent).not.toContain("Rename");
    expect(headerActions.textContent).not.toContain("⚙");
    expect(headerActions.textContent).toContain("attached");
    expect(configButton).toBeTruthy();
    expect(configButton.classList.contains("session-icon-button")).toBe(true);
    expect(configButton.classList.contains("session-config-button")).toBe(true);
    expect(configButton.getAttribute("aria-label")).toBe("Configure build");
    expect(configButton.textContent).toBe("⚙");
    expect(path.textContent).toBe("~/app/current");
    expect(path.getAttribute("title")).toBe("/srv/app/current");
    expect(root.querySelector(".session-meta")?.textContent).not.toContain(
      "/srv/app/current"
    );
    expect([...bottomButtons].map((button) => button.textContent)).toEqual([
      "Open",
      "🗑"
    ]);
    expect(bottomButtons[1]?.classList.contains("session-kill-button")).toBe(true);
    expect(bottomButtons[1]?.getAttribute("aria-label")).toBe("Kill build");
  });

  it("renders compact session cards without mobile row labels", () => {
    const root = document.createElement("div");

    renderDashboard(
      root,
      {
        sessions: [{ name: "build", windows: 1, status: "attached" }],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const cells = root.querySelectorAll<HTMLTableCellElement>(".session-table td");

    expect([...cells].map((cell) => cell.dataset.label)).toEqual([
      undefined,
      "Actions"
    ]);
  });

  it("shows the tmux attached status next to each session name", () => {
    const root = document.createElement("div");

    renderDashboard(
      root,
      {
        sessions: [
          { name: "build", windows: 1, status: "attached" },
          { name: "ops", windows: 1, status: "detached" }
        ],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const statusBadges = root.querySelectorAll<HTMLElement>(".session-status");

    expect(statusBadges[0]?.textContent).toBe("attached");
    expect(statusBadges[0]?.classList.contains("is-attached")).toBe(true);
    expect(statusBadges[1]?.textContent).toBe("detached");
    expect(statusBadges[1]?.classList.contains("is-detached")).toBe(true);
  });

  it("shows path on its own row and compact activity/window/pane metadata near actions", () => {
    const root = document.createElement("div");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 2, 9, 8));

    renderDashboard(
      root,
      {
        sessions: [
          {
            name: "build",
            windows: 2,
            status: "attached",
            lastActivityAt: Math.floor(new Date(2026, 4, 2, 9, 5).getTime() / 1000),
            paneCount: 3,
            activeWindowName: "server",
            currentCommand: "npm",
            currentPath: "/tmp/project/app",
            paneDead: true,
            paneDeadStatus: 1
          }
        ],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const meta = root.querySelector<HTMLElement>(".session-meta")!;
    const path = root.querySelector<HTMLElement>(".session-path")!;

    expect(meta.textContent).not.toContain("npm");
    expect(path.textContent).toBe("/tmp/project/app");
    expect(meta.textContent).not.toContain("/tmp/project/app");
    expect(meta.textContent).toContain("idle 3m · 05-02 09:05");
    expect(meta.textContent).toContain("2w");
    expect(meta.textContent).toContain("3p");
    expect(meta.textContent).toContain("failed 1");

    vi.useRealTimers();
  });

  it("only shows compact tmux window metadata when a session has multiple windows", () => {
    const root = document.createElement("div");

    renderDashboard(
      root,
      {
        sessions: [
          { name: "single", windows: 1, status: "detached" },
          { name: "multi", windows: 3, status: "attached" }
        ],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => SESSION_SETTINGS),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: null,
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const rows = root.querySelectorAll<HTMLTableRowElement>(".session-table tr");

    expect(rows[0]?.querySelector(".session-meta")?.textContent).not.toContain("1w");
    expect(rows[1]?.querySelector(".session-meta")?.textContent).toContain("3w");
  });

  it("renders per-session font and theme controls inside a modal", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onSessionFontSizeChange = vi.fn();
    const onSessionFontFamilyChange = vi.fn();
    const onSessionLineHeightChange = vi.fn();
    const onSessionThemeChange = vi.fn();
    const onCloseSessionConfig = vi.fn();

    renderDashboard(
      root,
      {
        sessions: [{ name: "build", windows: 1, status: "attached" }],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => ({
          fontSize: 16,
          fontFamily: FONT_FAMILY_OPTIONS[2]!,
          lineHeight: 1.3,
          themeId: THEMES[1]!.id
        })),
        onSessionFontSizeChange,
        onSessionFontFamilyChange,
        onSessionLineHeightChange,
        onSessionThemeChange,
        activeConfigSessionName: "build",
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig,
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const modal = root.querySelector<HTMLElement>(".session-config-modal")!;
    const fontInput = modal.querySelector<HTMLInputElement>(
      "input[name='fontSize-build']"
    )!;
    const fontFamilySelect = modal.querySelector<HTMLSelectElement>(
      "select[name='fontFamily-build']"
    )!;
    const lineHeightInput = modal.querySelector<HTMLInputElement>(
      "input[name='lineHeight-build']"
    )!;
    const sessionSwatches = root.querySelectorAll<HTMLButtonElement>(
      ".session-config-modal .session-theme-swatch"
    );

    expect(modal.getAttribute("role")).toBe("dialog");
    expect(fontInput.value).toBe("16");
    expect(fontFamilySelect.value).toBe(FONT_FAMILY_OPTIONS[2]);
    expect(lineHeightInput.value).toBe("1.3");
    expect(sessionSwatches).toHaveLength(THEMES.length);
    expect(sessionSwatches[1]?.getAttribute("aria-pressed")).toBe("true");

    fontInput.value = "18";
    fontInput.dispatchEvent(new Event("change", { bubbles: true }));
    fontFamilySelect.value = FONT_FAMILY_OPTIONS[1]!;
    fontFamilySelect.dispatchEvent(new Event("change", { bubbles: true }));
    lineHeightInput.value = "1.5";
    lineHeightInput.dispatchEvent(new Event("change", { bubbles: true }));
    sessionSwatches[2]?.click();
    modal.querySelector<HTMLButtonElement>(".session-config-close")?.click();

    expect(onSessionFontSizeChange).toHaveBeenCalledWith("build", 18);
    expect(onSessionFontFamilyChange).toHaveBeenCalledWith(
      "build",
      FONT_FAMILY_OPTIONS[1]
    );
    expect(onSessionLineHeightChange).toHaveBeenCalledWith("build", 1.5);
    expect(onSessionThemeChange).toHaveBeenCalledWith("build", THEMES[2]!.id);
    expect(onCloseSessionConfig).toHaveBeenCalled();

    root.remove();
  });

  it("prevents wheel gestures from changing numeric settings inputs", () => {
    const root = document.createElement("div");
    document.body.append(root);

    renderDashboard(
      root,
      {
        sessions: [{ name: "build", windows: 1, status: "detached" }],
        loading: false,
        error: null
      },
      {
        onCreateSession: vi.fn(),
        onOpenSession: vi.fn(),
        onKillSession: vi.fn(),
        onRenameSession: vi.fn(),
        getSessionSettings: vi.fn(() => ({
          fontSize: 16,
          fontFamily: FONT_FAMILY_OPTIONS[2]!,
          lineHeight: 1.3,
          themeId: THEMES[1]!.id
        })),
        onSessionFontSizeChange: vi.fn(),
        onSessionFontFamilyChange: vi.fn(),
        onSessionLineHeightChange: vi.fn(),
        onSessionThemeChange: vi.fn(),
        activeConfigSessionName: "build",
        onOpenSessionConfig: vi.fn(),
        onCloseSessionConfig: vi.fn(),
        draftSessionName: "",
        onDraftChange: vi.fn(),
        themes: THEMES,
        activeThemeId: THEMES[0]!.id,
        onThemeChange: vi.fn()
      }
    );

    const fontInput = root.querySelector<HTMLInputElement>(
      "input[name='fontSize-build']"
    )!;
    const lineHeightInput = root.querySelector<HTMLInputElement>(
      "input[name='lineHeight-build']"
    )!;

    fontInput.focus();
    const fontWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100
    });
    fontInput.dispatchEvent(fontWheel);

    lineHeightInput.focus();
    const lineHeightWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -100
    });
    lineHeightInput.dispatchEvent(lineHeightWheel);

    expect(fontWheel.defaultPrevented).toBe(true);
    expect(lineHeightWheel.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(lineHeightInput);

    root.remove();
  });
});
