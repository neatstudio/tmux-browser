import { describe, expect, it } from "vitest";

import { getLayoutMode } from "../../src/client/layoutMode";

describe("getLayoutMode", () => {
  it("uses the sidebar layout by default", () => {
    expect(getLayoutMode("")).toBe("sidebar");
    expect(getLayoutMode("?foo=bar")).toBe("sidebar");
  });

  it("keeps the legacy tab layout available through the layout query parameter", () => {
    expect(getLayoutMode("?layout=sidebar")).toBe("sidebar");
    expect(getLayoutMode("?layout=tabs")).toBe("tabs");
  });
});
