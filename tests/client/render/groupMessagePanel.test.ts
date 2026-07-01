// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderGroupMessagePanel
} from "../../../src/client/render/groupMessagePanel";
import type { GroupMessage } from "../../../src/shared/groupMessages";

const pendingMessage: GroupMessage = {
  id: "gm-20260620-0001",
  projectName: "xxvisa",
  fromSession: "xxvisa-pm",
  toSessions: ["xxvisa-review"],
  kind: "task",
  status: "pending",
  body: "Please review checkout.",
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
  expiresAt: null,
  deliveries: [{ sessionName: "xxvisa-review", status: "sent" }],
  replies: [],
  warnings: []
};

describe("groupMessagePanel", () => {
  it("renders compose controls and submits selected target without losing textarea focus", () => {
    const root = document.createElement("div");
    const onSubmit = vi.fn();
    document.body.append(root);

    renderGroupMessagePanel(root, {
      project: {
        name: "xxvisa",
        virtual: false,
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" }
        ]
      },
      currentSessionName: "xxvisa-pm",
      messages: [],
      onSubmit,
      onScan: vi.fn(),
      onClose: vi.fn()
    });

    const textarea = root.querySelector<HTMLTextAreaElement>(
      "textarea[name='group-message-body']"
    )!;
    const target = root.querySelector<HTMLInputElement>(
      "input[name='group-message-target'][value='session:xxvisa-review']"
    )!;
    textarea.focus();
    textarea.value = "Please review checkout.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    target.checked = true;
    root.querySelector<HTMLFormElement>(".group-message-compose")!.requestSubmit();

    expect(document.activeElement).toBe(textarea);
    expect(onSubmit).toHaveBeenCalledWith({
      fromSession: "xxvisa-pm",
      kind: "task",
      target: { type: "session", sessionName: "xxvisa-review" },
      body: "Please review checkout."
    });
  });

  it("uses a compact dialog-like task composer with session pill targets", () => {
    const root = document.createElement("div");

    renderGroupMessagePanel(root, {
      project: {
        name: "ungrouped",
        virtual: true,
        sessions: [
          { name: "scratch-a", label: "scratch-a" },
          { name: "scratch-b", label: "scratch-b" }
        ]
      },
      currentSessionName: "scratch-a",
      messages: [],
      onSubmit: vi.fn(),
      onScan: vi.fn(),
      onClose: vi.fn()
    });

    const panel = root.querySelector<HTMLElement>(".group-message-panel")!;
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.querySelector(".group-message-compose-card")).not.toBeNull();
    expect(panel.querySelector(".group-message-project-badge")?.textContent).toBe(
      "ungrouped"
    );
    expect(
      [
        ...panel.querySelectorAll<HTMLLabelElement>(".group-message-target-pill")
      ].map((label) => label.textContent)
    ).toEqual(["All others", "scratch-b"]);
    expect(panel.querySelector(".group-message-kind-select")).not.toBeNull();
    expect(panel.querySelector(".group-message-body")).not.toBeNull();
    expect(panel.querySelector(".group-message-send")?.textContent).toBe("Send");
  });

  it("renders message states and scans a selected message", () => {
    const root = document.createElement("div");
    const onScan = vi.fn();

    renderGroupMessagePanel(root, {
      project: {
        name: "xxvisa",
        virtual: false,
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" }
        ]
      },
      currentSessionName: "xxvisa-pm",
      messages: [
        {
          ...pendingMessage,
          status: "replied",
          replies: [
            {
              messageId: pendingMessage.id,
              fromSession: "xxvisa-review",
              status: "done",
              body: "Reviewed.",
              capturedAt: "2026-06-20T00:01:00.000Z"
            }
          ]
        }
      ],
      onSubmit: vi.fn(),
      onScan,
      onClose: vi.fn()
    });

    expect(root.textContent).toContain("replied");
    expect(root.textContent).toContain("Reviewed.");

    root.querySelector<HTMLButtonElement>("[data-action='scan-group-message']")!.click();

    expect(onScan).toHaveBeenCalledWith(pendingMessage.id);
  });
});
