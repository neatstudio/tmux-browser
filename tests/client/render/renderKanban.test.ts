// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { renderKanban } from "../../../src/client/render/renderKanban";

describe("renderKanban", () => {
  it("renders project agent cards and creates a project from the form", () => {
    const root = document.createElement("div");
    const onDraftChange = vi.fn();
    const onCreateProject = vi.fn();

    renderKanban(root, {
      projects: [
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: "tw1",
          agents: [
            {
              kind: "claude",
              name: "claude",
              command: "claude --resume xxvisa"
            },
            {
              kind: "codex",
              name: "codex",
              command: null
            }
          ]
        }
      ],
      draft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: ["pm", "review", "codex"]
      },
      loading: false,
      error: null,
      availableSessions: [],
      onDraftChange,
      onCreateProject,
      onOpenSession: vi.fn(),
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject: vi.fn()
    });

    expect(root.querySelector("h1")?.textContent).toBe("Kanban");
    expect(root.textContent).toContain("xxvisa");
    expect(root.textContent).toContain("/srv/xxvisa");
    expect(root.textContent).toContain("tw1");
    expect(root.textContent).toContain("xxvisa-claude");
    expect(root.textContent).toContain("claude --resume xxvisa");

    const name = root.querySelector<HTMLInputElement>("input[name='project-name']")!;
    const path = root.querySelector<HTMLInputElement>("input[name='project-path']")!;

    name.value = "stake";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    path.value = "/srv/stake";
    path.dispatchEvent(new Event("input", { bubbles: true }));

    const scratch = [...root.querySelectorAll<HTMLInputElement>(".kanban-template-item input")]
      .find((input) => input.parentElement?.textContent?.includes("scratch"))!;
    scratch.checked = true;
    scratch.dispatchEvent(new Event("change", { bubbles: true }));

    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(root.textContent).toContain("Recommended sessions");
    expect(root.textContent).toContain("project-pm");
    expect(root.textContent).toContain("project-review");
    expect(root.textContent).toContain("project-codex");
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stake" }),
      { render: false }
    );
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/srv/stake" }),
      { render: false }
    );
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedAgentNames: ["pm", "review", "codex", "scratch"] }),
      { render: true }
    );
    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it("updates text draft fields without requesting a full rerender", () => {
    const root = document.createElement("div");
    const onDraftChange = vi.fn();
    document.body.append(root);

    renderKanban(root, {
      projects: [],
      draft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      loading: false,
      error: null,
      availableSessions: [],
      onDraftChange,
      onCreateProject: vi.fn(),
      onOpenSession: vi.fn(),
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject: vi.fn()
    });

    const name = root.querySelector<HTMLInputElement>("input[name='project-name']")!;
    name.focus();
    name.value = "x";
    name.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.activeElement).toBe(name);
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "x", selectedAgentNames: [] }),
      { render: false }
    );

    root.remove();
  });

  it("submits a project even when no recommended session is selected", () => {
    const root = document.createElement("div");
    const onCreateProject = vi.fn();

    renderKanban(root, {
      projects: [],
      draft: {
        name: "solo",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      loading: false,
      error: null,
      availableSessions: [],
      onDraftChange: vi.fn(),
      onCreateProject,
      onOpenSession: vi.fn(),
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject: vi.fn()
    });

    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it("opens a project agent session from the card", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();
    const onRemoveSession = vi.fn();
    const onKillSession = vi.fn();
    const onAddSession = vi.fn();

    renderKanban(root, {
      projects: [
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: [
            {
              kind: "session",
              name: "local-ssh",
              command: null,
              sessionName: "local-ssh"
            }
          ]
        }
      ],
      draft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: ["pm", "review", "codex"]
      },
      loading: false,
      error: null,
      availableSessions: ["build", "local-ssh"],
      onDraftChange: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenSession,
      onRemoveSession,
      onKillSession,
      onDeleteProject: vi.fn(),
      onAddSession
    });

    root.querySelector<HTMLButtonElement>(".kanban-agent-open")?.click();
    root.querySelector<HTMLButtonElement>(".kanban-agent-remove")?.click();
    root.querySelector<HTMLButtonElement>(".kanban-agent-kill")?.click();
    const select = root.querySelector<HTMLSelectElement>(".kanban-add-session-select")!;
    select.value = "build";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    root
      .querySelector<HTMLFormElement>(".kanban-add-session-form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(root.textContent).toContain("local-ssh");
    expect(root.textContent).not.toContain("xxvisa-local-ssh");
    expect(onOpenSession).toHaveBeenCalledWith("local-ssh");
    expect(onRemoveSession).toHaveBeenCalledWith("xxvisa", "local-ssh");
    expect(onKillSession).toHaveBeenCalledWith("xxvisa", "local-ssh");
    expect(onAddSession).toHaveBeenCalledWith("xxvisa", "build");
  });

  it("marks and exposes a targeted project from sidebar shortcuts", () => {
    const root = document.createElement("div");

    renderKanban(root, {
      projects: [
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: []
        },
        {
          name: "stake",
          path: "/srv/stake",
          server: null,
          agents: []
        }
      ],
      targetProjectName: "stake",
      draft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      loading: false,
      error: null,
      availableSessions: [],
      onDraftChange: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenSession: vi.fn(),
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject: vi.fn()
    });

    const targeted = root.querySelector<HTMLElement>(
      "[data-project-name='stake']"
    );

    expect(targeted?.id).toBe("kanban-project-stake");
    expect(targeted?.classList.contains("is-targeted")).toBe(true);
    expect(
      root.querySelector<HTMLElement>("[data-project-name='xxvisa']")
        ?.classList.contains("is-targeted")
    ).toBe(false);
  });

  it("closes a project only after confirmation", () => {
    const root = document.createElement("div");
    const onDeleteProject = vi.fn();
    const confirm = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    renderKanban(root, {
      projects: [
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: [{ kind: "codex", name: "api", command: null }]
        }
      ],
      draft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: ["pm", "review", "codex"]
      },
      loading: false,
      error: null,
      availableSessions: [],
      onDraftChange: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenSession: vi.fn(),
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject,
      confirm
    });

    const closeButton = root.querySelector<HTMLButtonElement>(".kanban-project-close")!;
    closeButton.click();
    closeButton.click();

    expect(confirm).toHaveBeenCalledWith("Close kanban project xxvisa?");
    expect(onDeleteProject).toHaveBeenCalledTimes(1);
    expect(onDeleteProject).toHaveBeenCalledWith("xxvisa");
  });
});
