import { describe, expect, it } from "vitest";

import { getAppView, getLayoutMode } from "../../src/client/layoutMode";

describe("getLayoutMode", () => {
  it("uses the sidebar layout by default", () => {
    expect(getLayoutMode("")).toBe("sidebar");
    expect(getLayoutMode("?foo=bar")).toBe("sidebar");
  });

  it("keeps the legacy tab layout available through the layout query parameter", () => {
    expect(getLayoutMode("?layout=sidebar")).toBe("sidebar");
    expect(getLayoutMode("?layout=tabs")).toBe("tabs");
  });

  it("opens kanban only when explicitly requested", () => {
    expect(getAppView("")).toBe("terminal");
    expect(getAppView("?layout=sidebar")).toBe("terminal");
    expect(getAppView("?view=kanban")).toBe("kanban");
  });
});
