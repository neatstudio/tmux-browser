import { describe, expect, it } from "vitest";

import { getResponsiveUiTier } from "../../src/client/responsiveUiTier";

describe("getResponsiveUiTier", () => {
  it("treats narrow screens as phones", () => {
    expect(getResponsiveUiTier(640)).toBe("phone");
  });

  it("treats medium screens as pads", () => {
    expect(getResponsiveUiTier(900)).toBe("pad");
  });

  it("treats wide screens as desktop", () => {
    expect(getResponsiveUiTier(1280)).toBe("desktop");
  });
});
