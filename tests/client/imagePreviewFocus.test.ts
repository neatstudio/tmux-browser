// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  applyImagePreviewOpenFocus,
  focusImagePreviewPathInput
} from "../../src/client/imagePreviewFocus";

describe("imagePreviewFocus", () => {
  it("blurs focused mobile controls before opening the preview", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    applyImagePreviewOpenFocus("phone");

    expect(document.activeElement).toBe(document.body);
  });

  it("does not focus the path input on phones", () => {
    const input = document.createElement("input");
    const focus = vi.spyOn(input, "focus");
    const select = vi.spyOn(input, "select");

    focusImagePreviewPathInput(input, "phone");

    expect(focus).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("selects the path input on desktop", () => {
    const input = document.createElement("input");
    const focus = vi.spyOn(input, "focus");
    const select = vi.spyOn(input, "select");

    focusImagePreviewPathInput(input, "desktop");

    expect(focus).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledOnce();
  });
});
