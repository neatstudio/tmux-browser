import { describe, expect, it } from "vitest";

import { detectTerminalInputPrompt } from "../../../src/client/terminal/inputPromptDetector";

describe("detectTerminalInputPrompt", () => {
  it("detects command-line confirmation prompts with y/a choices", () => {
    expect(
      detectTerminalInputPrompt(
        "The command requires approval.\nDo you want to continue? [y/a/n]"
      )
    ).toEqual({
      snippet: "Do you want to continue? [y/a/n]",
      actions: [
        { label: "y", input: "y\r" },
        { label: "a", input: "a\r" },
        { label: "Enter", input: "\r" }
      ]
    });
  });

  it("detects press-enter waits from terminal apps", () => {
    const prompt = detectTerminalInputPrompt(
      "Build finished.\nPress Enter to continue"
    );

    expect(prompt?.actions.map((action) => action.label)).toEqual(["Enter"]);
  });

  it("shows only the current visible prompt instead of stale earlier prompts", () => {
    const prompt = detectTerminalInputPrompt(
      [
        "Old prompt: continue? [y/a/n]",
        "Some unrelated output",
        "Another unrelated line",
        "Do you want to continue? [y/a/n]"
      ].join("\n")
    );

    expect(prompt?.snippet).toBe("Do you want to continue? [y/a/n]");
  });

  it("keeps split prompt questions and choices together", () => {
    const prompt = detectTerminalInputPrompt(
      "Apply this command to all matching sessions?\n[y/a/n]"
    );

    expect(prompt?.snippet).toBe(
      "Apply this command to all matching sessions?\n[y/a/n]"
    );
  });

  it("ignores normal terminal output without user-input markers", () => {
    expect(detectTerminalInputPrompt("npm run build\nDone in 812ms")).toBeNull();
  });
});
