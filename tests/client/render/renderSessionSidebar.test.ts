// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderSessionSidebar } from "../../../src/client/render/renderSessionSidebar";
import type { SessionSummary } from "../../../src/client/api/sessionApi";

const BASE_SESSION: SessionSummary = {
  name: "api",
  windows: 1,
  status: "detached",
  lastActivityAt: 1_778_000_000,
  paneCount: 2,
  activeWindowName: "zsh",
  currentCommand: "zsh",
  currentPath: "/Users/gouki/server/wwwroot/gemm4",
  gitBranch: "main",
  gitDirty: true,
  paneDead: false,
  paneDeadStatus: null,
  preview: "heavy preview output should stay out of the sidebar",
  inputPrompt: null
};

describe("renderSessionSidebar", () => {
  it("renders lightweight session metadata without preview output", () => {
    const root = document.createElement("div");

    renderSessionSidebar(
      root,
      {
        sessions: [
          BASE_SESSION,
          {
            ...BASE_SESSION,
            name: "codex",
            status: "attached",
            paneCount: 1,
            inputPrompt: {
              snippet: "Yes, proceed?",
              actions: [{ key: "y", label: "Yes", input: "y" }]
            }
          }
        ],
        serverStatus: {
          platform: "darwin",
          cpuCount: 10,
          loadAverage: [1, 1, 1],
          loadPercent: 10,
          memoryTotalBytes: 100,
          memoryFreeBytes: 50,
          memoryUsedPercent: 50,
          uptimeSeconds: 60,
          homeDirectory: "/Users/gouki"
        },
        loading: false,
        error: null
      },
      {
        activeSessionName: "codex",
        collapsed: false,
        draftSessionName: "",
        browserTabs: [{ sessionName: "codex", active: true }],
        pinnedSessionNames: new Set(),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    expect(root.querySelector(".session-sidebar")).not.toBeNull();
    expect(root.textContent).toContain("Dashboard");
    expect(root.textContent).toContain("api");
    expect(root.textContent).toContain("1w 2p");
    expect(root.textContent).toContain("~/server/wwwroot/gemm4");
    expect(root.textContent).toContain("WAIT");
    expect(root.textContent).not.toContain("heavy preview output");
    expect(
      root.querySelector<HTMLButtonElement>(
        ".session-sidebar-item.is-active[data-session-name='codex']"
      )
    ).not.toBeNull();
  });

  it("opens dashboard and sessions through callbacks", () => {
    const root = document.createElement("div");
    const onOpenDashboard = vi.fn();
    const onOpenSession = vi.fn();
    const onRefresh = vi.fn();
    const onCreateSession = vi.fn();
    const onDraftChange = vi.fn();
    const onTogglePinned = vi.fn();

    renderSessionSidebar(
      root,
      {
        sessions: [BASE_SESSION],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: null,
        collapsed: false,
        draftSessionName: "demo",
        browserTabs: [],
        pinnedSessionNames: new Set(),
        onCreateSession,
        onDraftChange,
        onOpenDashboard,
        onOpenSession,
        onTogglePinned,
        onRefresh,
        onToggleCollapsed: vi.fn()
      }
    );

    root.querySelector<HTMLButtonElement>("[data-action='open-dashboard']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='refresh-sidebar']")?.click();
    root.querySelector<HTMLInputElement>("input[name='sidebar-session-name']")!.value =
      "logs";
    root
      .querySelector<HTMLInputElement>("input[name='sidebar-session-name']")!
      .dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLFormElement>(".session-sidebar-create-form")?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    root
      .querySelector<HTMLButtonElement>("[data-action='toggle-sidebar-pin']")!
      .click();
    root.querySelector<HTMLButtonElement>("[data-session-name='api']")?.click();

    expect(onOpenDashboard).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onDraftChange).toHaveBeenCalledWith("logs");
    expect(onCreateSession).toHaveBeenCalledWith("logs");
    expect(onTogglePinned).toHaveBeenCalledWith("api");
    expect(onOpenSession).toHaveBeenCalledWith("api");
    expect(
      root
        .querySelector<HTMLButtonElement>("[data-action='refresh-sidebar']")
        ?.getAttribute("aria-label")
    ).toBe("Refresh sessions");
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='refresh-sidebar']")
        ?.textContent
    ).toBe("↻");
  });

  it("separates pinned sessions from regular sessions and marks them", () => {
    const root = document.createElement("div");

    renderSessionSidebar(
      root,
      {
        sessions: [
          { ...BASE_SESSION, name: "scratch" },
          { ...BASE_SESSION, name: "build" }
        ],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: null,
        collapsed: false,
        draftSessionName: "",
        browserTabs: [],
        pinnedSessionNames: new Set(["build"]),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    const groups = [
      ...root.querySelectorAll<HTMLElement>(".session-sidebar-group")
    ];
    const items = [...root.querySelectorAll<HTMLButtonElement>(".session-sidebar-item")];

    expect(items.map((item) => item.dataset.sessionName)).toEqual([
      "build",
      "scratch"
    ]);
    expect(groups.map((group) => group.dataset.group)).toEqual([
      "pinned",
      "sessions"
    ]);
    expect(groups[0]?.textContent).toContain("Pinned");
    expect(groups[1]?.textContent).toContain("Sessions");
    expect(items[0]?.classList.contains("is-pinned")).toBe(true);
    expect(
      items[0]
        ?.querySelector<HTMLButtonElement>("[data-action='toggle-sidebar-pin']")
        ?.getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("can collapse to compact icon-style session entries", () => {
    const root = document.createElement("div");
    const onToggleCollapsed = vi.fn();

    renderSessionSidebar(
      root,
      {
        sessions: [BASE_SESSION],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: "api",
        collapsed: true,
        draftSessionName: "",
        browserTabs: [{ sessionName: "api", active: true }],
        pinnedSessionNames: new Set(),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed
      }
    );

    expect(root.querySelector(".session-sidebar.is-collapsed")).not.toBeNull();
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='toggle-sidebar']")
        ?.getAttribute("aria-expanded")
    ).toBe("false");
    expect(
      root.querySelector<HTMLElement>("[data-session-name='api'] .session-sidebar-icon")
        ?.textContent
    ).toBe("a");

    root.querySelector<HTMLButtonElement>("[data-action='toggle-sidebar']")?.click();

    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("keeps refresh and new-session controls available while collapsed", () => {
    const root = document.createElement("div");
    const onRefresh = vi.fn();
    const onToggleCollapsed = vi.fn();

    renderSessionSidebar(
      root,
      {
        sessions: [BASE_SESSION],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: "api",
        collapsed: true,
        draftSessionName: "",
        browserTabs: [],
        pinnedSessionNames: new Set(),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh,
        onToggleCollapsed
      }
    );

    root.querySelector<HTMLButtonElement>("[data-action='refresh-sidebar']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='new-sidebar-session']")?.click();

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("keeps refresh and new-session controls in the bottom toolbar", () => {
    const root = document.createElement("div");

    renderSessionSidebar(
      root,
      {
        sessions: [BASE_SESSION],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: null,
        collapsed: false,
        draftSessionName: "",
        browserTabs: [],
        pinnedSessionNames: new Set(),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    expect(
      [...root.querySelector(".session-sidebar")!.children].map((child) =>
        Array.from(child.classList).find((className) =>
          className.startsWith("session-sidebar-")
        )
      )
    ).toEqual([
      "session-sidebar-header",
      "session-sidebar-dashboard",
      "session-sidebar-list",
      "session-sidebar-toolbar"
    ]);
  });
});
