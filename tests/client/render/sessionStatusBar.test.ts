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

  it("shows same-kanban-project sessions as one-click status bar switches", () => {
    const root = document.createElement("div");
    const onOpenKanbanSession = vi.fn();

    renderSessionStatusBar(root, {
      ...SESSION,
      name: "xxvisa-pm"
    }, {
      kanbanProject: {
        name: "xxvisa",
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" },
          { name: "xxvisa-codex", label: "codex" }
        ]
      },
      onOpenKanbanSession
    });

    const group = root.querySelector<HTMLElement>(
      "[data-group='kanban-sessions']"
    )!;
    const label = group.querySelector<HTMLElement>(
      ".terminal-status-kanban-label"
    )!;
    const buttons = [
      ...group.querySelectorAll<HTMLButtonElement>(
        "[data-action='switch-kanban-session']"
      )
    ];

    expect(label.textContent).toBe("xxvisa");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "pm",
      "review",
      "codex"
    ]);
    expect(buttons[0].getAttribute("aria-current")).toBe("true");
    expect(buttons[0].classList.contains("is-active")).toBe(true);

    buttons[1].click();

    expect(onOpenKanbanSession).toHaveBeenCalledWith("xxvisa-review");
  });

  it("marks switch as the primary mobile navigation action", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      onSwitchSession: vi.fn()
    });

    const switchButton = root.querySelector<HTMLButtonElement>(
      "[data-action='switch-session']"
    )!;

    expect(switchButton.classList.contains("is-mobile-primary")).toBe(true);
  });

  it("toggles a compact mobile action sheet from the status bar", () => {
    const root = document.createElement("div");
    const onClear = vi.fn();
    const onReconnect = vi.fn();
    const onConfig = vi.fn();
    const onRename = vi.fn();
    const onPreviewImage = vi.fn();
    const onChooseImage = vi.fn();
    const onCaptureImage = vi.fn();
    const onSendCommand = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      onClear,
      onReconnect,
      onConfig,
      onRename,
      onPreviewImage,
      onChooseImage,
      onCaptureImage,
      onSendCommand
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toBe("Actions");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".terminal-status-mobile-sheet")).toBeNull();

    toggle.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector(".terminal-status-mobile-sheet")).not.toBeNull();
    expect(root.querySelector(".terminal-status-mobile-sheet [data-action='send']")).not.toBeNull();
    expect(root.querySelector(".terminal-status-mobile-sheet [data-action='switch-session']")).not.toBeNull();
    expect(root.querySelector(".terminal-status-mobile-sheet [data-action='clear']")).toBeNull();
    expect(root.querySelector(".terminal-status-mobile-sheet [data-action='reconnect']")).toBeNull();
    expect(root.querySelector(".terminal-status-mobile-sheet [data-action='config']")).toBeNull();
    expect(root.querySelector(".terminal-status-mobile-sheet [data-action='preview-image']")).toBeNull();

    root
      .querySelector<HTMLButtonElement>(
        ".terminal-status-mobile-sheet [data-action='send']"
      )
      ?.click();

    expect(onClear).not.toHaveBeenCalled();
    expect(onSendCommand).toHaveBeenCalledOnce();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".terminal-status-mobile-sheet")).toBeNull();
  });

  it("renders mobile soft keys and sends their control sequences", () => {
    const root = document.createElement("div");
    const onSendSoftKey = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      onSendSoftKey
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    toggle.click();

    const sheet = root.querySelector<HTMLElement>(".terminal-status-mobile-sheet")!;
    const keyButtons = sheet.querySelectorAll<HTMLButtonElement>(
      ".terminal-status-soft-key"
    );

    expect([...keyButtons].map((button) => button.textContent)).toEqual([
      "Esc",
      "Tab",
      "Ctrl-C",
      "Ctrl-D",
      "Ctrl-L",
      "Ctrl-R",
      "Ctrl-A",
      "Ctrl-E",
      "Alt-B",
      "Alt-F",
      "↑",
      "↓",
      "←",
      "→",
      "PgUp",
      "PgDn"
    ]);

    sheet.querySelector<HTMLButtonElement>("[data-action='soft-key-esc']")?.click();
    sheet.querySelector<HTMLButtonElement>("[data-action='soft-key-tab']")?.click();
    sheet.querySelector<HTMLButtonElement>("[data-action='soft-key-ctrl-c']")?.click();

    expect(onSendSoftKey).toHaveBeenNthCalledWith(1, "\x1b");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(2, "\t");
    expect(onSendSoftKey).toHaveBeenNthCalledWith(3, "\x03");
  });

  it("keeps the mobile action sheet open after soft key taps", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION, {
      onSendSoftKey: vi.fn()
    });

    const toggle = root.querySelector<HTMLButtonElement>(
      "[data-action='toggle-mobile-status-actions']"
    )!;

    toggle.click();
    root
      .querySelector<HTMLButtonElement>(
        ".terminal-status-mobile-sheet [data-action='soft-key-up']"
      )
      ?.click();

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector(".terminal-status-mobile-sheet")).not.toBeNull();
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
      "Actions",
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
      onScrollHistoryForward: vi.fn(),
      onSelectPane: vi.fn(),
      onKillPane: vi.fn()
    });

    expect(
      [...root.querySelectorAll<HTMLElement>(".terminal-status-action-group")].map(
        (group) => ({
          group: group.dataset.group,
          actions: [
            ...group.querySelectorAll<HTMLButtonElement>(
              ".terminal-status-action, .terminal-status-pane-button"
            )
          ].map((button) => button.dataset.action ?? button.textContent)
        })
      )
    ).toEqual([
      {
        group: "panes",
        actions: ["split-horizontal", "split-vertical", "select-pane", "select-pane"]
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
      onScrollHistoryForward: vi.fn(),
      onSelectPane: vi.fn(),
      onKillPane: vi.fn()
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
      "terminal-status-mobile-toggle terminal-status-action",
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

  it("renders pane quick switches and pane close actions in the status bar", () => {
    const root = document.createElement("div");
    const onSelectPane = vi.fn();
    const onKillPane = vi.fn();

    renderSessionStatusBar(root, { ...SESSION, windows: 1 }, {
      onSelectPane,
      onKillPane
    });

    const paneButtons = root.querySelectorAll<HTMLButtonElement>(
      ".terminal-status-pane-button"
    );
    const closeButtons = root.querySelectorAll<HTMLButtonElement>(
      ".terminal-status-pane-kill"
    );

    expect([...paneButtons].map((button) => button.textContent)).toEqual([
      "#0 zsh",
      "#1 npm"
    ]);
    expect(paneButtons[1]?.classList.contains("is-active")).toBe(true);
    expect([...closeButtons].map((button) => button.textContent)).toEqual([
      "×",
      "×"
    ]);

    paneButtons[0]?.click();
    closeButtons[1]?.click();

    expect(onSelectPane).toHaveBeenCalledWith("build", "%1");
    expect(onKillPane).toHaveBeenCalledWith("build", "%2");
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

    root
      .querySelector<HTMLButtonElement>(
        "[data-action='toggle-mobile-status-actions']"
      )
      ?.click();

    expect(
      root.querySelector(".terminal-status-mobile-sheet [data-action='reconnect']")
    ).toBeNull();
    expect(
      root.querySelector(".terminal-status-mobile-sheet [data-action='config']")
    ).toBeNull();
    expect(
      root.querySelector(".terminal-status-mobile-sheet [data-action='preview-image']")
    ).toBeNull();
  });
});
