// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderHookEventToast } from "../../../src/client/render/hookEventToast";
import type { ActionCenterHookEventItem } from "../../../src/client/actionCenter";

function hookItem(
  overrides: Partial<ActionCenterHookEventItem> = {}
): ActionCenterHookEventItem {
  return {
    type: "hook-event",
    id: "hook:1",
    sessionName: "codex",
    source: "codex",
    eventType: "approval-required",
    status: "waiting",
    title: "Codex approval needed",
    body: "1. Yes, proceed (y)\n2. No (esc)",
    taskId: "task-1",
    ...overrides
  };
}

describe("renderHookEventToast", () => {
  it("renders the latest hook event with quick actions", () => {
    const root = document.createElement("div");
    const onDismiss = vi.fn();
    const onOpenSession = vi.fn();
    const onOpenActions = vi.fn();
    const onSendEnter = vi.fn();

    renderHookEventToast(root, [hookItem()], {
      onDismiss,
      onOpenSession,
      onOpenActions,
      onSendEnter
    });

    expect(root.querySelector(".hook-event-toast")).not.toBeNull();
    expect(root.textContent).toContain("Codex approval needed");
    expect(root.textContent).toContain("codex · waiting");
    expect(root.textContent).toContain("Yes, proceed");

    root
      .querySelector<HTMLButtonElement>("[data-action='hook-toast-enter']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='hook-toast-open']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='hook-toast-actions']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='hook-toast-close']")
      ?.click();

    expect(onSendEnter).toHaveBeenCalledWith("hook:1");
    expect(onOpenSession).toHaveBeenCalledWith("hook:1");
    expect(onOpenActions).toHaveBeenCalledWith("hook:1");
    expect(onDismiss).toHaveBeenCalledWith("hook:1");
  });

  it("removes stale toast when no hook events remain", () => {
    const root = document.createElement("div");
    const handlers = {
      onDismiss: vi.fn(),
      onOpenSession: vi.fn(),
      onOpenActions: vi.fn(),
      onSendEnter: vi.fn()
    };

    renderHookEventToast(root, [hookItem()], handlers);
    renderHookEventToast(root, [], handlers);

    expect(root.querySelector(".hook-event-toast")).toBeNull();
  });
});
