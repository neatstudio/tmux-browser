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
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 2, 9, 8));

    expect(formatSessionStatusBar(SESSION)).toEqual([
      "build",
      "server",
      "2w 3p",
      "npm",
      "/tmp/project/app",
      "attached",
      "idle 3m · 2026-05-02 09:05"
    ]);

    vi.useRealTimers();
  });

  it("shows failed pane state in the terminal page status bar", () => {
    expect(
      formatSessionStatusBar({
        ...SESSION,
        paneDead: true,
        paneDeadStatus: 1
      })
    ).toContain("failed 1");
  });

  it("renders a bottom status bar for a mounted terminal panel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 2, 9, 8));

    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION);

    const bar = root.querySelector<HTMLElement>(".terminal-status-bar")!;

    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain("build");
    expect(bar.textContent).toContain("2w 3p");
    expect(bar.textContent).toContain("idle 3m · 2026-05-02 09:05");
    expect(bar.querySelectorAll(".terminal-status-item")).toHaveLength(7);
    expect(bar.querySelector(".terminal-status-main")).not.toBeNull();
    expect(bar.querySelector(".terminal-status-actions")).not.toBeNull();

    vi.useRealTimers();
  });

  it("renders full mode with expanded window and pane labels", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, {
      ...SESSION,
      windows: 1,
      paneCount: 1
    });

    root.querySelector<HTMLElement>(".terminal-status-bar")?.click();

    const bar = root.querySelector<HTMLElement>(".terminal-status-bar")!;

    expect(bar.dataset.mode).toBe("full");
    expect(bar.textContent).toContain("1 window");
    expect(bar.textContent).toContain("1 pane");
    expect(bar.textContent).not.toContain("1w 1p");
  });

  it("renders git mode and cycles back to compact mode", () => {
    const root = document.createElement("div");

    renderSessionStatusBar(root, SESSION);

    const bar = root.querySelector<HTMLElement>(".terminal-status-bar")!;
    bar.click();
    bar.click();

    expect(bar.dataset.mode).toBe("git");
    expect(bar.textContent).toContain("git main dirty");

    bar.click();

    expect(bar.dataset.mode).toBe("compact");
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
    const onViewSession = vi.fn();
    const onSplitHorizontal = vi.fn();
    const onSplitVertical = vi.fn();

    renderSessionStatusBar(root, SESSION, {
      onRefresh,
      onClear,
      onRedraw,
      onReconnect,
      onConfig,
      onRename,
      onKill,
      onSendCommand,
      onViewSession,
      onSplitHorizontal,
      onSplitVertical
    });

    expect(root.querySelector("[data-action='send-pwd']")).toBeNull();
    expect(root.querySelector("[data-action='send-git-status']")).toBeNull();

    root.querySelector<HTMLButtonElement>("[data-action='clear']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='redraw']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='reconnect']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='refresh']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='config']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='rename']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='send']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='view']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='split-horizontal']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='split-vertical']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='kill']")?.click();

    expect(onClear).toHaveBeenCalledOnce();
    expect(onRedraw).toHaveBeenCalledOnce();
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onConfig).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledOnce();
    expect(onSendCommand).toHaveBeenCalledOnce();
    expect(onViewSession).toHaveBeenCalledOnce();
    expect(onSplitHorizontal).toHaveBeenCalledOnce();
    expect(onSplitVertical).toHaveBeenCalledOnce();
    expect(onKill).toHaveBeenCalledOnce();
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
      onViewSession: vi.fn(),
      onSplitHorizontal: vi.fn(),
      onSplitVertical: vi.fn()
    });

    expect(
      [...root.querySelectorAll<HTMLButtonElement>(".terminal-status-action")].map(
        (button) => button.textContent
      )
    ).toEqual([
      "Clear",
      "Draw",
      "Recon",
      "Sync",
      "Cfg",
      "Ren",
      "Send",
      "View",
      "Split",
      "Stack",
      "Kill"
    ]);
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

    expect(
      root.querySelector<HTMLButtonElement>("[data-action='reconnect']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='config']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='rename']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='send']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='view']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='split-horizontal']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='split-vertical']")?.disabled
    ).toBe(true);
    expect(
      root.querySelector<HTMLButtonElement>("[data-action='kill']")?.disabled
    ).toBe(true);
  });
});
