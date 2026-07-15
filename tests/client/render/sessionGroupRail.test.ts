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

    renderSessionGroupRail(
      root,
      "xxvisa-pm",
      {
        name: "xxvisa",
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" },
          { name: "xxvisa-codex", label: "codex" }
        ]
      },
      {
        onOpenSession,
        onOpenGroupTask
      }
    );

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

  it("renders every group session in order instead of replacing hidden sessions with an overflow label", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();

    renderSessionGroupRail(
      root,
      "s9",
      {
        name: "big",
        sessions: [
          { name: "s1", label: "one" },
          { name: "s2", label: "two" },
          { name: "s3", label: "three" },
          { name: "s4", label: "four" },
          { name: "s5", label: "five" },
          { name: "s6", label: "six" },
          { name: "s7", label: "seven" },
          { name: "s8", label: "eight" },
          { name: "s9", label: "nine" }
        ]
      },
      {
        onOpenSession
      }
    );

    const rail = root.querySelector<HTMLElement>(".terminal-session-rail")!;
    const buttons = [
      ...rail.querySelectorAll<HTMLButtonElement>(
        "[data-action='top-switch-kanban-session']"
      )
    ];
    expect(buttons.map((button) => button.dataset.sessionName)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
      "s6",
      "s7",
      "s8",
      "s9"
    ]);
    expect(buttons[8]?.classList.contains("is-active")).toBe(true);
    expect(rail.querySelector("[data-action='top-kanban-overflow']")).toBeNull();

    buttons[3]?.click();
    expect(onOpenSession).toHaveBeenCalledWith("s4");
  });

  it("disables switching to saved group sessions that are not currently live", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();

    renderSessionGroupRail(
      root,
      "cc1-remote",
      {
        name: "cc",
        sessions: [
          { name: "cc1-local", label: "cc1-local", live: false },
          { name: "cc1-remote", label: "cc1-remote", live: true }
        ]
      },
      { onOpenSession }
    );

    const offline = root.querySelector<HTMLButtonElement>(
      "[data-session-name='cc1-local']"
    )!;

    expect(offline.disabled).toBe(true);
    expect(offline.classList.contains("is-offline")).toBe(true);

    offline.click();

    expect(onOpenSession).not.toHaveBeenCalled();
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

  it("renders the top rail on desktop sized screens", () => {
    const root = document.createElement("div");

    renderSessionGroupRail(
      root,
      "xxvisa-pm",
      {
        name: "xxvisa",
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" }
        ]
      },
      {
        uiTier: "desktop",
        onOpenSession: vi.fn()
      }
    );

    expect(root.querySelector(".terminal-session-rail")).not.toBeNull();
    expect(root.classList.contains("has-session-rail")).toBe(true);
  });

  it("renders the top rail on phone sized screens", () => {
    const root = document.createElement("div");

    renderSessionGroupRail(
      root,
      "xxvisa-pm",
      {
        name: "xxvisa",
        sessions: [
          { name: "xxvisa-pm", label: "pm" },
          { name: "xxvisa-review", label: "review" }
        ]
      },
      {
        uiTier: "phone",
        onOpenSession: vi.fn()
      }
    );

    expect(root.querySelector(".terminal-session-rail")).not.toBeNull();
    expect(root.classList.contains("has-session-rail")).toBe(true);
  });
});
