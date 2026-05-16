// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { syncTerminalPanelVisibility } from "../../../src/client/terminal/panelVisibility";

describe("syncTerminalPanelVisibility", () => {
  it("only changes the previous and next active terminal panels", () => {
    const previous = document.createElement("div");
    const next = document.createElement("div");
    const untouched = document.createElement("div");
    const redraw = () => undefined;
    previous.classList.add("is-active");

    const activeTabId = syncTerminalPanelVisibility(
      new Map([
        ["tab-1", { panel: previous, redraw }],
        ["tab-2", { panel: next, redraw }],
        ["tab-3", { panel: untouched }]
      ]),
      "tab-1",
      "tab-2"
    );

    expect(activeTabId).toBe("tab-2");
    expect(previous.classList.contains("is-active")).toBe(false);
    expect(next.classList.contains("is-active")).toBe(true);
    expect(untouched.className).toBe("");
  });

  it("redraws the terminal when its panel becomes active", () => {
    const panel = document.createElement("div");
    const redraw = vi.fn();

    syncTerminalPanelVisibility(
      new Map([["tab-1", { panel, redraw }]]),
      null,
      "tab-1"
    );

    expect(redraw).toHaveBeenCalledOnce();
  });

  it("does nothing when the active panel has not changed", () => {
    const panel = document.createElement("div");
    const redraw = vi.fn();
    panel.classList.add("is-active");

    const activeTabId = syncTerminalPanelVisibility(
      new Map([["tab-1", { panel, redraw }]]),
      "tab-1",
      "tab-1"
    );

    expect(activeTabId).toBe("tab-1");
    expect(panel.classList.contains("is-active")).toBe(true);
    expect(redraw).not.toHaveBeenCalled();
  });
});
