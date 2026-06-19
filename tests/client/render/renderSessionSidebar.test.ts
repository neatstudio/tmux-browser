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
    expect(root.textContent).not.toContain("Dashboard");
    expect(root.textContent).toContain("Kanban");
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

  it("opens kanban and sessions through callbacks", () => {
    const root = document.createElement("div");
    const onOpenDashboard = vi.fn();
    const onOpenKanban = vi.fn();
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
        onOpenKanban,
        onOpenSession,
        onTogglePinned,
        onRefresh,
        onToggleCollapsed: vi.fn()
      }
    );

    expect(
      root.querySelector<HTMLButtonElement>("[data-action='open-dashboard']")
    ).toBeNull();
    root.querySelector<HTMLButtonElement>("[data-action='open-kanban']")?.click();
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

    expect(onOpenDashboard).not.toHaveBeenCalled();
    expect(onOpenKanban).toHaveBeenCalledTimes(1);
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

  it("marks the kanban entry active while the kanban view is open", () => {
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
        activeView: "kanban",
        collapsed: false,
        draftSessionName: "",
        browserTabs: [],
        pinnedSessionNames: new Set(),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenKanban: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    expect(
      root
        .querySelector<HTMLButtonElement>("[data-action='open-kanban']")
        ?.classList.contains("is-active")
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='open-dashboard']")
    ).toBeNull();
  });

  it("shows compact kanban board shortcuts in the sidebar", () => {
    const root = document.createElement("div");
    const onOpenKanbanProject = vi.fn();
    const onOpenSession = vi.fn();

    renderSessionSidebar(
      root,
      {
        sessions: [
          BASE_SESSION,
          { ...BASE_SESSION, name: "xxvisa-pm" },
          { ...BASE_SESSION, name: "xxvisa-review" },
          { ...BASE_SESSION, name: "xxvisa-claude" }
        ],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: "xxvisa-pm",
        activeView: "dashboard",
        collapsed: false,
        draftSessionName: "",
        browserTabs: [],
        pinnedSessionNames: new Set(),
        kanbanProjects: [
          {
            name: "xxvisa",
            path: "~/server/wwwroot/app/xxvisa-v2",
            server: null,
            agents: [
              { kind: "pm", name: "pm", command: null, sessionName: "xxvisa-pm" },
              {
                kind: "review",
                name: "review",
                command: null,
                sessionName: "xxvisa-review"
              },
              {
                kind: "claude",
                name: "claude",
                command: null
              }
            ]
          }
        ],
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenKanban: vi.fn(),
        onOpenKanbanProject,
        onOpenSession,
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    const projectButton = root.querySelector<HTMLButtonElement>(
      "[data-action='open-kanban-project'][data-project-name='xxvisa']"
    );

    expect(root.querySelector(".session-sidebar-kanban-projects")).not.toBeNull();
    expect(projectButton?.textContent).toContain("xxvisa");
    expect(projectButton?.textContent).toContain("3");

    const sessionButtons = [
      ...root.querySelectorAll<HTMLButtonElement>(
        "[data-action='open-kanban-session'][data-project-name='xxvisa']"
      )
    ];

    expect(sessionButtons.map((button) => button.dataset.sessionName)).toEqual([
      "xxvisa-pm",
      "xxvisa-review",
      "xxvisa-claude"
    ]);
    expect(sessionButtons.map((button) => button.textContent)).toEqual([
      "pm",
      "review",
      "claude"
    ]);
    expect(sessionButtons[0]?.classList.contains("is-active")).toBe(true);
    expect(sessionButtons[0]?.getAttribute("aria-current")).toBe("true");

    projectButton?.click();
    sessionButtons[1]?.click();

    expect(onOpenKanbanProject).toHaveBeenCalledWith("xxvisa");
    expect(onOpenSession).toHaveBeenCalledWith("xxvisa-review");
  });

  it("shows pending actions as a compact header badge", () => {
    const root = document.createElement("div");
    const onToggleActionCenter = vi.fn();

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
        actionCount: 2,
        actionCenterOpen: false,
        onToggleActionCenter,
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    const actionButton = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-action-center']"
    );

    expect(actionButton).not.toBeNull();
    expect(actionButton?.textContent).toBe("!2");
    expect(actionButton?.getAttribute("aria-pressed")).toBe("false");
    expect(
      root
        .querySelector(".session-sidebar-header")
        ?.contains(actionButton as HTMLButtonElement)
    ).toBe(true);

    actionButton?.click();

    expect(onToggleActionCenter).toHaveBeenCalledOnce();
  });

  it("hides the action center entry when there are no pending actions", () => {
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
        actionCount: 0,
        actionCenterOpen: false,
        onToggleActionCenter: vi.fn(),
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
      root.querySelector<HTMLButtonElement>("[data-action='toggle-action-center']")
    ).toBeNull();
  });

  it("keeps the pending action badge visible while collapsed", () => {
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
        collapsed: true,
        draftSessionName: "",
        browserTabs: [],
        pinnedSessionNames: new Set(),
        actionCount: 3,
        actionCenterOpen: true,
        onToggleActionCenter: vi.fn(),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    const actionButton = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-action-center']"
    );

    expect(actionButton?.textContent).toBe("!3");
    expect(actionButton?.getAttribute("aria-pressed")).toBe("true");
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

  it("moves muted sessions to a bottom group with a group refresh action", () => {
    const root = document.createElement("div");
    const onRefreshMuted = vi.fn();
    const onToggleMuted = vi.fn();

    renderSessionSidebar(
      root,
      {
        sessions: [
          { ...BASE_SESSION, name: "build" },
          { ...BASE_SESSION, name: "tmux-ui" }
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
        mutedSessionNames: new Set(["tmux-ui"]),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onToggleMuted,
        onRefresh: vi.fn(),
        onRefreshMuted,
        onToggleCollapsed: vi.fn()
      }
    );

    const groups = [
      ...root.querySelectorAll<HTMLElement>(".session-sidebar-group")
    ];
    const items = [...root.querySelectorAll<HTMLButtonElement>(".session-sidebar-item")];

    expect(groups.map((group) => group.dataset.group)).toEqual([
      "pinned",
      "muted"
    ]);
    expect(items.map((item) => item.dataset.sessionName)).toEqual([
      "build",
      "tmux-ui"
    ]);
    expect(items[1]?.classList.contains("is-muted")).toBe(true);
    expect(items[1]?.textContent).toContain("MUTE");
    expect(
      items[1]
        ?.querySelector<HTMLButtonElement>("[data-action='toggle-sidebar-muted']")
        ?.getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      groups[1]
        ?.querySelector<HTMLButtonElement>("[data-action='refresh-muted-sessions']")
        ?.textContent
    ).toBe("↻");

    groups[1]
      ?.querySelector<HTMLButtonElement>("[data-action='refresh-muted-sessions']")
      ?.click();
    items[1]
      ?.querySelector<HTMLButtonElement>("[data-action='toggle-sidebar-muted']")
      ?.click();

    expect(onRefreshMuted).toHaveBeenCalledOnce();
    expect(onToggleMuted).toHaveBeenCalledWith("tmux-ui");
  });

  it("hides sessions that belong to kanban projects", () => {
    const root = document.createElement("div");

    renderSessionSidebar(
      root,
      {
        sessions: [
          { ...BASE_SESSION, name: "xxvisa-codex" },
          { ...BASE_SESSION, name: "regular" }
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
        pinnedSessionNames: new Set(),
        hiddenSessionNames: new Set(["xxvisa-codex"]),
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenKanban: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    expect(root.querySelector("[data-session-name='xxvisa-codex']")).toBeNull();
    expect(root.querySelector("[data-session-name='regular']")).not.toBeNull();
    expect(root.textContent).toContain("1 sessions");
  });

  it("can collapse to clean compact icon-style session entries", () => {
    const root = document.createElement("div");
    const onToggleCollapsed = vi.fn();

    renderSessionSidebar(
      root,
      {
        sessions: [{ ...BASE_SESSION, name: "codex-runner" }],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: "codex-runner",
        collapsed: true,
        draftSessionName: "",
        browserTabs: [{ sessionName: "codex-runner", active: true }],
        pinnedSessionNames: new Set(),
        mutedSessionNames: new Set(["codex-runner"]),
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
      root.querySelector<HTMLElement>(
        "[data-session-name='codex-runner'] .session-sidebar-icon"
      )
        ?.textContent
    ).toBe("co");
    expect(
      root.querySelector<HTMLElement>(
        "[data-session-name='codex-runner'] .session-sidebar-name"
      )?.textContent
    ).toBe("codex-runner");
    expect(
      root.querySelector<HTMLElement>(
        "[data-session-name='codex-runner'] .session-sidebar-badges"
      )?.dataset.collapsedHidden
    ).toBe("true");
    expect(
      root.querySelector<HTMLButtonElement>(
        "[data-session-name='codex-runner'] [data-action='toggle-sidebar-pin']"
      )?.dataset.collapsedHidden
    ).toBe("true");
    expect(
      root.querySelector<HTMLButtonElement>(
        "[data-session-name='codex-runner'] [data-action='toggle-sidebar-muted']"
      )?.dataset.collapsedHidden
    ).toBe("true");

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
        onToggleMuted: vi.fn(),
        onRefresh,
        onToggleCollapsed
      }
    );

    root.querySelector<HTMLButtonElement>("[data-action='refresh-sidebar']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='new-sidebar-session']")?.click();

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("renders a mobile launcher with logo and session count", () => {
    const root = document.createElement("div");
    const onToggleCollapsed = vi.fn();

    renderSessionSidebar(
      root,
      {
        sessions: [BASE_SESSION, { ...BASE_SESSION, name: "worker" }],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: null,
        draftSessionName: "",
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed
      }
    );

    const launcher = root.querySelector<HTMLButtonElement>(
      "[data-action='open-mobile-sidebar']"
    )!;

    expect(launcher).not.toBeNull();
    expect(root.querySelector(".mobile-sidebar-logo")?.textContent).toBe("T");
    expect(root.querySelector(".mobile-sidebar-count")?.textContent).toBe("2");

    launcher.click();

    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("keeps full session names available when the mobile drawer is rendered collapsed", () => {
    const root = document.createElement("div");

    renderSessionSidebar(
      root,
      {
        sessions: [{ ...BASE_SESSION, name: "long-mobile-session" }],
        serverStatus: null,
        loading: false,
        error: null
      },
      {
        activeSessionName: null,
        collapsed: true,
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

    const item = root.querySelector<HTMLElement>(
      "[data-session-name='long-mobile-session']"
    );

    expect(
      item?.querySelector<HTMLElement>(".session-sidebar-name")?.textContent
    ).toBe("long-mobile-session");
    expect(
      item?.querySelector<HTMLElement>(".session-sidebar-icon")?.textContent
    ).toBe("lo");
    expect(item?.getAttribute("aria-label")).toContain("long-mobile-session");
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

  it("shows recent timeline events without terminal preview output", () => {
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
        timelineEvents: [
          {
            id: "evt-1",
            type: "command-sent",
            sessionName: "api",
            message: "sent command: npm test",
            createdAt: "2026-05-24T03:00:00.000Z"
          }
        ],
        onCreateSession: vi.fn(),
        onDraftChange: vi.fn(),
        onOpenDashboard: vi.fn(),
        onOpenSession: vi.fn(),
        onTogglePinned: vi.fn(),
        onRefresh: vi.fn(),
        onToggleCollapsed: vi.fn()
      }
    );

    const timeline = root.querySelector<HTMLElement>(".session-sidebar-timeline");

    expect(timeline).not.toBeNull();
    expect(timeline?.textContent).toContain("Timeline");
    expect(timeline?.textContent).toContain("api");
    expect(timeline?.textContent).toContain("sent command: npm test");
    expect(timeline?.textContent).not.toContain("heavy preview output");
  });
});
