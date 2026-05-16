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
  paneDeadStatus: null
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

    renderSessionStatusBar(root, SESSION, {
      onRefresh,
      onClear,
      onRedraw
    });

    expect(root.querySelector("[data-action='split-horizontal']")).toBeNull();
    expect(root.querySelector("[data-action='split-vertical']")).toBeNull();
    expect(root.querySelector("[data-action='send-pwd']")).toBeNull();
    expect(root.querySelector("[data-action='send-git-status']")).toBeNull();

    root.querySelector<HTMLButtonElement>("[data-action='clear']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='redraw']")?.click();
    root.querySelector<HTMLButtonElement>("[data-action='refresh']")?.click();

    expect(onClear).toHaveBeenCalledOnce();
    expect(onRedraw).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
