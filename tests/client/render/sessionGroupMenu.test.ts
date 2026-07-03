// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  createSessionGroupMenu,
  openSessionGroupMenu
} from "../../../src/client/render/sessionGroupMenu";

describe("sessionGroupMenu", () => {
  it("lists move targets and kill without create project entry", () => {
    const menu = createSessionGroupMenu(
      {
        currentSessionName: "build",
        projectNames: ["stake", "xxvisa"],
        currentProjectName: "xxvisa",
        onOpenKanban: vi.fn(),
        onKillSession: vi.fn(),
        onMoveKanbanSession: vi.fn(),
      },
      vi.fn(),
      "build"
    );

    expect(
      [...menu.querySelectorAll<HTMLButtonElement>("[data-action='add-session-to-project']")]
        .map((button) => button.dataset.projectName)
    ).toEqual(["xxvisa", "stake", "ungrouped"]);
    expect(menu.querySelector("[data-action='kill-session']")).not.toBeNull();
    expect(menu.querySelector(".kanban-create-panel-content")).toBeNull();
    expect(menu.querySelector("[data-action='create-project-from-session']")).toBeNull();
    expect(
      [...menu.querySelectorAll<HTMLAnchorElement>("[data-action='add-session-to-project']")].every(
        (link) => link.tagName === "A" && link.getAttribute("href") === "#"
      )
    ).toBe(true);
    expect(
      [...menu.querySelectorAll<HTMLAnchorElement>("[data-action='add-session-to-project']")].every(
        (link) => link.getAttribute("role") === "menuitem"
      )
    ).toBe(true);
    expect(menu.querySelector("[data-action='kill-session']")?.tagName).toBe("A");
    expect(menu.querySelector("[data-action='kill-session']")?.getAttribute("href")).toBe("#");
    expect(menu.querySelector("[data-action='kill-session']")?.getAttribute("role")).toBe("menuitem");
  });

  it("moves a session into an existing project without opening kanban", () => {
    const closePanel = vi.fn();
    const onMoveKanbanSession = vi.fn();
    const onOpenKanban = vi.fn();

    const menu = createSessionGroupMenu(
      {
        currentSessionName: "build",
        projectNames: ["xxvisa", "stake"],
        currentProjectName: "stake",
        onOpenKanban,
        onMoveKanbanSession
      },
      closePanel,
      "build"
    );

    menu
      .querySelector<HTMLButtonElement>(
        "[data-action='add-session-to-project'][data-project-name='xxvisa']"
      )
      ?.click();

    expect(closePanel).toHaveBeenCalledOnce();
    expect(onMoveKanbanSession).toHaveBeenCalledWith("stake", "xxvisa", "build");
    expect(onOpenKanban).not.toHaveBeenCalled();
  });

  it("moves a grouped session to ungrouped from the session menu", () => {
    const closePanel = vi.fn();
    const onMoveKanbanSession = vi.fn();

    const menu = createSessionGroupMenu(
      {
        currentSessionName: "build",
        projectNames: ["xxvisa", "stake"],
        currentProjectName: "stake",
        onOpenKanban: vi.fn(),
        onMoveKanbanSession
      },
      closePanel,
      "build"
    );

    const ungroupButton = menu.querySelector<HTMLButtonElement>(
      "[data-action='add-session-to-project'][data-project-name='ungrouped']"
    );

    expect(ungroupButton?.textContent).toBe("To ungrouped");
    ungroupButton?.click();

    expect(closePanel).toHaveBeenCalledOnce();
    expect(onMoveKanbanSession).toHaveBeenCalledWith("stake", "ungrouped", "build");
  });

  it("passes a null source project for an ungrouped session", () => {
    const closePanel = vi.fn();
    const onMoveKanbanSession = vi.fn();

    const menu = createSessionGroupMenu(
      {
        currentSessionName: "build",
        projectNames: ["stake"],
        currentProjectName: null,
        onOpenKanban: vi.fn(),
        onMoveKanbanSession
      },
      closePanel,
      "build"
    );

    menu
      .querySelector<HTMLButtonElement>(
        "[data-action='add-session-to-project'][data-project-name='stake']"
      )
      ?.click();

    expect(onMoveKanbanSession).toHaveBeenCalledWith(null, "stake", "build");
  });

  it("kills the current session from the menu", () => {
    const closePanel = vi.fn();
    const onKillSession = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const menu = createSessionGroupMenu(
      {
        currentSessionName: "build",
        projectNames: ["stake"],
        currentProjectName: "stake",
        onOpenKanban: vi.fn(),
        onMoveKanbanSession: vi.fn(),
        onKillSession
      },
      closePanel,
      "build"
    );

    menu.querySelector<HTMLButtonElement>("[data-action='kill-session']")?.click();

    expect(closePanel).toHaveBeenCalledOnce();
    expect(onKillSession).toHaveBeenCalledWith("build");
    expect(menu.querySelector("[data-action='create-project-from-session']")).toBeNull();
    confirmSpy.mockRestore();
  });

  it("does not kill when the confirm dialog is canceled", () => {
    const closePanel = vi.fn();
    const onKillSession = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const menu = createSessionGroupMenu(
      {
        currentSessionName: "build",
        projectNames: ["stake"],
        currentProjectName: "stake",
        onOpenKanban: vi.fn(),
        onMoveKanbanSession: vi.fn(),
        onKillSession
      },
      closePanel,
      "build"
    );

    menu.querySelector<HTMLButtonElement>("[data-action='kill-session']")?.click();

    expect(closePanel).toHaveBeenCalledOnce();
    expect(onKillSession).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("keeps the session group menu inside the viewport when opening near the right edge", () => {
    const root = document.createElement("div");
    const anchor = document.createElement("button");
    root.append(anchor);
    document.body.append(root);

    anchor.getBoundingClientRect = () =>
      ({
        left: 980,
        bottom: 140,
        width: 180,
        height: 24,
        right: 1160,
        top: 116
      }) as DOMRect;

    const cleanup = openSessionGroupMenu(
      root,
      anchor,
      {
        currentSessionName: "build",
        projectNames: [],
        currentProjectName: null,
        onOpenKanban: vi.fn()
      },
      "build"
    );

    const menu = root.querySelector<HTMLElement>(".session-floating-menu-session-actions")!;

    expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(menu.style.left)).toBeLessThanOrEqual(window.innerWidth);
    expect(parseFloat(menu.style.top)).toBeGreaterThanOrEqual(0);

    cleanup();
    root.remove();
  });
});
