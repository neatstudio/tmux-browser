// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderSessionFloatingMenu
} from "../../../src/client/render/sessionFloatingMenu";

describe("sessionFloatingMenu", () => {
  it("marks saved non-live board sessions offline and does not open them", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "cc1-remote",
      sessions: ["cc1-remote"],
      sessionSummaries: [
        {
          name: "cc1-remote",
          windows: 1,
          status: "detached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "zsh",
          currentPath: "~",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        }
      ],
      boards: [
        {
          name: "cc",
          sessions: [
            { name: "cc1-local", label: "cc1-local", live: false },
            { name: "cc1-remote", label: "cc1-remote", live: true }
          ]
        }
      ],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession,
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root.querySelector<HTMLButtonElement>(".session-floating-menu-toggle")?.click();
    const offline = root.querySelector<HTMLButtonElement>(
      "[data-session-name='cc1-local']"
    )!;

    expect(offline.disabled).toBe(true);
    expect(offline.classList.contains("is-offline")).toBe(true);

    offline.click();

    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it("opens a compact top-right menu without sidebar-only controls", () => {
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
    const onSendSoftKey = vi.fn();

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
      onSendSoftKey,
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
    const topLevelActions = root.querySelector<HTMLButtonElement>(
      ".session-floating-menu > [data-action='toggle-mobile-status-actions']"
    );

    expect(toggle).not.toBeNull();
    expect(topLevelActions).toBeNull();
    expect(
      root.querySelectorAll(".session-floating-menu > button")
    ).toHaveLength(1);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".session-floating-menu-panel")).toBeNull();

    toggle.click();

    const panel = root.querySelector<HTMLElement>(".session-floating-menu-panel")!;
    const actions = [
      ...panel.querySelectorAll<HTMLButtonElement>("[data-action]")
    ].map((button) => button.dataset.action);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.textContent).toContain("xxvisa");
    const actionsPane = panel.querySelector(".session-floating-menu-actions-pane");
    const sessionsPane = panel.querySelector(".session-floating-menu-sessions-pane");

    expect(actionsPane).not.toBeNull();
    expect(sessionsPane).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='send-command']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='soft-key-ctrl-c']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='soft-key-tab']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='soft-key-shift-enter']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='soft-key-up']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='soft-key-down']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='soft-key-left']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-action='soft-key-right']")).not.toBeNull();
    expect(actionsPane?.querySelector("[data-session-name]")).toBeNull();
    expect(sessionsPane?.querySelector("[data-session-name='xxvisa-pm']")).not.toBeNull();
    expect(sessionsPane?.querySelector("[data-action='soft-key-ctrl-c']")).toBeNull();
    expect(sessionsPane?.querySelector("[data-action='send-command']")).toBeNull();
    expect(
      [
        ...actionsPane!.querySelectorAll<HTMLButtonElement>(
          ".session-floating-menu-actions [data-action]"
        )
      ].map((button) => button.textContent?.trim())
    ).toEqual([
      "Groups",
      "Grp",
      "New group",
      "Cmd",
      "Tsk",
      "Msg",
      "Rec",
      "Img",
      "Pic",
      "Cam",
      "Kill",
      "Sync",
      "Cfg",
      "Ren"
    ]);
    expect(actionsPane?.textContent).not.toContain("Config");
    expect(actionsPane?.textContent).not.toContain("Rename");
    expect(actionsPane?.textContent).not.toContain("Refresh");
    expect(actionsPane?.textContent).toContain("^C");
    expect(actionsPane?.textContent).toContain("S↵");
    expect(actionsPane?.textContent).toContain("M-B");
    expect(actionsPane?.textContent).not.toContain("Ctrl-C");
    expect(actionsPane?.textContent).not.toContain("Alt-B");
    expect(actions).not.toContain("open-dashboard");
    expect(actions).toContain("open-kanban");
    expect(actions).toContain("open-session");
    expect(actions).toContain("config-session");
    expect(actions).toContain("rename-session");
    expect(actions).toContain("send-command");
    expect(actions).toContain("soft-key-esc");
    expect(actions).toContain("soft-key-tab");
    expect(actions).toContain("soft-key-shift-enter");
    expect(actions).toContain("soft-key-ctrl-c");
    expect(actions).toContain("soft-key-ctrl-l");
    expect(actions).toContain("soft-key-left");
    expect(actions).toContain("soft-key-up");
    expect(actions).toContain("soft-key-down");
    expect(actions).toContain("soft-key-right");
    expect(actions).not.toContain("toggle-mobile-status-actions");
    expect(actions).toContain("open-current-session-groups");
    expect(actions).toContain("open-group-task");
    expect(actions).toContain("open-group-messages");
    expect(actions).toContain("reconnect-session");
    expect(actions).toContain("preview-image");
    expect(actions).toContain("choose-image");
    expect(actions).toContain("capture-image");
    expect(actions).toContain("kill-session");
    expect(actions).toContain("refresh-sessions");
    expect(actions).toContain("toggle-action-center");
    expect(actions).not.toContain("toggle-session-pinned");
    expect(actions).not.toContain("toggle-session-muted");
    expect(actions).not.toContain("toggle-floating-session-pinned");
    expect(actions).not.toContain("toggle-floating-session-muted");
    expect(actions).not.toContain("refresh-muted-sessions");
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
    expect(panel.textContent).not.toContain("Timeline");
    expect(panel.textContent).not.toContain("sent command: npm test");
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
    expect(
      panel
        .querySelector<HTMLButtonElement>("[data-session-name='xxvisa-pm']")
        ?.classList.contains("is-name-only")
    ).toBe(false);

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
    root.querySelector<HTMLButtonElement>("[data-action='soft-key-ctrl-c']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='soft-key-tab']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='soft-key-shift-enter']")?.click();
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
    root.querySelector<HTMLButtonElement>("[data-action='toggle-action-center']")?.click();
    toggle.click();
    root
      .querySelector<HTMLButtonElement>(
        "[data-project-name='local'][data-session-name='build']"
      )
      ?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='open-kanban']")?.click();

    expect(onOpenDashboard).not.toHaveBeenCalled();
    expect(onOpenSession).toHaveBeenCalledWith("xxvisa-review");
    expect(onConfig).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledOnce();
    expect(onSendCommand).toHaveBeenCalledOnce();
    expect(onSendSoftKey).toHaveBeenNthCalledWith(1, "\x03");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(2, "\t");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(3, "\x1b[13;2u");
    expect(onOpenGroupTask).toHaveBeenCalledOnce();
    expect(onOpenGroupMessages).toHaveBeenCalledOnce();
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(onPreviewImage).toHaveBeenCalledOnce();
    expect(onChooseImage).toHaveBeenCalledOnce();
    expect(onCaptureImage).toHaveBeenCalledOnce();
    expect(onKill).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onToggleActionCenter).toHaveBeenCalledOnce();
    expect(onOpenSession).toHaveBeenCalledWith("build");
    expect(onOpenKanbanProject).not.toHaveBeenCalled();
    expect(onRefreshMuted).not.toHaveBeenCalled();
    expect(onTogglePinned).not.toHaveBeenCalled();
    expect(onToggleMuted).not.toHaveBeenCalled();
    expect(onOpenKanban).toHaveBeenCalledOnce();
  });

  it("shows a highlighted action entry when pending actions exist", () => {
    const root = document.createElement("div");
    const onToggleActionCenter = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "hooks",
      sessions: ["hooks"],
      actionCount: 2,
      actionCenterOpen: false,
      onToggleActionCenter,
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>("[data-action='toggle-session-floating-menu']")
      ?.click();
    const actionButton = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-action-center']"
    );

    expect(actionButton).not.toBeNull();
    expect(actionButton?.textContent).toBe("!2");
    expect(actionButton?.classList.contains("is-attention")).toBe(true);

    actionButton?.click();

    expect(onToggleActionCenter).toHaveBeenCalledOnce();
  });

  it("keeps the action entry visible on mobile alongside groups", () => {
    const root = document.createElement("div");

    renderSessionFloatingMenu(root, {
      currentSessionName: "hooks",
      sessions: ["hooks"],
      actionCount: 1,
      actionCenterOpen: false,
      uiTier: "phone",
      kanbanProject: {
        name: "local",
        sessions: [{ name: "hooks", label: "hooks" }]
      },
      onToggleActionCenter: vi.fn(),
      onMoveKanbanSession: vi.fn(),
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>("[data-action='toggle-session-floating-menu']")
      ?.click();

    expect(root.querySelector("[data-action='switch-groups']")).not.toBeNull();
    expect(root.querySelector("[data-action='toggle-action-center']")).not.toBeNull();
  });

  it("exposes current session group switching in the primary actions", () => {
    const root = document.createElement("div");
    const onMoveKanbanSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "build",
      sessions: ["build", "pm"],
      boards: [
        {
          name: "local",
          sessions: [{ name: "pm", label: "pm" }]
        },
        {
          name: "xxvisa",
          sessions: []
        }
      ],
      kanbanProject: null,
      onMoveKanbanSession,
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>("[data-action='toggle-session-floating-menu']")
      ?.click();

    const groupsButton = root.querySelector<HTMLButtonElement>(
      ".session-floating-menu-actions [data-action='open-current-session-groups']"
    );

    expect(groupsButton).not.toBeNull();

    groupsButton?.click();

    const moveButton = root.querySelector<HTMLButtonElement>(
      ".session-floating-menu-session-actions [data-action='add-session-to-project'][data-project-name='xxvisa']"
    );

    expect(moveButton).not.toBeNull();

    moveButton?.click();

    expect(onMoveKanbanSession).toHaveBeenCalledWith(null, "xxvisa", "build");
  });

  it("marks sessions without summary metadata as name-only cards", () => {
    const root = document.createElement("div");

    renderSessionFloatingMenu(root, {
      currentSessionName: "solo",
      sessions: ["solo"],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onCreateKanbanProjectFromSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    expect(
      root
        .querySelector<HTMLButtonElement>("[data-session-name='solo']")
        ?.classList.contains("is-name-only")
    ).toBe(true);
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

  it("creates kanban projects and moves sessions from the floating menu", () => {
    const root = document.createElement("div");
    const onKanbanDraftChange = vi.fn();
    const onCreateKanbanProjectFromSession = vi.fn();
    const onAddKanbanSession = vi.fn();
    const onMoveKanbanSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "scratch",
      sessions: ["build", "scratch", "xxvisa-pm"],
      boards: [
        {
          name: "xxvisa",
          sessions: [{ name: "xxvisa-pm", label: "pm" }]
        }
      ],
      kanbanDraft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      onKanbanDraftChange,
      onCreateKanbanProjectFromSession,
      onAddKanbanSession,
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const projectPanel = root.querySelector<HTMLElement>(
      ".session-floating-menu-projects .kanban-create-panel-content"
    )!;
    const projectInput = projectPanel.querySelector<HTMLInputElement>(
      "input[name='project-name']"
    )!;
    expect(projectPanel).not.toBeNull();
    projectInput.value = "  local  ";
    projectInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onKanbanDraftChange).toHaveBeenLastCalledWith(
      {
        name: "  local  ",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      { render: false }
    );

    projectPanel.querySelector<HTMLFormElement>("form.kanban-create-form")?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    expect(onCreateKanbanProjectFromSession).toHaveBeenCalledWith(
      {
        name: "local",
        path: "~",
        server: null,
        selectedAgentNames: ["scratch"]
      },
      "scratch"
    );

    expect(onMoveKanbanSession).not.toHaveBeenCalled();
  });

  it("opens the project create form from the actions section", () => {
    const root = document.createElement("div");

    renderSessionFloatingMenu(root, {
      currentSessionName: "scratch",
      sessions: ["scratch"],
      kanbanDraft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      onKanbanDraftChange: vi.fn(),
      onCreateKanbanProject: vi.fn(),
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onCreateKanbanProjectFromSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const createButton = root.querySelector<HTMLButtonElement>(
      "[data-action='open-create-group']"
    );

    expect(createButton).not.toBeNull();

    createButton?.click();

    expect(root.querySelector(".session-floating-menu-projects .kanban-create-panel-content")).not.toBeNull();
    expect(root.querySelector(".session-floating-menu-projects .kanban-template")).not.toBeNull();
    expect(root.querySelector(".session-floating-menu-projects .kanban-template input[type='checkbox']")).not.toBeNull();
  });

  it("opens session group actions from right click and long press", () => {
    vi.useFakeTimers();

    const root = document.createElement("div");
    const onAddKanbanSession = vi.fn();
    const onMoveKanbanSession = vi.fn();
    const onKanbanDraftChange = vi.fn();
    const onCreateKanbanProject = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "scratch",
      sessions: ["build", "scratch", "xxvisa-pm"],
      boards: [
        {
          name: "xxvisa",
          sessions: [{ name: "xxvisa-pm", label: "pm" }]
        }
      ],
      kanbanDraft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      onKanbanDraftChange,
      onCreateKanbanProject,
      onAddKanbanSession,
      onMoveKanbanSession,
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const buildButton = root.querySelector<HTMLButtonElement>(
      "[data-session-name='build']"
    )!;
    buildButton.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );

    const contextMenu = root.querySelector<HTMLElement>(
      ".session-floating-menu-session-actions"
    )!;

    expect(contextMenu).not.toBeNull();
    expect(contextMenu.dataset.sessionName).toBe("build");
    contextMenu
      .querySelector<HTMLButtonElement>(
        "[data-action='add-session-to-project'][data-project-name='xxvisa']"
      )
      ?.click();

    expect(onAddKanbanSession).not.toHaveBeenCalled();
    expect(onMoveKanbanSession).toHaveBeenCalledWith(null, "xxvisa", "build");

    const scratchButton = root.querySelector<HTMLButtonElement>(
      ".session-floating-menu-session[data-session-name='scratch']"
    )!;
    scratchButton.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch"
      })
    );
    vi.advanceTimersByTime(650);

    expect(
      root.querySelector<HTMLElement>(
        ".session-floating-menu-session-actions[data-session-name='scratch']"
      )
    ).not.toBeNull();

    vi.useRealTimers();
  });

  it("moves the grouped session that was right-clicked instead of the active one", () => {
    const root = document.createElement("div");
    const onMoveKanbanSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "scratch",
      sessions: ["build", "scratch"],
      boards: [
        {
          name: "xxvisa",
          sessions: [{ name: "build", label: "build" }]
        },
        {
          name: "local",
          sessions: [{ name: "scratch", label: "scratch" }]
        }
      ],
      kanbanProject: {
        name: "local",
        sessions: [{ name: "scratch", label: "scratch" }]
      },
      onMoveKanbanSession,
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    root
      .querySelector<HTMLButtonElement>(
        "[data-session-name='build'][data-project-name='xxvisa']"
      )
      ?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      );

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='add-session-to-project'][data-project-name='local']"
      )
      ?.click();

    expect(onMoveKanbanSession).toHaveBeenCalledWith("xxvisa", "local", "build");
  });

  it("moves the right-clicked session to another project from the menu", () => {
    const root = document.createElement("div");
    const onMoveKanbanSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "scratch",
      sessions: ["build", "scratch"],
      boards: [
        {
          name: "xxvisa",
          sessions: [{ name: "build", label: "build" }]
        },
        {
          name: "local",
          sessions: [{ name: "scratch", label: "scratch" }]
        }
      ],
      kanbanProject: {
        name: "local",
        sessions: [{ name: "scratch", label: "scratch" }]
      },
      onMoveKanbanSession,
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    root
      .querySelector<HTMLButtonElement>(
        "[data-session-name='build'][data-project-name='xxvisa']"
      )
      ?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      );

    root
      .querySelector<HTMLButtonElement>(
        ".session-floating-menu-session-actions [data-action='add-session-to-project'][data-project-name='local']"
      )
      ?.click();

    expect(onMoveKanbanSession).toHaveBeenCalledWith("xxvisa", "local", "build");
  });

  it("moves an ungrouped session from null instead of the current board", () => {
    const root = document.createElement("div");
    const onMoveKanbanSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "scratch",
      sessions: ["build", "scratch"],
      boards: [
        {
          name: "local",
          sessions: [{ name: "scratch", label: "scratch" }]
        }
      ],
      kanbanProject: {
        name: "local",
        sessions: [{ name: "scratch", label: "scratch" }]
      },
      onMoveKanbanSession,
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    root
      .querySelector<HTMLButtonElement>(
        "[data-session-name='build']"
      )
      ?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      );

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='add-session-to-project'][data-project-name='local']"
      )
      ?.click();

    expect(onMoveKanbanSession).toHaveBeenCalledWith(null, "local", "build");
  });

  it("uses the mobile groups control to open the current kanban view", () => {
    const root = document.createElement("div");
    const onMoveKanbanSession = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "build",
      sessions: ["build"],
      kanbanProject: {
        name: "xxvisa",
        sessions: [{ name: "build", label: "build" }]
      },
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onMoveKanbanSession,
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      uiTier: "phone"
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    root.querySelector<HTMLButtonElement>("[data-action='switch-groups']")?.click();

    expect(onMoveKanbanSession).toHaveBeenCalledWith("xxvisa", "xxvisa", "build");
  });

  it("closes a session action menu when the floating panel closes", () => {
    const root = document.createElement("div");

    renderSessionFloatingMenu(root, {
      currentSessionName: "scratch",
      sessions: ["build", "scratch", "xxvisa-pm"],
      boards: [
        {
          name: "xxvisa",
          sessions: [{ name: "xxvisa-pm", label: "pm" }]
        }
      ],
      kanbanDraft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      onKanbanDraftChange: vi.fn(),
      onCreateKanbanProject: vi.fn(),
      onAddKanbanSession: vi.fn(),
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn()
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const buildButton = root.querySelector<HTMLButtonElement>(
      "[data-session-name='build']"
    )!;
    buildButton.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );

    expect(
      root.querySelector(".session-floating-menu-session-actions")
    ).not.toBeNull();

    document.body.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true })
    );

    expect(root.querySelector(".session-floating-menu-panel")).toBeNull();
    expect(root.querySelector(".session-floating-menu-session-actions")).toBeNull();
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

  it("hides pin and mute controls for kanban sessions while keeping other actions", () => {
    const root = document.createElement("div");
    const onTogglePinned = vi.fn();
    const onToggleMuted = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "kanban-pm",
      sessions: ["kanban-pm", "kanban-review"],
      kanbanProject: {
        name: "kanban",
        sessions: [
          { name: "kanban-pm", label: "pm" },
          { name: "kanban-review", label: "review" }
        ]
      },
      boards: [
        {
          name: "kanban",
          sessions: [
            { name: "kanban-pm", label: "pm" },
            { name: "kanban-review", label: "review" }
          ]
        }
      ],
      onOpenDashboard: vi.fn(),
      onOpenKanban: vi.fn(),
      onOpenSession: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onSendCommand: vi.fn(),
      onRefresh: vi.fn(),
      onCreateSession: vi.fn(),
      onTogglePinned,
      onToggleMuted,
      onToggleActionCenter: vi.fn(),
      hideSessionControls: true
    });

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-session-floating-menu']"
      )
      ?.click();

    const panel = root.querySelector<HTMLElement>(".session-floating-menu-panel")!;
    const actions = [
      ...panel.querySelectorAll<HTMLButtonElement>("[data-action]")
    ].map((button) => button.dataset.action);

    expect(actions).toContain("open-kanban");
    expect(actions).toContain("send-command");
    expect(actions).toContain("config-session");
    expect(actions).toContain("rename-session");
    expect(actions).not.toContain("toggle-session-pinned");
    expect(actions).not.toContain("toggle-session-muted");
    expect(actions).not.toContain("toggle-floating-session-pinned");
    expect(actions).not.toContain("toggle-floating-session-muted");
    expect(onTogglePinned).not.toHaveBeenCalled();
    expect(onToggleMuted).not.toHaveBeenCalled();
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
      root.querySelector<HTMLButtonElement>("[data-action='open-current-session-groups']")
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

  it("falls back when a focused session button disappears after an open-menu re-render", () => {
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

    const sessionButton = root.querySelector<HTMLButtonElement>(
      "[data-action='open-session'][data-session-name='logs']"
    )!;
    sessionButton.focus();

    renderSessionFloatingMenu(root, {
      ...baseState,
      sessions: ["build"]
    });

    expect(document.activeElement).toBe(
      root.querySelector<HTMLButtonElement>("[data-action='open-current-session-groups']")
    );

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
        "[data-action='open-session'][data-session-name='logs']"
      )
      ?.focus();

    renderSessionFloatingMenu(root, {
      ...baseState,
      sessions: ["build"]
    });

    expect(document.activeElement).toBe(
      root.querySelector<HTMLButtonElement>("[data-action='open-current-session-groups']")
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
