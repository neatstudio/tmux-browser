// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderHookEventToast,
  selectStructuredEventToasts
} from "../../../src/client/render/hookEventToast";
import type { StructuredPresentationItem } from "../../../src/client/structuredPresentation";

function hookItem(overrides: Partial<StructuredPresentationItem> = {}): StructuredPresentationItem {
  return {
    kind: "hook",
    id: "1",
    sessionName: "codex",
    status: "waiting",
    title: "Codex approval needed",
    summary: "Two files changed; approve patch?",
    summarySource: "producer",
    severity: "warning",
    attentionRequired: true,
    role: null, toolName: null, parentId: null, messageKey: null, parentMessageKey: null,
    details: [], stats: {}, createdAt: "2026-07-14T08:00:00.000Z",
    actions: [
      {
        id: "approve",
        label: "Approve",
        input: "y\r",
        open: false,
        target: null, effectiveTarget: { sessionName: "codex", projectName: null, view: "terminal" },
        style: "primary", enabled: true, disabledReason: null
      },
      {
        id: "deny",
        label: "Deny",
        input: "n\r",
        open: false,
        target: null, effectiveTarget: { sessionName: "codex", projectName: null, view: "terminal" },
        style: "danger", enabled: true, disabledReason: null
      }
    ],
    ...overrides
  };
}

describe("renderHookEventToast", () => {
  it("selects only newly arrived valuable Attention events", () => {
    const complete = hookItem({ id: "complete", status: "complete", attentionRequired: false });
    const oldAttention = hookItem({ id: "old" });
    const newAttention = hookItem({ id: "new" });
    expect(selectStructuredEventToasts(
      [complete, oldAttention, newAttention],
      new Set(["new"]),
      new Set()
    ).map((event) => event.id)).toEqual(["new"]);
  });

  it("renders the latest hook event with quick actions", () => {
    const root = document.createElement("div");
    const onDismiss = vi.fn();
    const onOpenSession = vi.fn();
    const onOpenActions = vi.fn();
    const onSendEnter = vi.fn();
    const onRunAction = vi.fn();

    renderHookEventToast(root, [hookItem()], {
      onDismiss,
      onOpenSession,
      onOpenActions,
      onSendEnter,
      onRunAction
    });

    expect(root.querySelector(".hook-event-toast")).not.toBeNull();
    expect(root.textContent).toContain("Codex approval needed");
    expect(root.textContent).toContain("codex · waiting");
    expect(root.textContent).toContain("Two files changed; approve patch?");
    expect(root.textContent).toContain("Approve");
    expect(root.textContent).toContain("Deny");

    root
      .querySelector<HTMLButtonElement>("[data-action='hook-toast-run-action']")
      ?.click();
    expect(root.querySelector("[data-action='hook-toast-open']")).toBeNull();
    root
      .querySelector<HTMLButtonElement>("[data-action='hook-toast-actions']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='hook-toast-close']")
      ?.click();

    expect(onRunAction).toHaveBeenCalledWith("1", "approve");
    expect(onSendEnter).not.toHaveBeenCalled();
    expect(onOpenSession).not.toHaveBeenCalled();
    expect(onOpenActions).toHaveBeenCalledWith("1");
    expect(onDismiss).toHaveBeenCalledWith("1");
  });

  it("uses structured summaries in the toast and hides bulky code blocks", () => {
    const root = document.createElement("div");

    renderHookEventToast(
      root,
      [
        hookItem({ summary: "Two files changed; approve patch?", details: [{
          type: "code", title: "src/app.ts", language: "ts", collapsed: true,
          materialize: () => "export const answer = 42;"
        }] })
      ],
      {
        onDismiss: vi.fn(),
        onOpenSession: vi.fn(),
        onOpenActions: vi.fn(),
        onSendEnter: vi.fn(),
        onRunAction: vi.fn()
      }
    );

    expect(root.textContent).toContain("Two files changed; approve patch?");
    expect(root.textContent).not.toContain("export const answer");
  });

  it("stays silent for ordinary complete updates and shows at most two actions", () => {
    const root = document.createElement("div");
    const handlers = { onDismiss: vi.fn(), onOpenSession: vi.fn(), onOpenActions: vi.fn(), onSendEnter: vi.fn(), onRunAction: vi.fn() };
    renderHookEventToast(root, [hookItem({ status: "complete", attentionRequired: false })], handlers);
    expect(root.querySelector(".hook-event-toast")).toBeNull();

    renderHookEventToast(root, [hookItem({ actions: [
      ...hookItem().actions,
      { id: "later", label: "Later", input: null, open: true, target: null,
        effectiveTarget: { sessionName: "codex", projectName: null, view: "terminal" },
        style: "secondary", enabled: true, disabledReason: null }
    ] })], handlers);
    expect(root.querySelectorAll("[data-action='hook-toast-run-action']")).toHaveLength(2);
  });

  it("routes View details to the unified Attention selection", () => {
    const root = document.createElement("div");
    const onOpenActions = vi.fn();
    renderHookEventToast(root, [hookItem()], {
      onDismiss: vi.fn(), onOpenSession: vi.fn(), onOpenActions,
      onSendEnter: vi.fn(), onRunAction: vi.fn()
    });
    const button = root.querySelector<HTMLButtonElement>("[data-action='hook-toast-actions']")!;
    expect(button.textContent).toBe("View details");
    button.click();
    expect(onOpenActions).toHaveBeenCalledWith("1");
  });

  it("does not invent an implicit input action when structured actions are absent", () => {
    const root = document.createElement("div");
    renderHookEventToast(root, [hookItem({ actions: [] })], {
      onDismiss: vi.fn(), onOpenSession: vi.fn(), onOpenActions: vi.fn(),
      onSendEnter: vi.fn(), onRunAction: vi.fn()
    });
    expect(root.querySelector("[data-action='hook-toast-enter']")).toBeNull();
    expect(root.querySelector("[data-action='hook-toast-actions']")).not.toBeNull();
  });

  it("renders disabled corrupt actions and danger styling without making danger first", () => {
    const root = document.createElement("div");
    renderHookEventToast(root, [hookItem({ actions: [
      hookItem().actions[1]!,
      { ...hookItem().actions[0]!, enabled: false, disabledReason: "目标会话不可用" }
    ] })], {
      onDismiss: vi.fn(), onOpenSession: vi.fn(), onOpenActions: vi.fn(),
      onSendEnter: vi.fn(), onRunAction: vi.fn()
    });
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-action='hook-toast-run-action']")];
    expect(buttons[0]?.dataset.hookActionStyle).not.toBe("danger");
    expect(buttons.find((button) => button.dataset.hookActionStyle === "danger")?.classList.contains("is-danger")).toBe(true);
    expect(buttons.find((button) => button.textContent === "Approve")?.disabled).toBe(true);
  });

  it("removes stale toast when no hook events remain", () => {
    const root = document.createElement("div");
    const handlers = {
      onDismiss: vi.fn(),
      onOpenSession: vi.fn(),
      onOpenActions: vi.fn(),
      onSendEnter: vi.fn(),
      onRunAction: vi.fn()
    };

    renderHookEventToast(root, [hookItem()], handlers);
    renderHookEventToast(root, [], handlers);

    expect(root.querySelector(".hook-event-toast")).toBeNull();
  });
});
