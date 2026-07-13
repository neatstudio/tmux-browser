// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderActionCenterPanel } from "../../../src/client/render/actionCenter";
import type { ActionCenterItem } from "../../../src/client/actionCenter";
import type { StructuredPresentationItem } from "../../../src/client/structuredPresentation";

function structuredItem(
  overrides: Partial<StructuredPresentationItem> = {}
): StructuredPresentationItem {
  return {
    id: "event-1",
    kind: "conversation",
    sessionName: "codex",
    title: "Tests completed",
    summary: "All focused tests passed after updating the renderer.",
    summarySource: "producer",
    status: "complete",
    severity: "info",
    attentionRequired: false,
    role: "assistant",
    toolName: null,
    parentId: null,
    messageKey: "[\"codex\",\"message-1\"]",
    parentMessageKey: null,
    details: [],
    actions: [],
    stats: { testspassed: 42, durationms: 1840 },
    createdAt: "2026-07-14T08:00:00.000Z",
    ...overrides
  };
}

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
  it("renders semantic Activity and Attention tabs with summary-first structured rows", () => {
    const root = document.createElement("div");
    const onTabChange = vi.fn();

    renderActionCenterPanel(root, {
      open: true,
      items: ITEMS,
      structuredItems: [
        structuredItem(),
        structuredItem({
          id: "event-2",
          kind: "hook",
          title: "Approval needed",
          summary: "Review the command before it runs.",
          status: "waiting",
          severity: "warning",
          attentionRequired: true,
          messageKey: null
        })
      ],
      activeTab: "activity",
      expandedIds: new Set(),
      selectedEventId: null,
      loading: false,
      error: null,
      onTabChange,
      onToggleExpanded: vi.fn(),
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    });

    const tabs = root.querySelectorAll<HTMLButtonElement>("[role='tab']");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.textContent).toContain("Activity");
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(root.textContent).toContain("Tests completed");
    expect(root.textContent).toContain("All focused tests passed");
    expect(root.textContent).toContain("Complete");
    expect(root.textContent).toContain("42 passed");
    expect(root.textContent).toContain("1.84 s");
    expect(root.querySelector("[data-action='run-hook-action']")).toBeNull();

    tabs[1]?.click();
    expect(onTabChange).toHaveBeenCalledWith("attention");
  });

  it("implements roving tab focus and wrapped keyboard selection", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const onTabChange = vi.fn();
    renderActionCenterPanel(root, {
      open: true,
      items: [],
      structuredItems: [structuredItem()],
      activeTab: "activity",
      expandedIds: new Set(),
      selectedEventId: null,
      loading: false,
      error: null,
      onTabChange,
      onToggleExpanded: vi.fn(),
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    });
    const tabs = [...root.querySelectorAll<HTMLButtonElement>("[role='tab']")];
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);

    tabs[0]!.focus();
    tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]);
    expect(onTabChange).toHaveBeenLastCalledWith("attention");

    tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(tabs[0]);
    expect(onTabChange).toHaveBeenLastCalledWith("activity");

    tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]);
    expect(onTabChange).toHaveBeenLastCalledWith("attention");
    root.remove();
  });

  it("restores focused event controls across a data revision rerender", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const detail = { type: "command" as const, collapsed: true, materialize: () => "npm test" };
    const base = {
      open: true,
      items: [],
      activeTab: "activity" as const,
      expandedIds: new Set<string>(),
      selectedEventId: null,
      loading: false,
      error: null,
      onTabChange: vi.fn(),
      onToggleExpanded: vi.fn(),
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    };
    renderActionCenterPanel(root, { ...base, structuredItems: [structuredItem({ details: [detail] })] });
    root.querySelector<HTMLButtonElement>("[data-action='toggle-structured-event']")!.focus();

    renderActionCenterPanel(root, {
      ...base,
      structuredItems: [structuredItem({ summary: "Updated realtime revision", details: [detail] })]
    });

    expect(document.activeElement).toBe(root.querySelector("[data-action='toggle-structured-event']"));
    root.remove();
  });

  it("restores a focused hook action without stealing outside focus", () => {
    const root = document.createElement("div");
    const outside = document.createElement("button");
    document.body.append(root, outside);
    const hook = structuredItem({
      id: "hook-1",
      kind: "hook",
      attentionRequired: true,
      status: "waiting",
      actions: [{
        id: "approve", label: "Approve", input: "y", open: false, target: null,
        style: "primary", effectiveTarget: null, enabled: true, disabledReason: null
      }]
    });
    const options = {
      open: true, items: [], structuredItems: [hook], activeTab: "attention" as const,
      expandedIds: new Set<string>(), selectedEventId: null, loading: false, error: null,
      onTabChange: vi.fn(), onToggleExpanded: vi.fn(), onClose: vi.fn(),
      onOpenSession: vi.fn(), onDismissPrompt: vi.fn(), onSendPrompt: vi.fn(), onRunHookAction: vi.fn()
    };
    renderActionCenterPanel(root, options);
    root.querySelector<HTMLButtonElement>("[data-action='run-hook-action']")!.focus();
    renderActionCenterPanel(root, { ...options, structuredItems: [{ ...hook, summary: "Revision two" }] });
    expect(document.activeElement).toBe(root.querySelector("[data-action='run-hook-action']"));

    outside.focus();
    renderActionCenterPanel(root, options);
    expect(document.activeElement).toBe(outside);
    root.remove();
    outside.remove();
  });

  it("shows only attention structured rows plus prompts and dead panes on Attention", () => {
    const root = document.createElement("div");
    renderActionCenterPanel(root, {
      open: true,
      items: ITEMS,
      structuredItems: [
        structuredItem(),
        structuredItem({
          id: "event-2",
          title: "Approval needed",
          summary: "Review command",
          status: "waiting",
          severity: "warning",
          attentionRequired: true
        })
      ],
      activeTab: "attention",
      expandedIds: new Set(),
      selectedEventId: "event-2",
      loading: false,
      error: null,
      onTabChange: vi.fn(),
      onToggleExpanded: vi.fn(),
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    });

    expect(root.textContent).not.toContain("Tests completed");
    expect(root.textContent).toContain("Approval needed");
    expect(root.textContent).toContain("codex waiting");
    expect(root.textContent).toContain("api pane %1 exited");
    expect(root.querySelector("[data-event-id='event-2']")?.classList).toContain("is-selected");
  });

  it("materializes structured detail payloads only after accessible expansion", () => {
    const root = document.createElement("div");
    const materialize = vi.fn(() => "npm test\n42 tests passed");
    const onToggleExpanded = vi.fn();
    const item = structuredItem({
      details: [{ type: "command", title: "Verification", collapsed: true, materialize }]
    });
    const base = {
      open: true,
      items: [],
      structuredItems: [item],
      activeTab: "activity" as const,
      selectedEventId: null,
      loading: false,
      error: null,
      onTabChange: vi.fn(),
      onToggleExpanded,
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    };

    renderActionCenterPanel(root, { ...base, expandedIds: new Set() });
    const toggle = root.querySelector<HTMLButtonElement>("[data-action='toggle-structured-event']")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(materialize).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain("npm test");
    toggle.click();
    expect(onToggleExpanded).toHaveBeenCalledWith("event-1");

    renderActionCenterPanel(root, { ...base, expandedIds: new Set(["event-1"]) });
    expect(root.querySelector("[aria-expanded='true']")).not.toBeNull();
    expect(materialize).toHaveBeenCalledOnce();
    expect(root.textContent).toContain("npm test");
  });

  it("renders corrupt structured fallbacks as read-only status rows", () => {
    const root = document.createElement("div");
    renderActionCenterPanel(root, {
      open: true,
      items: [],
      structuredItems: [structuredItem({
        id: "corrupt",
        title: "损坏的事件",
        summary: "事件数据损坏",
        status: "failed",
        severity: "error",
        attentionRequired: true,
        actions: []
      })],
      activeTab: "attention",
      expandedIds: new Set(),
      selectedEventId: null,
      loading: false,
      error: null,
      onTabChange: vi.fn(),
      onToggleExpanded: vi.fn(),
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    });

    expect(root.textContent).toContain("事件数据损坏");
    expect(root.textContent).toContain("Failed");
    expect(root.querySelector("[data-action='run-hook-action']")).toBeNull();
    expect(root.querySelector("[data-action='open-action-session']")).toBeNull();
  });

  it("renders loading, empty, and reconnect states", () => {
    const root = document.createElement("div");
    const common = {
      open: true,
      items: [],
      structuredItems: [],
      activeTab: "activity" as const,
      expandedIds: new Set<string>(),
      selectedEventId: null,
      onTabChange: vi.fn(),
      onToggleExpanded: vi.fn(),
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    };
    renderActionCenterPanel(root, { ...common, loading: true, error: null });
    expect(root.textContent).toContain("Loading activity");
    renderActionCenterPanel(root, { ...common, loading: false, error: null });
    expect(root.textContent).toContain("No activity yet");
    renderActionCenterPanel(root, { ...common, loading: false, error: "socket closed" });
    expect(root.textContent).toContain("Reconnecting");
    expect(root.textContent).toContain("socket closed");
  });
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
      onSendPrompt,
      onRunHookAction: vi.fn()
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

  it("renders multiple prompt choices with clear action labels", () => {
    const root = document.createElement("div");
    const onSendPrompt = vi.fn();

    renderActionCenterPanel(root, {
      open: true,
      items: [
        {
          type: "input-prompt",
          id: "prompt:session:codex",
          sessionName: "codex",
          promptKey: "session:codex",
          title: "codex waiting",
          snippet:
            "1. Yes, proceed (y)\n2. Yes, and don't ask again for these files (a)\n3. No, and tell Codex what to do differently (esc)",
          actions: [
            { key: "y", label: "y", input: "y\r" },
            { key: "a", label: "a", input: "a\r" },
            { key: "esc", label: "esc", input: "\u001b" },
            { key: "p", label: "p", input: "p\r" }
          ]
        },
        {
          type: "input-prompt",
          id: "prompt:session:claude",
          sessionName: "claude",
          promptKey: "session:claude",
          title: "claude waiting",
          snippet: "Continue? [y/n]",
          actions: [
            { key: "y", label: "y", input: "y\r" },
            { key: "n", label: "n", input: "n\r" }
          ]
        }
      ],
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt,
      onRunHookAction: vi.fn()
    });

    expect(root.textContent).toContain("2 actions");
    expect(root.textContent).toContain("codex waiting");
    expect(root.textContent).toContain("claude waiting");
    expect(root.textContent).toContain("Yes (y)");
    expect(root.textContent).toContain("Always (a)");
    expect(root.textContent).toContain("Esc");
    expect(root.textContent).toContain("Details (p)");
    expect(root.textContent).toContain("No (n)");

    root
      .querySelectorAll<HTMLButtonElement>("[data-action='send-prompt-action']")[1]
      ?.click();

    expect(onSendPrompt).toHaveBeenCalledWith("session:codex", "a\r");
    expect(root.querySelector(".action-center-panel")).not.toBeNull();
  });

  it("renders hook events as session-openable action cards", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();
    const onRunHookAction = vi.fn();

    renderActionCenterPanel(root, {
      open: true,
      items: [
        {
          type: "hook-event",
          id: "hook:1",
          sessionName: "codex",
          source: "codex",
          eventType: "approval-required",
          status: "waiting",
          title: "Need approval",
          body: "Approve file edit?",
          taskId: "task-1",
          target: {
            sessionName: "project-codex",
            projectName: "project",
            view: "terminal"
          },
          actions: [
            {
              id: "approve",
              label: "Approve",
              input: "y\r",
              open: false,
              target: null,
              style: "primary"
            },
            {
              id: "details",
              label: "Open details",
              input: null,
              open: true,
              target: {
                sessionName: "project-review",
                projectName: "project",
                view: "terminal"
              },
              style: "secondary"
            }
          ]
        }
      ],
      onClose: vi.fn(),
      onOpenSession,
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction
    });

    expect(root.textContent).toContain("Need approval");
    expect(root.textContent).toContain("codex");
    expect(root.textContent).toContain("waiting");
    expect(root.textContent).toContain("Approve file edit?");
    expect(root.textContent).toContain("Approve");
    expect(root.textContent).toContain("Open details");
    root
      .querySelector<HTMLButtonElement>("[data-action='open-action-session']")
      ?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='run-hook-action']")
      ?.click();

    expect(onOpenSession).toHaveBeenCalledWith("project-codex");
    expect(onRunHookAction).toHaveBeenCalledWith("hook:1", "approve");
  });

  it("renders structured hook content with collapsible code blocks", () => {
    const root = document.createElement("div");

    renderActionCenterPanel(root, {
      open: true,
      items: [
        {
          type: "hook-event",
          id: "hook:1",
          sessionName: "codex",
          source: "codex",
          eventType: "approval-required",
          status: "waiting",
          title: "Need approval",
          body: "Legacy body fallback",
          content: [
            { type: "summary", text: "Two files changed; approve patch?" },
            { type: "text", text: "The patch updates mobile hook rendering." },
            {
              type: "code",
              title: "src/app.ts",
              language: "ts",
              text: "export const answer = 42;",
              collapsed: true
            },
            {
              type: "details",
              title: "Full reason",
              text: "Long context can stay folded on mobile.",
              collapsed: true
            }
          ],
          taskId: "task-1",
          target: {
            sessionName: "project-codex",
            projectName: "project",
            view: "terminal"
          },
          actions: []
        }
      ],
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    });

    const details = [
      ...root.querySelectorAll<HTMLDetailsElement>(".hook-event-content-details")
    ];

    expect(root.textContent).toContain("Two files changed; approve patch?");
    expect(root.textContent).toContain("The patch updates mobile hook rendering.");
    expect(root.textContent).toContain("src/app.ts");
    expect(root.textContent).toContain("export const answer = 42;");
    expect(root.textContent).not.toContain("Legacy body fallback");
    expect(details).toHaveLength(2);
    expect(details[0]?.open).toBe(false);
    expect(details[0]?.dataset.contentType).toBe("code");
  });

  it("shows an empty state while open without actions", () => {
    const root = document.createElement("div");

    renderActionCenterPanel(root, {
      open: true,
      items: [],
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
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
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    });
    renderActionCenterPanel(root, {
      open: false,
      items: ITEMS,
      onClose: vi.fn(),
      onOpenSession: vi.fn(),
      onDismissPrompt: vi.fn(),
      onSendPrompt: vi.fn(),
      onRunHookAction: vi.fn()
    });

    expect(root.querySelector(".action-center-backdrop")).toBeNull();
  });
});
