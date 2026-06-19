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
    const onTogglePinned = vi.fn();
    const onToggleMuted = vi.fn();
    const onToggleActionCenter = vi.fn();
    const onOpenKanbanProject = vi.fn();

    renderSessionFloatingMenu(root, {
      currentSessionName: "xxvisa-pm",
      sessions: ["xxvisa-pm", "xxvisa-review", "build"],
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
      onRefresh,
      onCreateSession,
      actionCount: 3,
      actionCenterOpen: false,
      isPinned: true,
      isMuted: false,
      onTogglePinned,
      onToggleMuted,
      onToggleActionCenter,
      onOpenKanbanProject
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
    expect(actions).toContain("refresh-sessions");
    expect(actions).toContain("toggle-session-pinned");
    expect(actions).toContain("toggle-session-muted");
    expect(actions).toContain("toggle-action-center");
    expect(actions).toContain("open-kanban-project");
    expect(
      [
        ...panel.querySelectorAll<HTMLElement>(".session-floating-menu-board")
      ].map((button) => button.dataset.projectName)
    ).toEqual(["xxvisa", "local"]);
    expect(
      panel
        .querySelector<HTMLButtonElement>("[data-session-name='xxvisa-pm']")
        ?.textContent
    ).toContain("~/server/wwwroot/app/xxvisa-v2");
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
    root.querySelector<HTMLButtonElement>("[data-action='refresh-sessions']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='toggle-session-pinned']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='toggle-session-muted']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='toggle-action-center']")?.click();
    toggle.click();
    root
      .querySelector<HTMLButtonElement>("[data-project-name='local']")
      ?.click();
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
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onTogglePinned).toHaveBeenCalledOnce();
    expect(onTogglePinned).toHaveBeenCalledWith("xxvisa-pm");
    expect(onToggleMuted).toHaveBeenCalledOnce();
    expect(onToggleMuted).toHaveBeenCalledWith("xxvisa-pm");
    expect(onToggleActionCenter).toHaveBeenCalledOnce();
    expect(onOpenKanbanProject).toHaveBeenCalledWith("local");
    expect(onOpenSession).toHaveBeenCalledWith("build");
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
});
