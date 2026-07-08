// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { SessionSummary } from "../../../src/client/api/sessionApi";
import {
  formatSessionStatusBar,
  renderSessionStatusBar
} from "../../../src/client/render/sessionStatusBar";

const SESSION: SessionSummary = {
  name: "build",
  windows: 2,
  status: "attached",
  lastActivityAt: Math.floor(new Date(2026, 4, 2, 9, 5).getTime() / 1000),
  paneCount: 3,
  activeWindowName: "server",
  currentCommand: "npm",
  currentPath: "/tmp/project/app",
  gitBranch: "main",
  gitDirty: true,
  paneDead: false,
  paneDeadStatus: null,
  preview: null,
  inputPrompt: null,
  panes: [
    {
      sessionName: "build",
      paneId: "%1",
      windowIndex: 0,
      windowName: "server",
      windowActive: true,
      paneIndex: 0,
      paneActive: false,
      currentCommand: "zsh",
      currentPath: "/tmp/project/app",
      paneDead: false,
      paneDeadStatus: null,
      panePid: 100
    },
    {
      sessionName: "build",
      paneId: "%2",
      windowIndex: 0,
      windowName: "server",
      windowActive: true,
      paneIndex: 1,
      paneActive: true,
      currentCommand: "npm",
      currentPath: "/tmp/project/app",
      paneDead: false,
      paneDeadStatus: null,
      panePid: 101
    }
  ]
};

describe("sessionStatusBar", () => {
  it("formats the terminal page status bar with tmux session details", () => {
    expect(formatSessionStatusBar(SESSION)).toEqual([
      "/tmp/project/app"
    ]);
  });

  it("shortens terminal status paths under the server home directory", () => {
    expect(
      formatSessionStatusBar(
        {
          ...SESSION,
          currentPath: "/home/gouki/server/wwwroot/gemm4"
        },
        "/home/gouki"
      )
    ).toEqual(["~/server/wwwroot/gemm4"]);
  });

  it("shows failed pane state in the terminal page status bar", () => {
    expect(
      formatSessionStatusBar({
        ...SESSION,
        paneDead: true,
        paneDeadStatus: 1
      })
    ).toEqual(["/tmp/project/app"]);
  });

  it("renders a bottom status bar for a mounted terminal panel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 2, 9, 8));

    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION);

    const bar = root.querySelector<HTMLElement>(".terminal-status-bar")!;

    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain("/tmp/project/app");
    expect(bar.textContent).not.toContain("build");
    expect(bar.textContent).not.toContain("attached");
    expect(bar.textContent).not.toContain("idle 3m");
    expect(bar.querySelectorAll(".terminal-status-item")).toHaveLength(1);
    expect(bar.querySelector(".terminal-status-main")).not.toBeNull();
    expect(bar.querySelector(".terminal-status-action-group")).not.toBeNull();

    vi.useRealTimers();
  });

  it("keeps the status bar focused on the current path when clicked", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, {
      ...SESSION,
      windows: 1,
      paneCount: 1
    });

    root.querySelector<HTMLElement>(".terminal-status-bar")?.click();

    const bar = root.querySelector<HTMLElement>(".terminal-status-bar")!;

    expect(bar.textContent).toContain("/tmp/project/app");
    expect(bar.textContent).not.toContain("1 window");
    expect(bar.textContent).not.toContain("attached");
  });

  it("does not expose session name, activity, or git status in the terminal bar", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION);

    const bar = root.querySelector<HTMLElement>(".terminal-status-bar")!;
    bar.click();

    expect(bar.textContent).toContain("/tmp/project/app");
    expect(bar.textContent).not.toContain("build");
    expect(bar.textContent).not.toContain("git main dirty");
    expect(bar.textContent).not.toContain("idle");
  });

  it("runs recovery-oriented status bar actions without command shortcuts", () => {
    const root = document.createElement("div");
    const onRefresh = vi.fn();
    const onClear = vi.fn();
    const onRedraw = vi.fn();
    const onReconnect = vi.fn();
    const onConfig = vi.fn();
    const onRename = vi.fn();
    const onKill = vi.fn();
    const onSendCommand = vi.fn();
    const onSwitchSession = vi.fn();
    const onPreviewImage = vi.fn();
    const onChooseImage = vi.fn();
    const onCaptureImage = vi.fn();
    const onSplitHorizontal = vi.fn();
    const onSplitVertical = vi.fn();
    const onToggleBrowserScroll = vi.fn();
    const onScrollHistoryBack = vi.fn();
    const onScrollHistoryForward = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      onRefresh,
      onClear,
      onRedraw,
      onReconnect,
      onConfig,
      onRename,
      onKill,
      onSendCommand,
      onSwitchSession,
      onPreviewImage,
      onChooseImage,
      onCaptureImage,
      onSplitHorizontal,
      onSplitVertical,
      onToggleBrowserScroll,
      onScrollHistoryBack,
      onScrollHistoryForward
    });

    expect(root.querySelector("[data-action='send-pwd']")).toBeNull();
    expect(root.querySelector("[data-action='send-git-status']")).toBeNull();

    root.querySelector<HTMLButtonElement>("[data-action='send']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='switch-session']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='split-horizontal']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='split-vertical']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='scroll-history-back']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='scroll-history-forward']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='browser-scroll']")?.click();

    expect(root.querySelector("[data-action='clear']")).toBeNull();
    expect(root.querySelector("[data-action='redraw']")).toBeNull();
    expect(root.querySelector("[data-action='refresh']")).toBeNull();
    expect(root.querySelector("[data-action='kill']")).toBeNull();
    expect(root.querySelector("[data-action='reconnect']")).toBeNull();
    expect(root.querySelector("[data-action='config']")).toBeNull();
    expect(root.querySelector("[data-action='rename']")).toBeNull();
    expect(root.querySelector("[data-action='preview-image']")).toBeNull();
    expect(root.querySelector("[data-action='choose-image']")).toBeNull();
    expect(root.querySelector("[data-action='capture-image']")).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
    expect(onRedraw).not.toHaveBeenCalled();
    expect(onReconnect).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onConfig).not.toHaveBeenCalled();
    expect(onRename).not.toHaveBeenCalled();
    expect(onSendCommand).toHaveBeenCalledOnce();
    expect(onSwitchSession).toHaveBeenCalledOnce();
    expect(onPreviewImage).not.toHaveBeenCalled();
    expect(onChooseImage).not.toHaveBeenCalled();
    expect(onCaptureImage).not.toHaveBeenCalled();
    expect(onSplitHorizontal).toHaveBeenCalledOnce();
    expect(onSplitVertical).toHaveBeenCalledOnce();
    expect(onToggleBrowserScroll).toHaveBeenCalledOnce();
    expect(onScrollHistoryBack).toHaveBeenCalledOnce();
    expect(onScrollHistoryForward).toHaveBeenCalledOnce();
    expect(onKill).not.toHaveBeenCalled();
  });

  it("keeps switch session wording on the status bar action", () => {
    const root = document.createElement("div");
    const onSwitchSession = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      onSwitchSession
    });

    const switchButton = root.querySelector<HTMLButtonElement>(
      "[data-action='switch-session']"
    )!;

    expect(switchButton.textContent).toBe("Switch");
    expect(switchButton.title).toBe("Switch session");
    switchButton.click();
    expect(onSwitchSession).toHaveBeenCalledOnce();
  });

  it("does not render kanban session switches as a status-bar tab strip", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, { ...SESSION, name: "xxvisa-pm" });

    expect(root.querySelector("[data-group='kanban-sessions']")).toBeNull();
    expect(root.querySelector(".terminal-status-kanban-label")).toBeNull();
    expect(root.querySelector("[data-action='switch-kanban-session']")).toBeNull();
  });

  it("renders only group switching on pad sized screens", () => {
    const root = document.createElement("div");
    const onPreviewImage = vi.fn();
    const onChooseImage = vi.fn();
    const onCaptureImage = vi.fn();
    const onSplitHorizontal = vi.fn();
    const onSplitVertical = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      uiTier: "pad",
      kanbanProject: {
        name: "xxvisa",
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" }
        ]
      },
      kanbanProjects: [
        {
          name: "xxvisa",
          sessions: [
            { name: "xxvisa-pm", label: "pm" },
            { name: "xxvisa-review", label: "review" }
          ]
        },
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        }
      ],
      onOpenKanbanProject: vi.fn(),
      onMoveKanbanSession: vi.fn(),
      onOpenKanban: vi.fn(),
      onPreviewImage,
      onChooseImage,
      onCaptureImage,
      onSwitchSession: vi.fn(),
      onSendCommand: vi.fn(),
      onSplitHorizontal,
      onSplitVertical,
      onToggleBrowserScroll: vi.fn()
    });

    expect(root.querySelector("[data-action='toggle-mobile-status-actions']")).not.toBeNull();
    expect(root.querySelector("[data-action='switch-session']")).toBeNull();
    expect(root.querySelector("[data-group='view']")).toBeNull();
    expect(root.querySelector("[data-group='routing']")).toBeNull();
    expect(root.querySelector("[data-group='panes']")).toBeNull();

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    toggle.click();

    expect(root.querySelector("[data-group='kanban-groups']")).not.toBeNull();
    expect(root.querySelector("[data-group='mobile-panes']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("[data-action='split-horizontal']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='split-vertical']")?.click();
    expect(onSplitHorizontal).toHaveBeenCalledOnce();
    expect(onSplitVertical).toHaveBeenCalledOnce();

    toggle.click();
    expect(root.querySelector("[data-group='media']")).not.toBeNull();
    root.querySelector<HTMLButtonElement>("[data-action='preview-image']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='choose-image']")?.click();
    toggle.click();
    root.querySelector<HTMLButtonElement>("[data-action='capture-image']")?.click();
    expect(onPreviewImage).toHaveBeenCalledOnce();
    expect(onChooseImage).toHaveBeenCalledOnce();
    expect(onCaptureImage).toHaveBeenCalledOnce();
    toggle.click();
    expect(
      root
        .querySelector(".terminal-status-mobile-sheet")
        ?.querySelectorAll("[data-action='switch-group']")
    ).not.toHaveLength(0);
  });

  it("keeps mobile editing keys visible beside the groups control", () => {
    const root = document.createElement("div");
    const onSendSoftKey = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      onSendSoftKey,
      kanbanProject: {
        name: "local",
        sessions: [{ name: "build", label: "build" }]
      },
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        }
      ],
      onMoveKanbanSession: vi.fn()
    });

    const cursorKeys = root.querySelector<HTMLElement>(
      "[data-group='mobile-cursor-keys']"
    );

    expect(cursorKeys).not.toBeNull();
    expect(
      [...cursorKeys!.querySelectorAll<HTMLButtonElement>("[data-action]")]
        .map((button) => [button.dataset.action, button.textContent])
    ).toEqual([
      ["soft-key-left", "←"],
      ["soft-key-up", "↑"],
      ["soft-key-down", "↓"],
      ["soft-key-right", "→"],
      ["soft-key-shift-left", "S←"],
      ["soft-key-shift-up", "S↑"],
      ["soft-key-shift-down", "S↓"],
      ["soft-key-shift-right", "S→"],
      ["soft-key-shift-enter", "S↵"]
    ]);
    expect(root.querySelector(".terminal-status-mobile-sheet")).toBeNull();

    cursorKeys
      ?.querySelector<HTMLButtonElement>("[data-action='soft-key-left']")
      ?.click();
    cursorKeys
      ?.querySelector<HTMLButtonElement>("[data-action='soft-key-right']")
      ?.click();
    cursorKeys
      ?.querySelector<HTMLButtonElement>("[data-action='soft-key-shift-left']")
      ?.click();
    cursorKeys
      ?.querySelector<HTMLButtonElement>("[data-action='soft-key-shift-right']")
      ?.click();
    cursorKeys
      ?.querySelector<HTMLButtonElement>("[data-action='soft-key-shift-enter']")
      ?.click();

    expect(onSendSoftKey).toHaveBeenNthCalledWith(1, "\x1b[D");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(2, "\x1b[C");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(3, "\x1b[1;2D");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(4, "\x1b[1;2C");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(5, "\x1b[13;2u");
    expect(root.querySelector(".terminal-status-mobile-sheet")).toBeNull();
  });

  it("keeps mobile soft keys visible on a second toolbar row", () => {
    const root = document.createElement("div");
    const onSendSoftKey = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      onSendSoftKey,
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        }
      ],
      onMoveKanbanSession: vi.fn()
    });

    const inlineSoftKeys = root.querySelector<HTMLElement>(
      ".terminal-status-inline-soft-keys[data-group='soft-keys']"
    );

    expect(inlineSoftKeys).not.toBeNull();
    expect(
      [...inlineSoftKeys!.querySelectorAll<HTMLButtonElement>("[data-action]")]
        .map((button) => button.textContent)
    ).toEqual([
      "Esc",
      "Tab",
      "^C",
      "^D",
      "^L",
      "^R",
      "^A",
      "^E",
      "M-B",
      "M-F"
    ]);

    inlineSoftKeys
      ?.querySelector<HTMLButtonElement>("[data-action='soft-key-esc']")
      ?.click();
    inlineSoftKeys
      ?.querySelector<HTMLButtonElement>("[data-action='soft-key-ctrl-c']")
      ?.click();

    expect(onSendSoftKey).toHaveBeenNthCalledWith(1, "\x1b");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(2, "\x03");

    root
      .querySelector<HTMLButtonElement>("[data-action='toggle-mobile-status-actions']")
      ?.click();

    expect(
      root
        .querySelector(".terminal-status-mobile-sheet")
        ?.querySelector("[data-group='soft-keys']")
    ).toBeNull();
  });

  it("keeps focused mobile text input active when pressing cursor keys", () => {
    const root = document.createElement("div");
    const input = document.createElement("textarea");

    document.body.append(input);
    input.focus();

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      onSendSoftKey: vi.fn()
    });

    const leftKey = root.querySelector<HTMLButtonElement>(
      "[data-group='mobile-cursor-keys'] [data-action='soft-key-left']"
    );
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true
    });

    expect(leftKey).not.toBeNull();
    leftKey!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);

    input.remove();
  });

  it("uses readable compact labels for status bar actions", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      onRefresh: vi.fn(),
      onClear: vi.fn(),
      onRedraw: vi.fn(),
      onReconnect: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onKill: vi.fn(),
      onSendCommand: vi.fn(),
      onSwitchSession: vi.fn(),
      onPreviewImage: vi.fn(),
      onChooseImage: vi.fn(),
      onCaptureImage: vi.fn(),
      onSplitHorizontal: vi.fn(),
      onSplitVertical: vi.fn(),
      onToggleBrowserScroll: vi.fn(),
      onScrollHistoryBack: vi.fn(),
      onScrollHistoryForward: vi.fn()
    });

    expect(
      [...root.querySelectorAll<HTMLButtonElement>(".terminal-status-action")].map(
        (button) => button.textContent
      )
    ).toEqual([
      "Split",
      "Stack",
      "Page",
      "Live",
      "Hist",
      "Send",
      "Switch"
    ]);
  });

  it("groups status bar actions by workflow", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      onRefresh: vi.fn(),
      onClear: vi.fn(),
      onRedraw: vi.fn(),
      onReconnect: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onKill: vi.fn(),
      onSendCommand: vi.fn(),
      onSwitchSession: vi.fn(),
      onPreviewImage: vi.fn(),
      onChooseImage: vi.fn(),
      onCaptureImage: vi.fn(),
      onSplitHorizontal: vi.fn(),
      onSplitVertical: vi.fn(),
      onToggleBrowserScroll: vi.fn(),
      onScrollHistoryBack: vi.fn(),
      onScrollHistoryForward: vi.fn()
    });

    expect(
      [...root.querySelectorAll<HTMLElement>(".terminal-status-action-group")].map(
        (group) => ({
          group: group.dataset.group,
          actions: [
            ...group.querySelectorAll<HTMLButtonElement>(
              ".terminal-status-action"
            )
          ].map((button) => button.dataset.action ?? button.textContent)
        })
      )
    ).toEqual([
      {
        group: "panes",
        actions: ["split-horizontal", "split-vertical"]
      },
      {
        group: "view",
        actions: ["browser-scroll", "scroll-history-forward", "scroll-history-back"]
      },
      {
        group: "routing",
        actions: ["send", "switch-session"]
      }
    ]);
  });

  it("opens the group switcher on phone sized screens", () => {
    const root = document.createElement("div");
    const onMoveKanbanSession = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      kanbanProject: {
        name: "local",
        sessions: [{ name: "build", label: "build" }]
      },
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        },
        {
          name: "xxvisa",
          sessions: [{ name: "xxvisa-pm", label: "pm" }]
        }
      ],
      onOpenKanbanProject: vi.fn(),
      onMoveKanbanSession,
      onOpenKanban: vi.fn()
    });

    root.querySelector<HTMLButtonElement>("[data-action='toggle-mobile-status-actions']")?.click();

    expect(root.querySelector("[data-group='kanban-groups']")).not.toBeNull();
    expect(
      [...root.querySelectorAll<HTMLButtonElement>("[data-action='switch-group']")].map(
        (button) => button.textContent
      )
    ).toEqual(["local", "xxvisa", "ungrouped"]);
    expect(root.querySelector("[data-action='open-kanban']")).toBeNull();
    root
      .querySelectorAll<HTMLButtonElement>("[data-action='switch-group']")[1]
      ?.click();
    expect(onMoveKanbanSession).toHaveBeenCalledWith("local", "xxvisa", "build");
  });

  it("moves the current session out to ungrouped from the phone group switcher", () => {
    const root = document.createElement("div");
    const onMoveKanbanSession = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      kanbanProject: {
        name: "local",
        sessions: [{ name: "build", label: "build" }]
      },
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        }
      ],
      onMoveKanbanSession
    });

    root.querySelector<HTMLButtonElement>("[data-action='toggle-mobile-status-actions']")?.click();

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='switch-group'][data-project-name='ungrouped']"
      )
      ?.click();

    expect(onMoveKanbanSession).toHaveBeenCalledWith("local", "ungrouped", "build");
  });

  it("keeps the mobile groups toggle as a clear button", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      kanbanProject: {
        name: "local",
        sessions: [{ name: "build", label: "build" }]
      },
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        }
      ],
      onOpenKanbanProject: vi.fn(),
      onMoveKanbanSession: vi.fn(),
      onOpenKanban: vi.fn()
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.textContent).toBe("Groups");
    expect(toggle.className).toContain("terminal-status-mobile-toggle");
  });

  it("reopens the mobile group switcher with one click after an outside close", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      kanbanProject: {
        name: "local",
        sessions: [{ name: "build", label: "build" }]
      },
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        },
        {
          name: "xxvisa",
          sessions: [{ name: "xxvisa-pm", label: "pm" }]
        }
      ],
      onMoveKanbanSession: vi.fn()
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    toggle.click();
    expect(root.querySelector(".terminal-status-mobile-sheet")).not.toBeNull();

    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true })
    );
    expect(root.querySelector(".terminal-status-mobile-sheet")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.click();
    expect(root.querySelector(".terminal-status-mobile-sheet")).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the mobile group switcher again when the sheet was removed externally", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      uiTier: "phone",
      kanbanProject: {
        name: "local",
        sessions: [{ name: "build", label: "build" }]
      },
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        },
        {
          name: "xxvisa",
          sessions: [{ name: "xxvisa-pm", label: "pm" }]
        }
      ],
      onMoveKanbanSession: vi.fn()
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    toggle.click();
    const sheet = root.querySelector(".terminal-status-mobile-sheet");
    expect(sheet).not.toBeNull();
    sheet?.remove();

    toggle.click();
    expect(root.querySelector(".terminal-status-mobile-sheet")).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the mobile group switcher open across a status bar rerender", () => {
    const root = document.createElement("div");
    const actions = {
      uiTier: "phone" as const,
      kanbanProject: {
        name: "local",
        sessions: [{ name: "build", label: "build" }]
      },
      kanbanProjects: [
        {
          name: "local",
          sessions: [{ name: "build", label: "build" }]
        },
        {
          name: "xxvisa",
          sessions: [{ name: "xxvisa-pm", label: "pm" }]
        }
      ],
      onMoveKanbanSession: vi.fn()
    };

    renderSessionStatusBar(root, SESSION, actions);

    root
      .querySelector<HTMLButtonElement>("[data-action='toggle-mobile-status-actions']")
      ?.click();

    expect(root.querySelector(".terminal-status-mobile-sheet")).not.toBeNull();

    renderSessionStatusBar(root, SESSION, actions);

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    expect(root.querySelector(".terminal-status-mobile-sheet")).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector("[data-group='kanban-groups']")).not.toBeNull();
  });

  it("places pane/tools groups before the path and recovery on the far right", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      onRefresh: vi.fn(),
      onClear: vi.fn(),
      onRedraw: vi.fn(),
      onReconnect: vi.fn(),
      onConfig: vi.fn(),
      onRename: vi.fn(),
      onKill: vi.fn(),
      onSendCommand: vi.fn(),
      onSwitchSession: vi.fn(),
      onPreviewImage: vi.fn(),
      onChooseImage: vi.fn(),
      onCaptureImage: vi.fn(),
      onSplitHorizontal: vi.fn(),
      onSplitVertical: vi.fn(),
      onToggleBrowserScroll: vi.fn(),
      onScrollHistoryBack: vi.fn(),
      onScrollHistoryForward: vi.fn()
    });

    expect(
      [...root.querySelector(".terminal-status-bar")!.children].map((child) =>
        child instanceof HTMLElement
          ? child.dataset.group ?? child.className
          : ""
      )
    ).toEqual([
      "panes",
      "terminal-status-main",
      "view",
      "routing"
    ]);
  });

  it("marks browser scroll mode as active in the status bar", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      browserScrollEnabled: true,
      onToggleBrowserScroll: vi.fn()
    });

    const button = root.querySelector<HTMLButtonElement>(
      "[data-action='browser-scroll']"
    )!;

    expect(button.textContent).toBe("Tmux");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.classList.contains("is-active")).toBe(true);
  });

  it("does not render pane quick switches or pane close actions in the status bar", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, { ...SESSION, windows: 1 });

    expect(root.querySelector(".terminal-status-panes")).toBeNull();
    expect(root.querySelector(".terminal-status-pane-button")).toBeNull();
    expect(root.querySelector(".terminal-status-pane-kill")).toBeNull();
  });

  it("disables session management actions when handlers are missing", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION);

    expect(root.querySelector("[data-action='reconnect']")).toBeNull();
    expect(root.querySelector("[data-action='config']")).toBeNull();
    expect(root.querySelector("[data-action='rename']")).toBeNull();
    expect(root.querySelector("[data-action='preview-image']")).toBeNull();
    expect(root.querySelector("[data-action='choose-image']")).toBeNull();
    expect(root.querySelector("[data-action='capture-image']")).toBeNull();
    expect(root.querySelector("[data-action='clear']")).toBeNull();
    expect(root.querySelector("[data-action='redraw']")).toBeNull();
    expect(root.querySelector("[data-action='refresh']")).toBeNull();
    expect(root.querySelector("[data-action='kill']")).toBeNull();
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='send']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='switch-session']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='split-horizontal']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='split-vertical']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='scroll-history-back']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='scroll-history-forward']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='browser-scroll']")?.disabled
    ).toBe(true);

    expect(root.querySelector("[data-action='toggle-mobile-status-actions']")).toBeNull();
  });
});
