// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderTerminalStructuredOutput
} from "../../../src/client/render/terminalStructuredOutput";
import type {
  TerminalAgentTranscript,
  TerminalStructuredOutputItem
} from "../../../src/client/terminal/structuredOutput";

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
  it("keeps transcript narration visible and expands process records on demand", () => {
    const root = document.createElement("div");
    const onToggleExpanded = vi.fn();
    const transcript: TerminalAgentTranscript = {
      blocks: [
        { id: "narrative:0", kind: "narrative", text: "• Ctrl+C 映射已恢复。" },
        {
          id: "activity:1",
          kind: "activity",
          title: "Ran npm test",
          text: "✓ 65 tests passed"
        }
      ]
    };

    renderTerminalStructuredOutput(root, {
      items: [],
      transcript,
      view: "agent-output",
      expandedIds: new Set(),
      onViewChange: vi.fn(),
      onToggleExpanded
    });

    expect(root.textContent).toContain("Ctrl+C 映射已恢复。");
    expect(root.textContent).toContain("Ran npm test");
    expect(root.textContent).not.toContain("65 tests passed");

    root.querySelector<HTMLButtonElement>("[data-action='toggle-terminal-transcript']")?.click();
    expect(onToggleExpanded).toHaveBeenCalledWith("activity:1");

    renderTerminalStructuredOutput(root, {
      items: [],
      transcript,
      view: "agent-output",
      expandedIds: new Set(["activity:1"]),
      onViewChange: vi.fn(),
      onToggleExpanded
    });

    expect(root.textContent).toContain("✓ 65 tests passed");
  });

  it("preserves xterm foreground and font attributes in transcript details", () => {
    const root = document.createElement("div");
    const transcript: TerminalAgentTranscript = {
      blocks: [{
        id: "activity:styled",
        kind: "activity",
        title: "Ran",
        text: "Ran npm test\n✓ 852 tests passed"
      }]
    };
    Object.assign(transcript.blocks[0]!, {
      styledLines: [{
        absoluteLine: 42,
        spans: [{ text: "• Ran npm test", style: { color: "#92d192", bold: true } }]
      }, {
        absoluteLine: 43,
        spans: [{ text: "✓ 852 tests passed", style: { color: "#8bb8ff", italic: true, dim: true } }]
      }]
    });

    renderTerminalStructuredOutput(root, {
      items: [],
      transcript,
      view: "agent-output",
      expandedIds: new Set(["activity:styled"]),
      onViewChange: vi.fn(),
      onToggleExpanded: vi.fn()
    });

    const spans = root.querySelectorAll<HTMLElement>(".terminal-agent-transcript-detail span");
    expect(spans).toHaveLength(2);
    const toggle = root.querySelector<HTMLElement>("[data-action='toggle-terminal-transcript']");
    expect(toggle?.style.color).toBe("rgb(146, 209, 146)");
    expect(toggle?.style.fontWeight).toBe("700");
    expect(spans[0]?.style.color).toBe("rgb(146, 209, 146)");
    expect(spans[0]?.style.fontWeight).toBe("700");
    expect(spans[1]?.style.color).toBe("rgb(139, 184, 255)");
    expect(spans[1]?.style.fontStyle).toBe("italic");
    expect(spans[1]?.style.opacity).toBe("0.65");
  });

  it("renders styled narration with its physical blank lines intact", () => {
    const root = document.createElement("div");
    const transcript: TerminalAgentTranscript = {
      blocks: [{
        id: "narrative:styled-blank",
        kind: "narrative",
        text: "First conclusion\n\n\nSecond conclusion",
        styledLines: [
          { absoluteLine: 60, spans: [{ text: "First conclusion", style: { color: "#8bb8ff" } }] },
          { absoluteLine: 61, spans: [] },
          { absoluteLine: 62, spans: [] },
          { absoluteLine: 63, spans: [{ text: "Second conclusion", style: { color: "#92d192" } }] }
        ]
      }]
    };

    renderTerminalStructuredOutput(root, {
      items: [],
      transcript,
      view: "agent-output",
      expandedIds: new Set(),
      onViewChange: vi.fn(),
      onToggleExpanded: vi.fn()
    });

    expect(root.querySelector(".terminal-agent-transcript-narrative")?.textContent)
      .toBe("First conclusion\n\n\nSecond conclusion");
  });

  it("compresses process-internal blank lines inside an activity group", () => {
    const root = document.createElement("div");
    const onToggleExpanded = vi.fn();
    const transcript: TerminalAgentTranscript = {
      blocks: [
        { id: "activity:ran", kind: "activity", groupId: "group:0", title: "Ran", text: "Ran npm test" },
        { id: "blank:0", kind: "narrative", text: "", blankLineCount: 2 },
        { id: "activity:ran-2", kind: "activity", groupId: "group:0", title: "Ran", text: "Ran lint" },
        { id: "blank:1", kind: "narrative", text: "", blankLineCount: 1 },
        { id: "activity:ran-3", kind: "activity", groupId: "group:0", title: "Ran", text: "Ran build" },
        { id: "narrative:0", kind: "narrative", text: "The next update is separate." },
        { id: "activity:edited", kind: "activity", groupId: "group:1", title: "Edited", text: "Updated styles.css" }
      ]
    };

    renderTerminalStructuredOutput(root, {
      items: [],
      transcript,
      view: "agent-output",
      expandedIds: new Set(),
      onViewChange: vi.fn(),
      onToggleExpanded
    });

    const groups = root.querySelectorAll<HTMLElement>(
      ".terminal-agent-transcript-activity-group"
    );
    const buttons = groups[0]?.querySelectorAll<HTMLButtonElement>(
      "[data-action='toggle-terminal-transcript']"
    );

    expect(groups).toHaveLength(2);
    expect(buttons).toHaveLength(3);
    expect([...groups[0]!.children].map((child) => child.tagName)).toEqual([
      "BUTTON",
      "BUTTON",
      "BUTTON"
    ]);
    expect(groups[0]?.querySelector(".terminal-agent-transcript-blank")).toBeNull();
    expect(buttons?.[0]?.textContent).toBe("Ran");
    expect(buttons?.[0]?.getAttribute("aria-expanded")).toBe("false");
    expect(buttons?.[1]?.textContent).toBe("Ran");
    expect(buttons?.[1]?.getAttribute("aria-expanded")).toBe("false");
    expect(groups[0]?.querySelectorAll(".terminal-agent-transcript-detail")).toHaveLength(0);
    expect(groups[1]?.querySelectorAll(".terminal-agent-transcript-detail")).toHaveLength(0);
    const narrative = root.querySelector<HTMLElement>(".terminal-agent-transcript-narrative");
    expect(buttons?.[0]?.hasAttribute("aria-controls")).toBe(false);
    expect(buttons?.[1]?.hasAttribute("aria-controls")).toBe(false);
    expect(narrative?.textContent).toBe("The next update is separate.");

    buttons?.[0]?.click();
    expect(onToggleExpanded).toHaveBeenCalledWith("activity:ran");

    renderTerminalStructuredOutput(root, {
      items: [],
      transcript,
      view: "agent-output",
      expandedIds: new Set(["activity:ran"]),
      onViewChange: vi.fn(),
      onToggleExpanded
    });
    const expandedGroup = root.querySelector(".terminal-agent-transcript-activity-group");
    expect(expandedGroup?.querySelectorAll(".terminal-agent-transcript-blank")).toHaveLength(2);
    expect(expandedGroup?.querySelectorAll(".terminal-agent-transcript-detail")).toHaveLength(1);
  });

  it("scopes transcript detail ids to their renderer root", () => {
    const firstRoot = document.createElement("div");
    const secondRoot = document.createElement("div");
    const transcript: TerminalAgentTranscript = {
      blocks: [{
        id: "activity:shared",
        kind: "activity",
        title: "Ran",
        text: "Ran npm test"
      }]
    };

    for (const root of [firstRoot, secondRoot]) {
      renderTerminalStructuredOutput(root, {
        items: [],
        transcript,
        view: "agent-output",
        expandedIds: new Set(["activity:shared"]),
        onViewChange: vi.fn(),
        onToggleExpanded: vi.fn()
      });
    }

    const firstButton = firstRoot.querySelector("[data-action='toggle-terminal-transcript']");
    const secondButton = secondRoot.querySelector("[data-action='toggle-terminal-transcript']");
    const firstDetail = firstRoot.querySelector(".terminal-agent-transcript-detail");
    const secondDetail = secondRoot.querySelector(".terminal-agent-transcript-detail");
    expect(firstButton?.getAttribute("aria-controls")).toBe(firstDetail?.id);
    expect(secondButton?.getAttribute("aria-controls")).toBe(secondDetail?.id);
    expect(firstDetail?.id).not.toBe(secondDetail?.id);
  });

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

  it("hides the Agent output restore control when the view is unavailable", () => {
    const root = document.createElement("div");

    renderTerminalStructuredOutput(root, {
      items: [item()],
      view: "raw-terminal",
      agentOutputAvailable: false,
      expandedIds: new Set(),
      onViewChange: vi.fn(),
      onToggleExpanded: vi.fn()
    });

    expect(root.querySelector("[data-action='show-agent-output']")).toBeNull();
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
