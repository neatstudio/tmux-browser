import { describe, expect, it } from "vitest";

import { createTerminalStructuredOutputState } from "../../../src/client/terminal/structuredOutputState";

describe("createTerminalStructuredOutputState", () => {
  it("defaults to Agent output only when the tab has structured records", () => {
    const state = createTerminalStructuredOutputState();

    expect(state.getView("tab-1", false)).toBe("raw-terminal");
    expect(state.getView("tab-1", true)).toBe("agent-output");
  });

  it("keeps an explicit raw-terminal choice through realtime revisions", () => {
    const state = createTerminalStructuredOutputState();

    state.setView("tab-1", "raw-terminal");
    state.toggleExpanded("tab-1", "message-1");
    state.reconcile("tab-1", ["message-1"]);

    expect(state.getView("tab-1", true)).toBe("raw-terminal");
    expect(state.getExpandedIds("tab-1")).toEqual(new Set(["message-1"]));
  });

  it("drops expansion state only when the record is no longer present", () => {
    const state = createTerminalStructuredOutputState();

    state.toggleExpanded("tab-1", "message-1");
    state.toggleExpanded("tab-1", "message-2");
    state.reconcile("tab-1", ["message-2"]);

    expect(state.getExpandedIds("tab-1")).toEqual(new Set(["message-2"]));
  });
});
