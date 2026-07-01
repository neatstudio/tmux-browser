// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  renderKanbanCreatePanelContent
} from "../../../src/client/render/kanbanCreatePanel";

describe("renderKanbanCreatePanelContent", () => {
  it("keeps phone project creation compact while hiding the server field", () => {
    const root = document.createElement("div");

    root.append(
      renderKanbanCreatePanelContent({
        uiTier: "phone",
        draft: {
          name: "xxvisa",
          path: "~",
          server: "",
          selectedAgentNames: []
        },
        loading: false,
        onDraftChange: vi.fn(),
        onCreateProject: vi.fn()
      })
    );

    const form = root.querySelector(".kanban-create-form") as HTMLFormElement | null;
    const fieldLabels = form
      ? [...form.children].filter((child) => child.tagName === "LABEL")
      : [];

    expect(root.querySelector(".kanban-create-panel-content")?.dataset.uiTier).toBe("phone");
    expect(fieldLabels).toHaveLength(1);
    expect(fieldLabels[0]?.hidden).toBe(false);
    expect(root.querySelector(".kanban-template")).not.toBeNull();
    expect(root.querySelector(".kanban-template")?.hidden).toBe(false);
    expect(root.querySelector<HTMLInputElement>("input[name='project-path']")?.value).toBe("~");
    expect(root.querySelector("input[name='project-server']")).toBeNull();
  });

  it("keeps pad project creation compact while hiding the server field", () => {
    const root = document.createElement("div");

    root.append(
      renderKanbanCreatePanelContent({
        uiTier: "pad",
        draft: {
          name: "xxvisa",
          path: "~",
          server: "",
          selectedAgentNames: []
        },
        loading: false,
        onDraftChange: vi.fn(),
        onCreateProject: vi.fn()
      })
    );

    const form = root.querySelector(".kanban-create-form") as HTMLFormElement | null;
    const fieldLabels = form
      ? [...form.children].filter((child) => child.tagName === "LABEL")
      : [];

    expect(fieldLabels).toHaveLength(1);
    expect(fieldLabels[0]?.hidden).toBe(false);
    expect(root.querySelector(".kanban-template")?.hidden).toBe(false);
    expect(root.querySelector(".kanban-create-panel-content")?.dataset.uiTier).toBe("pad");
    expect(root.querySelector<HTMLInputElement>("input[name='project-path']")?.value).toBe("~");
    expect(root.querySelector("input[name='project-server']")).toBeNull();
  });

  it("keeps desktop project creation compact while hiding the server field", () => {
    const root = document.createElement("div");

    root.append(
      renderKanbanCreatePanelContent({
        draft: {
          name: "xxvisa",
          path: "~",
          server: "",
          selectedAgentNames: []
        },
        loading: false,
        onDraftChange: vi.fn(),
        onCreateProject: vi.fn()
      })
    );

    const form = root.querySelector(".kanban-create-form") as HTMLFormElement | null;
    const fieldLabels = form
      ? [...form.children].filter((child) => child.tagName === "LABEL")
      : [];

    expect(fieldLabels).toHaveLength(1);
    expect(fieldLabels[0]?.hidden).toBe(false);
    expect(root.querySelector(".kanban-template")?.hidden).toBe(false);
    expect(root.querySelector(".kanban-create-panel-content")?.dataset.uiTier).toBe("desktop");
    expect(root.querySelector<HTMLInputElement>("input[name='project-path']")?.value).toBe("~");
    expect(root.querySelector("input[name='project-server']")).toBeNull();
  });

  it("uses short recommended session labels in every layout tier", () => {
    const root = document.createElement("div");

    root.append(
      renderKanbanCreatePanelContent({
        uiTier: "desktop",
        draft: {
          name: "xxvisa",
          path: "~",
          server: "",
          selectedAgentNames: ["pm"]
        },
        loading: false,
        onDraftChange: vi.fn(),
        onCreateProject: vi.fn()
      })
    );

    expect(root.querySelector(".kanban-template-header p")).toBeNull();
    expect(root.querySelector(".kanban-template-info span")).toBeNull();
    expect(root.querySelector(".kanban-template-info strong")?.textContent).toBe("pm");
    expect(root.querySelector(".kanban-template-info code")?.textContent).toBe("xxvisa-pm");
  });
});
