import { describe, expect, it } from "vitest";

import { getResponsiveSessionDefaults } from "../../src/client/responsiveSessionSettings";

describe("getResponsiveSessionDefaults", () => {
  it("uses compact terminal typography on phones", () => {
    expect(getResponsiveSessionDefaults(390)).toMatchObject({
      fontSize: 11,
      lineHeight: 1
    });
  });

  it("uses medium terminal typography on tablets", () => {
    expect(getResponsiveSessionDefaults(768)).toMatchObject({
      fontSize: 12,
      lineHeight: 1
    });
  });

  it("uses larger terminal typography on desktop screens", () => {
    expect(getResponsiveSessionDefaults(1280)).toMatchObject({
      fontSize: 13,
      lineHeight: 1
    });
  });
});
