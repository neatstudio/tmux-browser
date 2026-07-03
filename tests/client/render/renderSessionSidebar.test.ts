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
  preview: "preview output",
  inputPrompt: null
};

describe("renderSessionSidebar", () => {
  it("never renders the disabled sidebar or mobile launcher", () => {
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
        activeSessionName: "api",
        activeView: "dashboard",
        collapsed: false,
        draftSessionName: "demo",
        browserTabs: [{ sessionName: "api", active: true }],
        pinnedSessionNames: new Set(["api"]),
        mutedSessionNames: new Set(),
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

    expect(root.innerHTML).toBe("");
    expect(root.querySelector(".session-sidebar")).toBeNull();
    expect(root.querySelector(".mobile-sidebar-launcher")).toBeNull();
    expect(root.textContent).not.toContain("Tmux");
  });

  it("cleans stale sidebar DOM left by older bundles", () => {
    const root = document.createElement("div");
    root.className = "is-mobile-sidebar-open is-sidebar-collapsed";
    root.innerHTML = `
      <div class="session-sidebar-root">
        <button class="mobile-sidebar-launcher">T</button>
        <aside class="session-sidebar">old sidebar</aside>
      </div>
    `;

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

    expect(root.innerHTML).toBe("");
    expect(root.classList.contains("is-mobile-sidebar-open")).toBe(false);
    expect(root.classList.contains("is-sidebar-collapsed")).toBe(false);
  });
});
