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
