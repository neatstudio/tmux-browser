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
        path: "",
        server: "",
        agentsText: ""
      },
      loading: false,
      error: null,
      onDraftChange,
      onCreateProject,
      onOpenSession: vi.fn()
    });

    expect(root.querySelector("h1")?.textContent).toBe("Kanban");
    expect(root.textContent).toContain("xxvisa");
    expect(root.textContent).toContain("/srv/xxvisa");
    expect(root.textContent).toContain("tw1");
    expect(root.textContent).toContain("xxvisa-claude");
    expect(root.textContent).toContain("claude --resume xxvisa");

    const name = root.querySelector<HTMLInputElement>("input[name='project-name']")!;
    const path = root.querySelector<HTMLInputElement>("input[name='project-path']")!;
    const agents = root.querySelector<HTMLTextAreaElement>("textarea[name='project-agents']")!;

    name.value = "stake";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    path.value = "/srv/stake";
    path.dispatchEvent(new Event("input", { bubbles: true }));
    agents.value = "claude:claude --resume stake\ncodex";
    agents.dispatchEvent(new Event("input", { bubbles: true }));

    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stake" })
    );
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/srv/stake" })
    );
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ agentsText: "claude:claude --resume stake\ncodex" })
    );
    expect(onDraftChange).toHaveBeenLastCalledWith({
      name: "stake",
      path: "/srv/stake",
      server: "",
      agentsText: "claude:claude --resume stake\ncodex"
    });
    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it("opens a project agent session from the card", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();

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
        path: "",
        server: "",
        agentsText: ""
      },
      loading: false,
      error: null,
      onDraftChange: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenSession
    });

    root.querySelector<HTMLButtonElement>(".kanban-agent-open")?.click();

    expect(onOpenSession).toHaveBeenCalledWith("xxvisa-api");
  });
});
