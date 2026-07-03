// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { createTabState } from "../../../src/client/state/tabState";

describe("createTabState", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("migrates open browser tabs from sessionStorage without claiming tmux ownership", () => {
    sessionStorage.setItem(
      "browser-tmux-dashboard.tabs",
      JSON.stringify([{ id: "tab-1", sessionName: "build", title: "build" }])
    );

    const state = createTabState();

    expect(state.getTabs()).toEqual([
      { id: "tab-1", sessionName: "build", title: "build" }
    ]);
    expect(localStorage.getItem("browser-tmux-dashboard.tabs")).toBe(
      JSON.stringify([{ id: "tab-1", sessionName: "build", title: "build" }])
    );
  });

  it("falls back to dashboard when the last session tab closes", () => {
    const state = createTabState();
    const opened = state.openTab("build");

    state.closeTab(opened.id);

    expect(state.getActiveTabId()).toBeNull();
  });

  it("activates an existing tab instead of opening duplicate session tabs", () => {
    const state = createTabState();
    const first = state.openTab("build");
    state.openTab("logs");

    const reopened = state.openTab("build");

    expect(reopened).toBe(first);
    expect(state.getTabs()).toEqual([
      { id: first.id, sessionName: "build", title: "build" },
      { id: expect.any(String), sessionName: "logs", title: "logs" }
    ]);
    expect(state.getActiveTabId()).toBe(first.id);
  });

  it("renames open tabs without closing the active terminal", () => {
    const state = createTabState();
    const opened = state.openTab("build");

    state.renameSession("build", "build-test");

    expect(state.getTabs()).toEqual([
      { id: opened.id, sessionName: "build-test", title: "build-test" }
    ]);
    expect(state.getActiveTabId()).toBe(opened.id);
  });

  it("pins tabs so they cannot be closed until unpinned", () => {
    const state = createTabState();
    const opened = state.openTab("build");

    state.togglePinned(opened.id);
    state.closeTab(opened.id);

    expect(state.getTabs()).toEqual([
      {
        id: opened.id,
        sessionName: "build",
        title: "build",
        pinned: true
      }
    ]);

    state.togglePinned(opened.id);
    state.closeTab(opened.id);

    expect(state.getTabs()).toEqual([]);
    expect(state.getActiveTabId()).toBeNull();
  });

  it("restores pinned tabs after rebuilding tab state", () => {
    const state = createTabState();
    const opened = state.openTab("build");

    state.togglePinned(opened.id);

    const restored = createTabState();

    expect(restored.getTabs()).toEqual([
      {
        id: opened.id,
        sessionName: "build",
        title: "build",
        pinned: true
      }
    ]);
  });

  it("restores the previously active session tab after rebuilding tab state", () => {
    const state = createTabState();
    state.openTab("build");
    const logs = state.openTab("logs");

    const restored = createTabState();

    expect(restored.getActiveTabId()).toBe(logs.id);
  });

  it("persists the dashboard as the active surface after rebuilding tab state", () => {
    const state = createTabState();
    state.openTab("build");
    state.setActiveTab(null);

    const restored = createTabState();

    expect(restored.getTabs()).toHaveLength(1);
    expect(restored.getActiveTabId()).toBeNull();
  });

  it("can start on the dashboard while preserving restored tabs", () => {
    localStorage.setItem(
      "browser-tmux-dashboard.tabs",
      JSON.stringify([{ id: "tab-1", sessionName: "build", title: "build" }])
    );

    const state = createTabState({ initialActiveTabId: null });

    expect(state.getTabs()).toEqual([
      { id: "tab-1", sessionName: "build", title: "build" }
    ]);
    expect(state.getActiveTabId()).toBeNull();
  });

  it("can start with no active tab when restored session tabs exist", () => {
    localStorage.setItem(
      "browser-tmux-dashboard.tabs",
      JSON.stringify([{ id: "tab-1", sessionName: "build", title: "build" }])
    );
    localStorage.setItem("browser-tmux-dashboard.active-tab-id", "");

    const state = createTabState();

    expect(state.getTabs()).toEqual([
      { id: "tab-1", sessionName: "build", title: "build" }
    ]);
    expect(state.getActiveTabId()).toBeNull();
  });

  it("does not auto-select the first tab when the stored active tab is missing", () => {
    localStorage.setItem(
      "browser-tmux-dashboard.tabs",
      JSON.stringify([{ id: "tab-1", sessionName: "build", title: "build" }])
    );
    localStorage.setItem("browser-tmux-dashboard.active-tab-id", "missing");

    const state = createTabState();

    expect(state.getTabs()).toHaveLength(1);
    expect(state.getActiveTabId()).toBeNull();
  });

  it("can start on a specific restored tab", () => {
    localStorage.setItem(
      "browser-tmux-dashboard.tabs",
      JSON.stringify([{ id: "tab-1", sessionName: "build", title: "build" }])
    );

    const state = createTabState({ initialActiveTabId: "tab-1" });

    expect(state.getActiveTabId()).toBe("tab-1");
  });

  it("lets an explicit initial active tab override the stored active tab", () => {
    localStorage.setItem(
      "browser-tmux-dashboard.tabs",
      JSON.stringify([
        { id: "tab-1", sessionName: "build", title: "build" },
        { id: "tab-2", sessionName: "logs", title: "logs" }
      ])
    );
    localStorage.setItem("browser-tmux-dashboard.active-tab-id", "tab-2");

    const state = createTabState({ initialActiveTabId: "tab-1" });

    expect(state.getActiveTabId()).toBe("tab-1");
  });

  it("does not prune pinned tabs during a session list refresh", () => {
    const state = createTabState();
    const pinned = state.openTab("build");
    const unpinned = state.openTab("scratch");

    state.togglePinned(pinned.id);
    state.pruneTabs([]);

    expect(state.getTabs()).toEqual([
      {
        id: pinned.id,
        sessionName: "build",
        title: "build",
        pinned: true
      }
    ]);
    expect(state.getTabs().some((tab) => tab.id === unpinned.id)).toBe(false);
  });
});
