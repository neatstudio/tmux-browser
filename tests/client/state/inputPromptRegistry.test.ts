import { describe, expect, it } from "vitest";

import { createInputPromptRegistry } from "../../../src/client/state/inputPromptRegistry";
import type { TerminalInputPrompt } from "../../../src/shared/inputPromptDetector";

function prompt(snippet: string): TerminalInputPrompt {
  return {
    snippet,
    actions: [
      { label: "y", input: "y\r" },
      { label: "a", input: "a\r" }
    ]
  };
}

describe("createInputPromptRegistry", () => {
  it("keeps prompts from multiple sessions instead of overwriting them", () => {
    const registry = createInputPromptRegistry();

    registry.setPrompt({
      tabId: null,
      sessionName: "codex",
      prompt: prompt("Do you want to continue? [y/a/n]")
    });
    registry.setPrompt({
      tabId: null,
      sessionName: "claude",
      prompt: prompt("Apply this change? [y/a/n]")
    });

    expect(registry.getPrompts().map((item) => item.sessionName)).toEqual([
      "codex",
      "claude"
    ]);
  });

  it("clears stale prompts when a session no longer reports one", () => {
    const registry = createInputPromptRegistry();

    registry.setPrompt({
      tabId: null,
      sessionName: "codex",
      prompt: prompt("Do you want to continue? [y/a/n]")
    });
    registry.setPrompt({
      tabId: null,
      sessionName: "codex",
      prompt: null
    });

    expect(registry.getPrompts()).toEqual([]);
  });

  it("clears every prompt key for a session when the session reports no prompt", () => {
    const registry = createInputPromptRegistry();

    registry.setPrompt({
      tabId: null,
      sessionName: "codex",
      prompt: prompt("Do you want to continue? [y/a/n]")
    });
    registry.setPrompt({
      tabId: "tab-1",
      sessionName: "codex",
      prompt: null
    });

    expect(registry.getPrompts()).toEqual([]);
  });

  it("replaces a session-level prompt with the tab-backed prompt for the same session", () => {
    const registry = createInputPromptRegistry();

    registry.setPrompt({
      tabId: null,
      sessionName: "codex",
      prompt: prompt("Do you want to continue? [y/a/n]")
    });
    registry.setPrompt({
      tabId: "tab-1",
      sessionName: "codex",
      prompt: prompt("Do you want to approve? [y/a/n]")
    });

    expect(registry.getPrompts()).toMatchObject([
      {
        key: "tab:tab-1",
        tabId: "tab-1",
        sessionName: "codex",
        prompt: {
          snippet: "Do you want to approve? [y/a/n]"
        }
      }
    ]);
  });
});
