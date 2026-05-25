// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderActionCenterPanel } from "../../../src/client/render/actionCenter";
import type { ActionCenterItem } from "../../../src/client/actionCenter";

const ITEMS: ActionCenterItem[] = [
  {
    type: "input-prompt",
    id: "prompt:session:codex",
    sessionName: "codex",
    promptKey: "session:codex",
    title: "codex waiting",
    snippet: "Yes, proceed?",
    actions: [{ key: "y", label: "Yes", input: "y" }]
  },
  {
    type: "dead-pane",
    id: "dead-pane:api:%1",
    sessionName: "api",
    paneId: "%1",
    title: "api pane %1 exited",
    status: 1
  }
];

describe("renderActionCenterPanel", () => {
  it("renders actionable prompt and dead-pane items", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();
    const onDismissPrompt = vi.fn();
    const onSendPrompt = vi.fn();
    const onClose = vi.fn();

    renderActionCenterPanel(root, {
      open: true,
      items: ITEMS,
      onClose,
      onOpenSession,
      onDismissPrompt,
      onSendPrompt
    });

    expect(root.querySelector(".action-center-panel")).not.toBeNull();
    expect(root.textContent).toContain("Action Center");
    expect(root.textContent).toContain("2 actions");
    expect(root.textContent).toContain("codex waiting");
    expect(root.textContent).toContain("Yes, proceed?");
    expect(root.textContent).toContain("api pane %1 exited");

    root
      .querySelector<HTMLButtonElement>("[data-action='send-prompt-action']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='dismiss-prompt']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='open-action-session']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='close-action-center']")
      ?.click();

    expect(onSendPrompt).toHaveBeenCalledWith("session:codex", "y");
    expect(onDismissPrompt).toHaveBeenCalledWith("session:codex");
    expect(onOpenSession).toHaveBeenCalledWith("codex");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an empty state while open without actions", () => {
    const root = document.createElement("div");

    renderActionCenterPanel(root, {
      open: true,
      items: [],
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn()
    });

    expect(root.textContent).toContain("No pending actions");
  });

  it("removes the panel when closed", () => {
    const root = document.createElement("div");

    renderActionCenterPanel(root, {
      open: true,
      items: ITEMS,
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn()
    });
    renderActionCenterPanel(root, {
      open: false,
      items: ITEMS,
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn()
    });

    expect(root.querySelector(".action-center-backdrop")).toBeNull();
  });
});
