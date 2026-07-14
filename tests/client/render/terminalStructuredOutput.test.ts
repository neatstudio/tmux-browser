// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderTerminalStructuredOutput
} from "../../../src/client/render/terminalStructuredOutput";
import type { TerminalStructuredOutputItem } from "../../../src/client/terminal/structuredOutput";

function item(
  overrides: Partial<TerminalStructuredOutputItem> = {}
): TerminalStructuredOutputItem {
  return {
    id: "message-1",
    kind: "conversation",
    sessionName: "project-codex",
    title: "助手",
    summary: "Focused tests passed",
    summarySource: "producer",
    status: "complete",
    severity: "info",
    attentionRequired: false,
    role: "assistant",
    toolName: null,
    parentId: null,
    messageKey: "[\"project-codex\",\"message-1\"]",
    parentMessageKey: null,
    details: [{
      type: "text",
      collapsed: true,
      materialize: () => "Full response with implementation details."
    }],
    actions: [],
    stats: { testspassed: 3 },
    createdAt: "2026-07-14T08:00:00.000Z",
    ...overrides
  };
}

describe("renderTerminalStructuredOutput", () => {
  it("shows compact summaries by default and expands the complete record on demand", () => {
    const root = document.createElement("div");
    const onToggleExpanded = vi.fn();

    renderTerminalStructuredOutput(root, {
      items: [item()],
      view: "agent-output",
      expandedIds: new Set(),
      onViewChange: vi.fn(),
      onToggleExpanded
    });

    expect(root.classList.contains("has-agent-output")).toBe(true);
    expect(root.textContent).toContain("Focused tests passed");
    expect(root.textContent).toContain("3 passed");
    expect(root.textContent).not.toContain("Full response with implementation details.");

    root.querySelector<HTMLButtonElement>("[data-action='toggle-terminal-output']")?.click();
    expect(onToggleExpanded).toHaveBeenCalledWith("message-1");

    renderTerminalStructuredOutput(root, {
      items: [item()],
      view: "agent-output",
      expandedIds: new Set(["message-1"]),
      onViewChange: vi.fn(),
      onToggleExpanded
    });

    expect(root.textContent).toContain("Full response with implementation details.");
  });

  it("renders failure reasons and lets the user restore the raw terminal", () => {
    const root = document.createElement("div");
    const onViewChange = vi.fn();

    renderTerminalStructuredOutput(root, {
      items: [item({
        id: "failed-message",
        status: "failed",
        severity: "error",
        summary: "npm test failed: snapshot mismatch"
      })],
      view: "agent-output",
      expandedIds: new Set(),
      onViewChange,
      onToggleExpanded: vi.fn()
    });

    expect(root.textContent).toContain("npm test failed: snapshot mismatch");
    root.querySelector<HTMLButtonElement>("[data-action='show-raw-terminal']")?.click();
    expect(onViewChange).toHaveBeenCalledWith("raw-terminal");

    renderTerminalStructuredOutput(root, {
      items: [item()],
      view: "raw-terminal",
      expandedIds: new Set(),
      onViewChange,
      onToggleExpanded: vi.fn()
    });

    root.querySelector<HTMLButtonElement>("[data-action='show-agent-output']")?.click();
    expect(onViewChange).toHaveBeenCalledWith("agent-output");
  });

  it("removes the view when a session has no structured Agent output", () => {
    const root = document.createElement("div");
    root.classList.add("has-agent-output");
    root.append(document.createElement("section"));

    renderTerminalStructuredOutput(root, {
      items: [],
      view: "agent-output",
      expandedIds: new Set(),
      onViewChange: vi.fn(),
      onToggleExpanded: vi.fn()
    });

    expect(root.classList.contains("has-agent-output")).toBe(false);
    expect(root.querySelector(".terminal-structured-output")).toBeNull();
  });
});
