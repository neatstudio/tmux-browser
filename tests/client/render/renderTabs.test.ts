// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderTabs,
  updateActiveTabItem
} from "../../../src/client/render/renderTabs";

describe("renderTabs", () => {
  it("renders a fixed dashboard tab without a close button", () => {
    const root = document.createElement("div");

    renderTabs(root, [], null, {
      onSelectTab: vi.fn(),
      onCloseTab: vi.fn(),
      onTogglePin: vi.fn()
    });

    const labels = [...root.querySelectorAll("button")].map((button) =>
      button.textContent?.trim()
    );

    expect(labels).toContain("Dashboard");
    expect(labels).not.toContain("×");
  });

  it("updates active tab classes without rebuilding tab elements", () => {
    const root = document.createElement("div");
    const tabs = [
      { id: "tab-1", sessionName: "build", title: "build" },
      { id: "tab-2", sessionName: "admin", title: "admin" }
    ];

    renderTabs(root, tabs, "tab-1", {
      onSelectTab: vi.fn(),
      onCloseTab: vi.fn(),
      onTogglePin: vi.fn()
    });

    const firstTab = root.querySelector<HTMLElement>("[data-tab-id='tab-1']")!;
    const secondTab = root.querySelector<HTMLElement>("[data-tab-id='tab-2']")!;

    updateActiveTabItem(root, "tab-2");

    expect(root.querySelector("[data-tab-id='tab-1']")).toBe(firstTab);
    expect(root.querySelector("[data-tab-id='tab-2']")).toBe(secondTab);
    expect(firstTab.classList.contains("is-active")).toBe(false);
    expect(secondTab.classList.contains("is-active")).toBe(true);
  });

  it("keeps pin and close actions in a right-click context menu", () => {
    const root = document.createElement("div");
    const onCloseTab = vi.fn();
    const onTogglePin = vi.fn();

    renderTabs(
      root,
      [{ id: "tab-1", sessionName: "build", title: "build" }],
      "tab-1",
      {
        onSelectTab: vi.fn(),
        onCloseTab,
        onTogglePin
      }
    );

    expect(root.querySelector("[data-action='close-tab-1']")).toBeNull();
    expect(root.querySelector("[data-action='pin-tab-1']")).toBeNull();

    root
      .querySelector<HTMLElement>("[data-tab-id='tab-1']")
      ?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 12,
          clientY: 20
        })
      );

    expect(root.querySelector("[data-action='pin-tab-1']")).not.toBeNull();
    expect(root.querySelector("[data-action='close-tab-1']")).not.toBeNull();

    root
      .querySelector<HTMLButtonElement>("[data-action='close-tab-1']")
      ?.click();

    expect(onCloseTab).toHaveBeenCalledWith("tab-1");

    root
      .querySelector<HTMLElement>("[data-tab-id='tab-1']")
      ?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true
        })
      );
    root
      .querySelector<HTMLButtonElement>("[data-action='pin-tab-1']")
      ?.click();

    expect(onTogglePin).toHaveBeenCalledWith("tab-1");
  });

  it("does not expose close in the context menu for pinned tabs", () => {
    const root = document.createElement("div");

    renderTabs(
      root,
      [{ id: "tab-1", sessionName: "build", title: "build", pinned: true }],
      "tab-1",
      {
        onSelectTab: vi.fn(),
        onCloseTab: vi.fn(),
        onTogglePin: vi.fn()
      }
    );

    root
      .querySelector<HTMLElement>("[data-tab-id='tab-1']")
      ?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true
        })
      );

    expect(root.querySelector("[data-action='pin-tab-1']")?.textContent).toBe(
      "Unpin"
    );
    expect(root.querySelector("[data-action='close-tab-1']")).toBeNull();
  });
});
