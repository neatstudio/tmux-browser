import { describe, expect, it } from "vitest";

import { isPageVisible } from "../../src/client/pageVisibility";

describe("isPageVisible", () => {
  it("treats visible and prerender pages as active", () => {
    expect(isPageVisible({ visibilityState: "visible" })).toBe(true);
    expect(isPageVisible({ visibilityState: "prerender" })).toBe(true);
  });

  it("treats hidden pages as inactive", () => {
    expect(isPageVisible({ visibilityState: "hidden" })).toBe(false);
  });
});
