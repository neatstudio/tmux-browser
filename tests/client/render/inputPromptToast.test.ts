// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderInputPromptToast } from "../../../src/client/render/inputPromptToast";
import type { InputPromptNotice } from "../../../src/client/state/inputPromptRegistry";

function notice(sessionName: string, snippet: string): InputPromptNotice {
  return {
    key: `session:${sessionName}`,
    tabId: null,
    sessionName,
    signature: `${sessionName}:${snippet}:y,a`,
    prompt: {
      snippet,
      actions: [
        { label: "y", input: "y\r" },
        { label: "a", input: "a\r" }
      ]
    }
  };
}

describe("renderInputPromptToast", () => {
  it("renders each waiting session as a separate prompt card", () => {
    const root = document.createElement("div");
    const onDismiss = vi.fn();
    const onOpen = vi.fn();
    const onSend = vi.fn();

    renderInputPromptToast(
      root,
      [
        notice("codex", "Do you want to continue? [y/a/n]"),
        notice("claude", "Apply this change? [y/a/n]")
      ],
      {
        onDismiss,
        onOpen,
        onSend
      }
    );

    const cards = root.querySelectorAll(".input-prompt-card");

    expect(cards).toHaveLength(2);
    expect(root.textContent).toContain("codex waiting");
    expect(root.textContent).toContain("claude waiting");

    cards[1]
      ?.querySelector<HTMLButtonElement>(".input-prompt-actions button")
      ?.click();

    expect(onSend).toHaveBeenCalledWith("session:claude", "y\r");
  });

  it("removes stale prompt UI when no prompts remain", () => {
    const root = document.createElement("div");
    const actions = {
      onDismiss: vi.fn(),
      onOpen: vi.fn(),
      onSend: vi.fn()
    };

    renderInputPromptToast(
      root,
      [notice("codex", "Do you want to continue? [y/a/n]")],
      actions
    );
    renderInputPromptToast(root, [], actions);

    expect(root.querySelector(".input-prompt-toast")).toBeNull();
  });
});
