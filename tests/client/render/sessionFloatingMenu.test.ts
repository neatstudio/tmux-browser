// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderSessionFloatingMenu
} from "../../../src/client/render/sessionFloatingMenu";

describe("sessionFloatingMenu", () => {
  it("opens a compact top-right menu with sidebar-style session shortcuts", () => {
    const root = document.createElement("div");
    const onOpenDashboard = vi.fn();
    const onOpenKanban = vi.fn();
    const onOpenSession = vi.fn();
    const onConfig = vi.fn();
    const onRename = vi.fn();
    const onSendCommand = vi.fn();
    const onRefresh = vi.fn();
    const onCreateSession = vi.fn();
    const onReconnect = vi.fn();
    const onPreviewImage = vi.fn();
    const onChooseImage = vi.fn();
    const onCaptureImage = vi.fn();
    const onKill = vi.fn();
    const onTogglePinned = vi.fn();
    const onToggleMuted = vi.fn();
    const onToggleActionCenter = vi.fn();
    const onOpenKanbanProject = vi.fn();
    const onRefreshMuted = vi.fn();
    const onOpenGroupTask = vi.fn();
    const onOpenGroupMessages = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "xxvisa-pm",
      sessions: ["xxvisa-pm", "xxvisa-review", "build", "scratch"],
      sessionSummaries: [
        {
          name: "xxvisa-pm",
          windows: 1,
          status: "attached",
          lastActivityAt: Date.now() - 60_000,
          paneCount: 2,
          activeWindowName: "zsh",
          currentCommand: "codex",
          currentPath: "/Users/gouki/server/wwwroot/app/xxvisa-v2",
          gitBranch: "main",
          gitDirty: true,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        },
        {
          name: "xxvisa-review",
          windows: 1,
          status: "detached",
          lastActivityAt: Date.now() - 120_000,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "claude",
          currentPath: "/Users/gouki/server/wwwroot/app/xxvisa-v2",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        },
        {
          name: "build",
          windows: 2,
          status: "detached",
          lastActivityAt: null,
          paneCount: 3,
          activeWindowName: "logs",
          currentCommand: "npm",
          currentPath: "/tmp/build",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        },
        {
          name: "scratch",
          windows: 1,
          status: "detached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "zsh",
          currentPath: "/Users/gouki/tmp",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        }
      ],
      homeDirectory: "/Users/gouki",
      boards: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        },
        {
          name: "xxvisa",
          sessions: [
            { name: "xxvisa-pm", label: "pm" },
            { name: "xxvisa-review", label: "review" }
          ]
        }
      ],
      kanbanProject: {
        name: "xxvisa",
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" }
        ]
      },
      onOpenDashboard,
      onOpenKanban,
      onOpenSession,
      onConfig,
      onRename,
      onSendCommand,
      onReconnect,
      onPreviewImage,
      onChooseImage,
      onCaptureImage,
      onKill,
      onRefresh,
      onCreateSession,
      actionCount: 3,
      actionCenterOpen: false,
      pinnedSessionNames: new Set(["build"]),
      mutedSessionNames: new Set(["xxvisa-review"]),
      isPinned: true,
      isMuted: false,
      onTogglePinned,
      onToggleMuted,
      onToggleActionCenter,
      onOpenKanbanProject,
      onRefreshMuted,
      onOpenGroupTask,
      onOpenGroupMessages,
      timelineEvents: [
        {
          id: "event-1",
          sessionName: "xxvisa-review",
          type: "command",
          message: "sent command: npm test",
          createdAt: "2026-06-19T06:00:00.000Z"
        }
      ]
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-session-floating-menu']"
    )!;

    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".session-floating-menu-panel")).toBeNull();

    toggle.click();

    const panel = root.querySelector<HTMLElement>(".session-floating-menu-panel")!;
    const actions = [
      ...panel.querySelectorAll<HTMLButtonElement>("[data-action]")
    ].map((button) => button.dataset.action);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.textContent).toContain("xxvisa");
    expect(actions).not.toContain("open-dashboard");
    expect(actions).toContain("open-kanban");
    expect(actions).toContain("open-session");
    expect(actions).toContain("config-session");
    expect(actions).toContain("rename-session");
    expect(actions).toContain("send-command");
    expect(actions).toContain("open-group-task");
    expect(actions).toContain("open-group-messages");
    expect(actions).toContain("reconnect-session");
    expect(actions).toContain("preview-image");
    expect(actions).toContain("choose-image");
    expect(actions).toContain("capture-image");
    expect(actions).toContain("kill-session");
    expect(actions).toContain("refresh-sessions");
    expect(actions).toContain("toggle-session-pinned");
    expect(actions).toContain("toggle-session-muted");
    expect(actions).toContain("toggle-action-center");
    expect(actions).toContain("toggle-floating-session-pinned");
    expect(actions).toContain("toggle-floating-session-muted");
    expect(actions).toContain("refresh-muted-sessions");
    expect(
      [
        ...panel.querySelectorAll<HTMLElement>(".session-floating-menu-title")
      ].map((title) => title.textContent)
    ).not.toContain("Pinned");
    expect(
      [
        ...panel.querySelectorAll<HTMLElement>(".session-floating-menu-title")
      ].map((title) => title.textContent)
    ).not.toContain("Mute");
    expect(panel.textContent).toContain("Timeline");
    expect(panel.textContent).toContain("sent command: npm test");
    const sections = [
      ...panel.querySelectorAll<HTMLElement>(".session-floating-menu-section")
    ];
    const boardsSection = sections.find(
      (section) =>
        section.querySelector(".session-floating-menu-title")?.textContent ===
        "Boards"
    );
    const ungroupedSection = sections.find(
      (section) =>
        section.querySelector(".session-floating-menu-title")?.textContent ===
        "Ungrouped"
    );

    expect(
      [
        ...boardsSection!.querySelectorAll<HTMLElement>(
          ".session-floating-menu-board-label"
        )
      ].map((label) => label.dataset.projectName)
    ).toEqual(["xxvisa", "local"]);
    expect(
      [
        ...boardsSection!.querySelectorAll<HTMLFieldSetElement>(
          "fieldset.session-floating-menu-board"
        )
      ]
        .map((board) => ({
          project: board.dataset.projectName,
          legend: board.querySelector("legend")?.textContent,
          sessions: [
            ...board.querySelectorAll<HTMLButtonElement>("[data-session-name]")
          ].map((button) => button.dataset.sessionName)
        }))
    ).toEqual([
      {
        project: "xxvisa",
        legend: "xxvisa · 2",
        sessions: ["xxvisa-pm", "xxvisa-review"]
      },
      {
        project: "local",
        legend: "local · 1",
        sessions: ["build"]
      }
    ]);
    expect(
      ungroupedSection
        .querySelector<HTMLFieldSetElement>(
          "fieldset.session-floating-menu-board[data-project-name='ungrouped']"
        )
        ?.querySelector("legend")
        ?.textContent
    ).toBe("Ungrouped · 1");
    expect(
      [
        ...ungroupedSection!.querySelectorAll<HTMLButtonElement>(
          "fieldset[data-project-name='ungrouped'] [data-session-name]"
        )
      ].map((button) => button.dataset.sessionName)
    ).toEqual(["scratch"]);
    expect(
      panel.querySelector("[data-action='open-kanban-project']")
    ).toBeNull();
    expect(panel.textContent).toContain("Ungrouped");
    expect(
      panel
        .querySelector<HTMLButtonElement>("[data-session-name='xxvisa-pm']")
        ?.textContent
    ).not.toContain("~/server/wwwroot/app/xxvisa-v2");
    expect(
      panel
        .querySelector<HTMLButtonElement>("[data-session-name='xxvisa-pm']")
        ?.textContent
    ).toContain("codex");
    expect(
      panel
        .querySelector<HTMLButtonElement>("[data-session-name='xxvisa-pm']")
        ?.textContent
    ).toContain("attached");
    expect(
      panel
        .querySelector<HTMLButtonElement>("[data-session-name='xxvisa-pm']")
        ?.classList.contains("is-active")
    ).toBe(true);

    root
      .querySelector<HTMLButtonElement>("[data-session-name='xxvisa-review']")
      ?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='config-session']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='rename-session']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='send-command']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='open-group-task']")?.click();
    toggle.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='open-group-messages']")
      ?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='reconnect-session']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='preview-image']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='choose-image']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='capture-image']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='kill-session']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='refresh-sessions']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='toggle-session-pinned']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='toggle-session-muted']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='toggle-action-center']")?.click();
    toggle.click();
    root
      .querySelector<HTMLButtonElement>(
        "[data-project-name='local'][data-session-name='build']"
      )
      ?.click();
    toggle.click();
    root
      .querySelector<HTMLButtonElement>(
        "[data-action='refresh-muted-sessions']"
      )
      ?.click();
    toggle.click();
    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-floating-session-pinned'][data-target-session='build']"
      )
      ?.click();
    toggle.click();
    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-floating-session-muted'][data-target-session='build']"
      )
      ?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='open-kanban']")?.click();

    expect(onOpenDashboard).not.toHaveBeenCalled();
    expect(onOpenSession).toHaveBeenCalledWith("xxvisa-review");
    expect(onConfig).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledOnce();
    expect(onSendCommand).toHaveBeenCalledOnce();
    expect(onOpenGroupTask).toHaveBeenCalledOnce();
    expect(onOpenGroupMessages).toHaveBeenCalledOnce();
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(onPreviewImage).toHaveBeenCalledOnce();
    expect(onChooseImage).toHaveBeenCalledOnce();
    expect(onCaptureImage).toHaveBeenCalledOnce();
    expect(onKill).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onTogglePinned).toHaveBeenCalledWith("xxvisa-pm");
    expect(onToggleMuted).toHaveBeenCalledWith("xxvisa-pm");
    expect(onToggleActionCenter).toHaveBeenCalledOnce();
    expect(onOpenSession).toHaveBeenCalledWith("build");
    expect(onOpenKanbanProject).not.toHaveBeenCalled();
    expect(onRefreshMuted).toHaveBeenCalledOnce();
    expect(onTogglePinned).toHaveBeenCalledWith("build");
    expect(onToggleMuted).toHaveBeenCalledWith("build");
    expect(onTogglePinned).toHaveBeenCalledTimes(2);
    expect(onToggleMuted).toHaveBeenCalledTimes(2);
    expect(onOpenKanban).toHaveBeenCalledOnce();
  });

  it("creates a session from the floating menu without submitting blank names", () => {
    const root = document.createElement("div");
    const onCreateSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "build",
      sessions: ["build"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession,
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const form = root.querySelector<HTMLFormElement>(
      ".session-floating-menu-create"
    )!;
    const input = form.querySelector<HTMLInputElement>(
      "input[name='session-name']"
    )!;

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onCreateSession).not.toHaveBeenCalled();

    input.value = "  logs  ";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onCreateSession).toHaveBeenCalledWith("logs");
    expect(root.querySelector(".session-floating-menu-panel")).toBeNull();
  });

  it("keeps an open menu mounted across status re-renders", () => {
    const root = document.createElement("div");
    const baseState = {
      currentSessionName: "build",
      sessions: ["build"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    };

    renderSessionFloatingMenu(root, baseState);
    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    expect(root.querySelector(".session-floating-menu-panel")).not.toBeNull();

    renderSessionFloatingMenu(root, {
      ...baseState,
      sessions: ["build", "logs"],
      sessionSummaries: [
        {
          name: "logs",
          windows: 1,
          status: "detached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "tail",
          currentPath: "/tmp/logs",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        }
      ]
    });

    expect(
      root
        .querySelector<HTMLButtonElement>(
          "[data-action='toggle-session-floating-menu']"
        )
        ?.getAttribute("aria-expanded")
    ).toBe("true");
    expect(root.querySelector(".session-floating-menu-panel")).not.toBeNull();
    expect(root.textContent).toContain("logs");
  });

  it("closes with Escape or outside clicks without closing on inside clicks", () => {
    const root = document.createElement("div");
    document.body.append(root);

    renderSessionFloatingMenu(root, {
      currentSessionName: "build",
      sessions: ["build"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-session-floating-menu']"
    )!;
    toggle.click();
    expect(root.querySelector(".session-floating-menu-panel")).not.toBeNull();

    root
      .querySelector<HTMLInputElement>("input[name='session-name']")
      ?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(root.querySelector(".session-floating-menu-panel")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".session-floating-menu-panel")).toBeNull();

    toggle.click();
    expect(root.querySelector(".session-floating-menu-panel")).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".session-floating-menu-panel")).toBeNull();

    root.remove();
  });

  it("moves focus into the menu and restores it to the toggle on close", () => {
    const root = document.createElement("div");
    document.body.append(root);

    renderSessionFloatingMenu(root, {
      currentSessionName: "build",
      sessions: ["build"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-session-floating-menu']"
    )!;
    toggle.focus();
    toggle.click();

    expect(document.activeElement).toBe(
      root.querySelector<HTMLButtonElement>("[data-action='open-kanban']")
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(root.querySelector(".session-floating-menu-panel")).toBeNull();
    expect(document.activeElement).toBe(toggle);

    root.remove();
  });

  it("preserves the create-session draft while an open menu re-renders", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const baseState = {
      currentSessionName: "build",
      sessions: ["build"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    };

    renderSessionFloatingMenu(root, baseState);
    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const input = root.querySelector<HTMLInputElement>("input[name='session-name']")!;
    input.focus();
    input.value = "scratch-log";

    renderSessionFloatingMenu(root, {
      ...baseState,
      sessions: ["build", "logs"]
    });

    const rerenderedInput = root.querySelector<HTMLInputElement>(
      "input[name='session-name']"
    )!;
    expect(rerenderedInput.value).toBe("scratch-log");
    expect(document.activeElement).toBe(rerenderedInput);

    root.remove();
  });

  it("restores focused session action buttons after an open-menu re-render", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const baseState = {
      currentSessionName: "build",
      sessions: ["build", "logs"],
      pinnedSessionNames: new Set<string>(),
      mutedSessionNames: new Set<string>(),
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    };

    renderSessionFloatingMenu(root, baseState);
    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const muteButton = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-floating-session-muted'][data-target-session='logs']"
    )!;
    muteButton.focus();

    renderSessionFloatingMenu(root, {
      ...baseState,
      mutedSessionNames: new Set(["logs"])
    });

    const rerenderedMuteButton = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-floating-session-muted'][data-target-session='logs']"
    )!;
    expect(document.activeElement).toBe(rerenderedMuteButton);
    expect(rerenderedMuteButton.getAttribute("aria-pressed")).toBe("true");

    root.remove();
  });

  it("falls back to the first menu action when a focused session disappears", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const baseState = {
      currentSessionName: "build",
      sessions: ["build", "logs"],
      pinnedSessionNames: new Set<string>(),
      mutedSessionNames: new Set<string>(),
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    };

    renderSessionFloatingMenu(root, baseState);
    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-floating-session-muted'][data-target-session='logs']"
      )
      ?.focus();

    renderSessionFloatingMenu(root, {
      ...baseState,
      sessions: ["build"]
    });

    expect(document.activeElement).toBe(
      root.querySelector<HTMLButtonElement>("[data-action='open-kanban']")
    );

    root.remove();
  });

  it("registers document listeners only while the menu is open", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const state = {
      currentSessionName: "build",
      sessions: ["build"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    };

    renderSessionFloatingMenu(root, state);

    expect(addSpy.mock.calls.filter(([type]) => type === "pointerdown")).toHaveLength(0);
    expect(addSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(0);
    expect(
      addSpy.mock.calls.filter(
        ([type]) =>
          typeof type === "string" &&
          type.startsWith("tmux-ui-floating-menu-cleanup")
      )
    ).toHaveLength(0);

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    expect(addSpy.mock.calls.filter(([type]) => type === "pointerdown")).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    const removesBeforeRerender = {
      pointerdown: removeSpy.mock.calls.filter(([type]) => type === "pointerdown").length,
      keydown: removeSpy.mock.calls.filter(([type]) => type === "keydown").length
    };

    renderSessionFloatingMenu(root, {
      ...state,
      sessions: ["build", "logs"]
    });

    expect(addSpy.mock.calls.filter(([type]) => type === "pointerdown")).toHaveLength(2);
    expect(addSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(2);
    expect(
      removeSpy.mock.calls.filter(([type]) => type === "pointerdown")
    ).toHaveLength(removesBeforeRerender.pointerdown + 1);
    expect(removeSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(
      removesBeforeRerender.keydown + 1
    );
    const removesBeforeClose = {
      pointerdown: removeSpy.mock.calls.filter(([type]) => type === "pointerdown").length,
      keydown: removeSpy.mock.calls.filter(([type]) => type === "keydown").length
    };

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    expect(
      removeSpy.mock.calls.filter(([type]) => type === "pointerdown")
    ).toHaveLength(removesBeforeClose.pointerdown + 1);
    expect(removeSpy.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(
      removesBeforeClose.keydown + 1
    );

    addSpy.mockRestore();
    removeSpy.mockRestore();
    root.remove();
  });

  it("traps Tab focus within the open menu", () => {
    const root = document.createElement("div");
    document.body.append(root);

    renderSessionFloatingMenu(root, {
      currentSessionName: "build",
      sessions: ["build"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned: vi.fn(),
      onToggleMuted: vi.fn(),
      onToggleActionCenter: vi.fn(),
      onOpenKanbanProject: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const focusable = [
      ...root.querySelectorAll<HTMLElement>(
        ".session-floating-menu-panel button, .session-floating-menu-panel input"
      )
    ];
    const first = focusable[0]!;
    const last = root.querySelector<HTMLInputElement>("input[name='session-name']")!;

    last.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    expect(document.activeElement).toBe(last);

    root.remove();
  });
});
