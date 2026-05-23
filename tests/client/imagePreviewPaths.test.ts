// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { getVisibleImagePaths } from "../../src/client/imagePreviewPaths";

describe("getVisibleImagePaths", () => {
  it("extracts image paths from current visible terminal text only", () => {
    expect(
      getVisibleImagePaths(
        [
          "created ./screenshot.png",
          "open /tmp/report.webp, then /tmp/report.webp again",
          "ignore README.md"
        ].join("\n")
      )
    ).toEqual(["./screenshot.png", "/tmp/report.webp"]);
  });

  it("does not invent a previous preview path when no image is visible", () => {
    localStorage.setItem(
      "browser-tmux-dashboard.image-preview-path",
      "/tmp/stale.png"
    );

    expect(getVisibleImagePaths("no current image output")).toEqual([]);
  });
});
