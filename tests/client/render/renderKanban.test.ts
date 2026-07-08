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

    expect(root.querySelector("h1")?.textContent).toBe("Groups");
    expect(
      root.querySelector<HTMLDetailsElement>(".kanban-create-panel")
    ).not.toBeNull();
    expect(
      root.querySelector<HTMLElement>(".kanban-create-summary")?.textContent
    ).toContain("Create group");
    expect(root.textContent).toContain("xxvisa");
    expect(root.textContent).toContain("/srv/xxvisa");
    expect(root.textContent).toContain("tw1");
    expect(root.textContent).toContain("xxvisa-claude");
    expect(root.textContent).toContain("claude --resume xxvisa");

    const name = root.querySelector<HTMLInputElement>("input[name='project-name']")!;
    name.value = "stake";
    name.dispatchEvent(new Event("input", { bubbles: true }));

    const scratch = [...root.querySelectorAll<HTMLInputElement>(".kanban-template-item input")]
      .find((input) => input.parentElement?.textContent?.includes("scratch"))!;
    scratch.checked = true;
    scratch.dispatchEvent(new Event("change", { bubbles: true }));

    root
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(root.textContent).toContain("Recommended sessions");
    expect(root.querySelector<HTMLButtonElement>("button[type='submit']")?.textContent).toBe(
      "Create group"
    );
    expect(root.textContent).toContain("project-pm");
    expect(root.textContent).toContain("project-review");
    expect(root.textContent).toContain("project-codex");
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "stake" }),
      { render: false }
    );
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ path: "~" }),
      { render: false }
    );
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectedAgentNames: ["pm", "review", "codex", "scratch"] }),
      { render: true }
    );
    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it("shortens kanban project and session paths under the server home directory", () => {
    const root = document.createElement("div");

    renderKanban(root, {
      projects: [
        {
          name: "gemm4",
          path: "/home/gouki/server/wwwroot/gemm4",
          server: "m9",
          agents: []
        }
      ],
      sessions: [
        {
          name: "shell",
          windows: 1,
          status: "attached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "zsh",
          currentPath: "/home/gouki/server/wwwroot/gemm4",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        }
      ],
      homeDirectory: "/home/gouki",
      draft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      loading: false,
      error: null,
      availableSessions: ["shell"],
      onDraftChange: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenSession: vi.fn(),
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject: vi.fn(),
      onAddSession: vi.fn()
    });

    const projectPath = root.querySelector<HTMLElement>(".kanban-project-path")!;
    const sessionPath = root.querySelector<HTMLElement>(".kanban-ungrouped-card code")!;

    expect(projectPath.textContent).toBe("~/server/wwwroot/gemm4");
    expect(projectPath.title).toBe("/home/gouki/server/wwwroot/gemm4");
    expect(sessionPath.textContent).toBe("~/server/wwwroot/gemm4");
    expect(sessionPath.title).toBe("/home/gouki/server/wwwroot/gemm4");
    expect(root.textContent).not.toContain("/home/gouki/server/wwwroot/gemm4");
  });

  it("keeps the create group panel collapsed until a draft is being edited", () => {
    const root = document.createElement("div");

    renderKanban(root, {
      projects: [],
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
      onDeleteProject: vi.fn()
    });

    expect(root.querySelector<HTMLDetailsElement>(".kanban-create-panel")?.open).toBe(
      false
    );

    renderKanban(root, {
      projects: [],
      draft: {
        name: "xxvisa",
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
      onDeleteProject: vi.fn()
    });

    expect(root.querySelector<HTMLDetailsElement>(".kanban-create-panel")?.open).toBe(
      true
    );
  });

  it("puts the targeted project first in the kanban list", () => {
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

    expect(
      [
        ...root.querySelectorAll<HTMLElement>(".kanban-project-card")
      ].map((card) => card.dataset.projectName)
    ).toEqual(["stake", "xxvisa"]);
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
      sessions: [
        {
          name: "local-ssh",
          windows: 1,
          status: "detached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "zsh",
          currentPath: "/srv/xxvisa",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: "tail -f storage/logs/app.log\njob finished",
          inputPrompt: null
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
    const confirmPanel = root.querySelector<HTMLElement>(".kanban-kill-confirm")!;
    confirmPanel
      .querySelector<HTMLButtonElement>("[data-action='confirm-kanban-kill']")
      ?.click();
    const select = root.querySelector<HTMLSelectElement>(".kanban-add-session-select")!;
    select.value = "build";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    root
      .querySelector<HTMLFormElement>(".kanban-add-session-form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(root.textContent).toContain("local-ssh");
    expect(root.textContent).not.toContain("xxvisa-local-ssh");
    const previewImage = confirmPanel.querySelector<HTMLImageElement>(
      ".kanban-kill-preview-image"
    )!;
    expect(previewImage.alt).toContain("tail -f storage/logs/app.log");
    expect(previewImage.alt).toContain("job finished");
    expect(previewImage.src).toContain("data:image/svg+xml");
    expect(onOpenSession).toHaveBeenCalledWith("local-ssh");
    expect(onRemoveSession).toHaveBeenCalledWith("xxvisa", "local-ssh");
    expect(onKillSession).toHaveBeenCalledWith("xxvisa", "local-ssh");
    expect(onAddSession).toHaveBeenCalledWith("xxvisa", "build");
  });

  it("disables opening saved project sessions that are not currently running", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();

    renderKanban(root, {
      projects: [
        {
          name: "cc",
          path: "~",
          server: null,
          agents: [
            {
              kind: "session",
              name: "cc1-local",
              command: null,
              sessionName: "cc1-local"
            }
          ]
        }
      ],
      sessions: [{ name: "cc1-remote" } as never],
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
      onOpenSession,
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject: vi.fn()
    });

    const openButton = root.querySelector<HTMLButtonElement>(".kanban-agent-open")!;

    expect(openButton.disabled).toBe(true);
    expect(root.querySelector(".kanban-agent-card")?.classList.contains("is-offline")).toBe(
      true
    );
    expect(root.textContent).toContain("offline saved session");

    openButton.click();

    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it("shows ungrouped sessions and adds them to a selected project", () => {
    const root = document.createElement("div");
    const onOpenSession = vi.fn();
    const onAddSession = vi.fn();

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
      sessions: [
        {
          name: "build",
          windows: 1,
          status: "detached",
          lastActivityAt: null,
          paneCount: 2,
          activeWindowName: "zsh",
          currentCommand: "npm",
          currentPath: "/srv/build",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: null,
          inputPrompt: null
        }
      ],
      draft: {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: []
      },
      loading: false,
      error: null,
      availableSessions: ["build"],
      onDraftChange: vi.fn(),
      onCreateProject: vi.fn(),
      onOpenSession,
      onRemoveSession: vi.fn(),
      onKillSession: vi.fn(),
      onDeleteProject: vi.fn(),
      onAddSession
    });

    const ungrouped = root.querySelector<HTMLElement>(".kanban-ungrouped")!;
    const sessionCard = ungrouped.querySelector<HTMLElement>(
      "[data-session-name='build']"
    )!;
    const select = sessionCard.querySelector<HTMLSelectElement>(
      ".kanban-ungrouped-project-select"
    )!;

    expect(ungrouped.querySelector("h2")?.textContent).toBe("Ungrouped sessions");
    expect(sessionCard.textContent).toContain("build");
    expect(sessionCard.textContent).toContain("detached");
    expect(sessionCard.textContent).toContain("1w 2p");
    expect(sessionCard.textContent).toContain("npm");
    expect(sessionCard.textContent).toContain("/srv/build");
    expect([...select.options].map((option) => option.value)).toEqual([
      "",
      "xxvisa",
      "stake"
    ]);

    sessionCard.querySelector<HTMLButtonElement>(".kanban-ungrouped-open")?.click();
    select.value = "stake";
    sessionCard
      .querySelector<HTMLFormElement>(".kanban-ungrouped-add-form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onOpenSession).toHaveBeenCalledWith("build");
    expect(onAddSession).toHaveBeenCalledWith("stake", "build");
  });

  it("does not kill a kanban session until the preview confirmation is accepted", () => {
    const root = document.createElement("div");
    const onKillSession = vi.fn();

    renderKanban(root, {
      projects: [
        {
          name: "xxvisa",
          path: "/srv/xxvisa",
          server: null,
          agents: [
            {
              kind: "codex",
              name: "codex",
              command: null
            }
          ]
        }
      ],
      sessions: [
        {
          name: "xxvisa-codex",
          windows: 1,
          status: "attached",
          lastActivityAt: null,
          paneCount: 1,
          activeWindowName: "zsh",
          currentCommand: "zsh",
          currentPath: "/srv/xxvisa",
          gitBranch: null,
          gitDirty: null,
          paneDead: false,
          paneDeadStatus: null,
          preview: "codex is still running tests",
          inputPrompt: null
        }
      ],
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
      onKillSession,
      onDeleteProject: vi.fn()
    });

    root.querySelector<HTMLButtonElement>(".kanban-agent-kill")?.click();

    const confirmPanel = root.querySelector<HTMLElement>(".kanban-kill-confirm")!;
    const previewImage = confirmPanel.querySelector<HTMLImageElement>(
      ".kanban-kill-preview-image"
    )!;
    expect(onKillSession).not.toHaveBeenCalled();
    expect(confirmPanel.textContent).toContain("xxvisa-codex");
    expect(previewImage.alt).toContain("xxvisa-codex");
    expect(previewImage.alt).toContain("codex is still running tests");
    expect(previewImage.src).toContain("data:image/svg+xml");

    confirmPanel
      .querySelector<HTMLButtonElement>("[data-action='cancel-kanban-kill']")
      ?.click();

    expect(root.querySelector(".kanban-kill-confirm")).toBeNull();
    expect(onKillSession).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>(".kanban-agent-kill")?.click();
    root
      .querySelector<HTMLButtonElement>("[data-action='confirm-kanban-kill']")
      ?.click();

    expect(onKillSession).toHaveBeenCalledWith("xxvisa", "xxvisa-codex");
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
