import { describe, expect, it } from "vitest";

import {
  buildViewUrl,
  getAppShellClasses,
  getAppView,
  getInitialAppView,
  getLayoutMode,
  getRequestedAppView,
  shouldPromoteActiveTabToTerminal,
  shouldRenderSidebar
} from "../../src/client/layoutMode";

describe("getLayoutMode", () => {
  it("uses a chrome-free layout and ignores legacy layout requests", () => {
    expect(getLayoutMode("")).toBe("none");
    expect(getLayoutMode("?foo=bar")).toBe("none");
    expect(getLayoutMode("?layout=sidebar")).toBe("none");
    expect(getLayoutMode("?layout=tabs")).toBe("none");
  });

  it("uses terminal/dashboard as the default view", () => {
    expect(getAppView("")).toBe("kanban");
    expect(getAppView("?layout=sidebar")).toBe("kanban");
    expect(getAppView("?view=kanban")).toBe("kanban");
    expect(getAppView("?view=terminal")).toBe("terminal");
  });

  it("builds view URLs while dropping legacy layout requests", () => {
    expect(
      buildViewUrl("http://localhost:3000/?layout=sidebar&view=kanban", {
        view: "terminal"
      })
    ).toBe("/?view=terminal");
    expect(
      buildViewUrl("http://localhost:3000/?layout=sidebar", {
        view: "kanban",
        projectName: "xxvisa"
      })
    ).toBe("/?view=kanban&project=xxvisa");
  });

  it("keeps kanban explicit in URLs so refresh does not infer it as the default", () => {
    expect(
      buildViewUrl("http://localhost:3000/?layout=sidebar", {
        view: "kanban"
      })
    ).toBe("/?view=kanban");
  });

  it("keeps the legacy sidebar layout disabled while the floating menu is active", () => {
    expect(shouldRenderSidebar("none", "terminal")).toBe(false);
    expect(shouldRenderSidebar("none", "kanban")).toBe(false);
  });

  it("marks kanban pages on the shell without enabling sidebar chrome", () => {
    expect(getAppShellClasses("none", "kanban")).toBe(
      "app-shell app-shell--kanban-view"
    );
    expect(getAppShellClasses("none", "terminal")).toBe("app-shell");
  });

  it("keeps explicit view requests while restoring sessions for the implicit landing view", () => {
    expect(getRequestedAppView("?view=kanban")).toBe("kanban");
    expect(getRequestedAppView("?view=terminal")).toBe("terminal");
    expect(getRequestedAppView("")).toBeNull();
    expect(getInitialAppView("kanban", "tab-1")).toBe("kanban");
    expect(getInitialAppView("kanban", null)).toBe("kanban");
    expect(getInitialAppView("terminal", null)).toBe("terminal");
    expect(getInitialAppView(null, "tab-1")).toBe("terminal");
    expect(getInitialAppView(null, null)).toBe("kanban");
  });

  it("does not promote active tabs over an explicit kanban view", () => {
    expect(shouldPromoteActiveTabToTerminal("kanban", "tab-1", "kanban")).toBe(
      false
    );
    expect(shouldPromoteActiveTabToTerminal("kanban", "tab-1", null)).toBe(
      true
    );
    expect(shouldPromoteActiveTabToTerminal("terminal", "tab-1", null)).toBe(
      false
    );
    expect(shouldPromoteActiveTabToTerminal("kanban", null, null)).toBe(false);
  });
});
