import { describe, expect, it, vi } from "vitest";

import {
  createViewportWidthChangeHandler,
  getResponsiveUiTier
} from "../../src/client/responsiveUiTier";

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

  it("ignores height-only resizes caused by a mobile soft keyboard", () => {
    let width = 390;
    const onWidthChange = vi.fn();
    const handleResize = createViewportWidthChangeHandler(
      () => width,
      onWidthChange
    );

    handleResize();
    expect(onWidthChange).not.toHaveBeenCalled();

    width = 844;
    handleResize();
    expect(onWidthChange).toHaveBeenCalledTimes(1);
  });
});
