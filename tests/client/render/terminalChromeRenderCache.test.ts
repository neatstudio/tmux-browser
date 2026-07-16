import { describe, expect, it, vi } from "vitest";

import {
  createTerminalChromeRenderCache,
  getTerminalChromeSessionDisplay
} from "../../../src/client/render/terminalChromeRenderCache";

type Actions = {
  onOpenSession: (sessionName: string) => void;
};

function createRenderers() {
  return {
    renderStatusBar: vi.fn<(actions: Actions) => void>(),
    renderGroupRail: vi.fn<(actions: Actions) => void>(),
    renderFloatingMenu: vi.fn<(actions: Actions) => void>()
  };
}

describe("terminalChromeRenderCache", () => {
  it("projects every session summary field displayed by terminal chrome", () => {
    expect(
      getTerminalChromeSessionDisplay([
        {
          name: "build",
          windows: 3,
          status: "attached",
          lastActivityAt: 123,
          paneCount: 5,
          activeWindowName: "server",
          currentCommand: "npm",
          currentPath: "/tmp/project",
          gitBranch: "main",
          gitDirty: true,
          paneDead: false,
          paneDeadStatus: null,
          preview: "ignored",
          inputPrompt: null
        }
      ])
    ).toEqual([
      {
        name: "build",
        status: "attached",
        windows: 3,
        paneCount: 5,
        currentCommand: "npm",
        currentPath: "/tmp/project"
      }
    ]);
  });

  it("returns stable actions and skips all renderers for an equal signature", () => {
    const cache = createTerminalChromeRenderCache<Actions>();
    const mountedTerminal = {};
    const renderers = createRenderers();
    const actions = { onOpenSession: vi.fn() };
    const request = {
      tabId: "tab-build",
      mountedTerminal,
      signature: {
        session: { name: "build", currentPath: "/tmp/project" },
        connectionState: "connected",
        uiTier: "desktop"
      },
      actions,
      ...renderers
    };

    const first = cache.render(request);
    const second = cache.render({
      ...request,
      signature: {
        session: { name: "build", currentPath: "/tmp/project" },
        connectionState: "connected",
        uiTier: "desktop"
      },
      actions: { onOpenSession: vi.fn() }
    });

    expect(first.rendered).toBe(true);
    expect(second.rendered).toBe(false);
    expect(second.actions).toBe(first.actions);
    expect(renderers.renderStatusBar).toHaveBeenCalledOnce();
    expect(renderers.renderGroupRail).toHaveBeenCalledOnce();
    expect(renderers.renderFloatingMenu).toHaveBeenCalledOnce();
  });

  it("rerenders all terminal chrome when display data changes", () => {
    const cache = createTerminalChromeRenderCache<Actions>();
    const mountedTerminal = {};
    const renderers = createRenderers();
    const base = {
      tabId: "tab-build",
      mountedTerminal,
      actions: { onOpenSession: vi.fn() },
      ...renderers
    };

    cache.render({ ...base, signature: { currentPath: "/tmp/one" } });
    const result = cache.render({
      ...base,
      signature: { currentPath: "/tmp/two" }
    });

    expect(result.rendered).toBe(true);
    expect(renderers.renderStatusBar).toHaveBeenCalledTimes(2);
    expect(renderers.renderGroupRail).toHaveBeenCalledTimes(2);
    expect(renderers.renderFloatingMenu).toHaveBeenCalledTimes(2);
  });

  it("skips rendering for structurally equal signatures with reordered keys", () => {
    const cache = createTerminalChromeRenderCache<Actions>();
    const mountedTerminal = {};
    const renderers = createRenderers();
    const base = {
      tabId: "tab-build",
      mountedTerminal,
      actions: { onOpenSession: vi.fn() },
      ...renderers
    };

    cache.render({
      ...base,
      signature: {
        session: { name: "build", status: "attached" },
        localUi: { menuOpen: false, menuDraft: "" }
      }
    });
    const result = cache.render({
      ...base,
      signature: {
        localUi: { menuDraft: "", menuOpen: false },
        session: { status: "attached", name: "build" }
      }
    });

    expect(result.rendered).toBe(false);
    expect(renderers.renderStatusBar).toHaveBeenCalledOnce();
    expect(renderers.renderGroupRail).toHaveBeenCalledOnce();
    expect(renderers.renderFloatingMenu).toHaveBeenCalledOnce();
  });

  it("routes stable actions to the latest callback implementation", () => {
    const cache = createTerminalChromeRenderCache<Actions>();
    const mountedTerminal = {};
    const renderers = createRenderers();
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const base = {
      tabId: "tab-build",
      mountedTerminal,
      signature: { currentPath: "/tmp/project" },
      ...renderers
    };

    const first = cache.render({
      ...base,
      actions: { onOpenSession: firstCallback }
    });
    cache.render({
      ...base,
      actions: { onOpenSession: latestCallback }
    });
    first.actions.onOpenSession("review");

    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledWith("review");
  });

  it("keeps nested renderer action groups stable while callbacks change", () => {
    type NestedActions = {
      menu: { onRefresh: () => void };
    };
    const cache = createTerminalChromeRenderCache<NestedActions>();
    const mountedTerminal = {};
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    let capturedMenuActions: NestedActions["menu"] | null = null;
    const request = {
      tabId: "tab-build",
      mountedTerminal,
      signature: { currentPath: "/tmp/project" },
      renderStatusBar: (actions: NestedActions) => {
        capturedMenuActions = actions.menu;
      },
      renderGroupRail: vi.fn<(actions: NestedActions) => void>(),
      renderFloatingMenu: vi.fn<(actions: NestedActions) => void>()
    };

    cache.render({
      ...request,
      actions: { menu: { onRefresh: firstCallback } }
    });
    cache.render({
      ...request,
      actions: { menu: { onRefresh: latestCallback } }
    });
    capturedMenuActions!.onRefresh();

    expect(firstCallback).not.toHaveBeenCalled();
    expect(latestCallback).toHaveBeenCalledOnce();
  });

  it("invalidates entries on tab close and mounted-terminal replacement", () => {
    const cache = createTerminalChromeRenderCache<Actions>();
    const renderers = createRenderers();
    const request = {
      tabId: "tab-build",
      mountedTerminal: {},
      signature: { currentPath: "/tmp/project" },
      actions: { onOpenSession: vi.fn() },
      ...renderers
    };

    const first = cache.render(request);
    cache.delete("tab-build");
    const afterClose = cache.render(request);
    const afterRemount = cache.render({ ...request, mountedTerminal: {} });

    expect(afterClose.rendered).toBe(true);
    expect(afterClose.actions).not.toBe(first.actions);
    expect(afterRemount.rendered).toBe(true);
    expect(afterRemount.actions).not.toBe(afterClose.actions);
    expect(renderers.renderStatusBar).toHaveBeenCalledTimes(3);
    expect(renderers.renderGroupRail).toHaveBeenCalledTimes(3);
    expect(renderers.renderFloatingMenu).toHaveBeenCalledTimes(3);
  });
});
