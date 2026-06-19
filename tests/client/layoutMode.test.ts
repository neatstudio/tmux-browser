import { describe, expect, it } from "vitest";

import {
  buildViewUrl,
  getAppView,
  getLayoutMode
} from "../../src/client/layoutMode";

describe("getLayoutMode", () => {
  it("uses the sidebar layout by default", () => {
    expect(getLayoutMode("")).toBe("sidebar");
    expect(getLayoutMode("?foo=bar")).toBe("sidebar");
  });

  it("keeps the legacy tab layout available through the layout query parameter", () => {
    expect(getLayoutMode("?layout=sidebar")).toBe("sidebar");
    expect(getLayoutMode("?layout=tabs")).toBe("tabs");
  });

  it("uses kanban as the default non-terminal view", () => {
    expect(getAppView("")).toBe("kanban");
    expect(getAppView("?layout=sidebar")).toBe("kanban");
    expect(getAppView("?view=kanban")).toBe("kanban");
    expect(getAppView("?view=terminal")).toBe("terminal");
  });

  it("builds view URLs without dropping sidebar layout or project target", () => {
    expect(
      buildViewUrl("http://localhost:3000/?layout=sidebar&view=kanban", {
        view: "terminal"
      })
    ).toBe("/?layout=sidebar&view=terminal");
    expect(
      buildViewUrl("http://localhost:3000/?layout=sidebar", {
        view: "kanban",
        projectName: "xxvisa"
      })
    ).toBe("/?layout=sidebar&project=xxvisa");
  });
});
