// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderSessionGroupRail
} from "../../../src/client/render/sessionGroupRail";

describe("sessionGroupRail", () => {
  it("renders same-project sessions as a top rail before the terminal frame", () => {
    const root = document.createElement("div");
    const frame = document.createElement("div");
    const onOpenSession = vi.fn();
    const onOpenGroupTask = vi.fn();
    frame.className = "terminal-frame";
    root.append(frame);

    renderSessionGroupRail(root, "xxvisa-pm", {
      name: "xxvisa",
      sessions: [
        { name: "xxvisa-pm", label: "pm" },
        { name: "xxvisa-review", label: "review" },
        { name: "xxvisa-codex", label: "codex" }
      ]
    }, {
      onOpenSession,
      onOpenGroupTask
    });

    const rail = root.querySelector<HTMLElement>(".terminal-session-rail")!;
    const buttons = [
      ...rail.querySelectorAll<HTMLButtonElement>(
        "[data-action='top-switch-kanban-session']"
      )
    ];

    expect(root.firstElementChild).toBe(rail);
    expect(rail.getAttribute("aria-label")).toBe("Sessions in Kanban project xxvisa");
    expect(rail.querySelector(".terminal-session-rail-project")?.textContent).toBe(
      "xxvisa"
    );
    expect(buttons.map((button) => button.textContent)).toEqual([
      "pm",
      "review",
      "codex"
    ]);
    expect(buttons[0]?.classList.contains("is-active")).toBe(true);

    buttons[0]?.click();
    buttons[1]?.click();

    expect(onOpenSession).toHaveBeenCalledTimes(1);
    expect(onOpenSession).toHaveBeenCalledWith("xxvisa-review");

    rail.querySelector<HTMLButtonElement>(
      "[data-action='top-open-group-task']"
    )!.click();
    expect(onOpenGroupTask).toHaveBeenCalledOnce();
  });

  it("keeps group session order stable while still highlighting the current session", () => {
    const root = document.createElement("div");

    renderSessionGroupRail(root, "s5", {
      name: "big",
      sessions: [
        { name: "s1", label: "one" },
        { name: "s2", label: "two" },
        { name: "s3", label: "three" },
        { name: "s4", label: "four" },
        { name: "s5", label: "five" }
      ]
    }, {
      maxVisibleSessions: 3,
      onOpenSession: vi.fn()
    });

    const rail = root.querySelector<HTMLElement>(".terminal-session-rail")!;
    const buttons = [
      ...rail.querySelectorAll<HTMLButtonElement>(
        "[data-action='top-switch-kanban-session']"
      )
    ];
    const overflow = rail.querySelector<HTMLElement>(
      "[data-action='top-kanban-overflow']"
    )!;

    expect(buttons.map((button) => button.dataset.sessionName)).toEqual([
      "s1",
      "s2",
      "s5"
    ]);
    expect(buttons[2]?.classList.contains("is-active")).toBe(true);
    expect(overflow.textContent).toBe("+2");
    expect(overflow.title).toContain("three");
    expect(overflow.title).toContain("four");
  });

  it("removes the top rail when the current session is not in a group", () => {
    const root = document.createElement("div");

    renderSessionGroupRail(root, "xxvisa-pm", {
      name: "xxvisa",
      sessions: [
        { name: "xxvisa-pm", label: "pm" },
        { name: "xxvisa-review", label: "review" }
      ]
    });
    expect(root.querySelector(".terminal-session-rail")).not.toBeNull();
    expect(root.classList.contains("has-session-rail")).toBe(true);

    renderSessionGroupRail(root, "xxvisa-pm", null);

    expect(root.querySelector(".terminal-session-rail")).toBeNull();
    expect(root.classList.contains("has-session-rail")).toBe(false);
  });
});
