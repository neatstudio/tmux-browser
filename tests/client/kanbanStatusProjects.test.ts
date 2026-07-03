import { describe, expect, it } from "vitest";

import {
  createKanbanStatusProjectsCache,
  getKanbanStatusProject,
  getKanbanStatusProjects
} from "../../src/client/kanbanStatusProjects";
import type {
  KanbanProject,
  SessionSummary
} from "../../src/client/api/sessionApi";

const sessions = [
  { name: "xxvisa-pm", currentCommand: "codex" },
  { name: "scratch-a", currentCommand: "zsh" },
  { name: "scratch-b", currentCommand: "claude" }
] as SessionSummary[];

const projects: KanbanProject[] = [
  {
    name: "xxvisa",
    path: "/srv/xxvisa",
    server: null,
    agents: [
      {
        kind: "session",
        name: "pm",
        command: null,
        sessionName: "xxvisa-pm"
      }
    ]
  }
];

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe("kanbanStatusProjects", () => {
  it("adds a virtual ungrouped project for live sessions outside configured projects", () => {
    expect(getKanbanStatusProjects(sessions, projects)).toEqual([
      {
        name: "xxvisa",
        virtual: false,
        sessions: [{ name: "xxvisa-pm", label: "pm", live: true }]
      },
      {
        name: "ungrouped",
        virtual: true,
        sessions: [
          { name: "scratch-a", label: "scratch-a", live: true },
          { name: "scratch-b", label: "scratch-b", live: true }
        ]
      }
    ]);
  });

  it("returns ungrouped as the current session project when no configured project owns it", () => {
    expect(getKanbanStatusProject("scratch-a", sessions, projects)).toEqual({
      name: "ungrouped",
      virtual: true,
      sessions: [
        { name: "scratch-a", label: "scratch-a", live: true },
        { name: "scratch-b", label: "scratch-b", live: true }
      ]
    });
  });

  it("keeps saved project sessions visible even when they are not currently running", () => {
    expect(
      getKanbanStatusProjects(
        [{ name: "cc1-remote" }] as SessionSummary[],
        [
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
              },
              {
                kind: "session",
                name: "cc1-remote",
                command: null,
                sessionName: "cc1-remote"
              },
              {
                kind: "session",
                name: "cc1-ssh",
                command: null,
                sessionName: "cc1-ssh"
              },
              {
                kind: "session",
                name: "xxvisa-claude",
                command: null,
                sessionName: "xxvisa-claude"
              }
            ]
          }
        ]
      )
    ).toEqual([
      {
        name: "cc",
        virtual: false,
        sessions: [
          { name: "cc1-local", label: "cc1-local", live: false },
          { name: "cc1-remote", label: "cc1-remote", live: true },
          { name: "cc1-ssh", label: "cc1-ssh", live: false },
          { name: "xxvisa-claude", label: "xxvisa-claude", live: false }
        ]
      }
    ]);
  });

  it("persists display-only kanban project sessions in storage", () => {
    const storage = new MemoryStorage();
    const cache = createKanbanStatusProjectsCache(storage);
    const projectList = getKanbanStatusProjects(sessions, projects);

    cache.write(projectList);

    expect(cache.read()).toEqual(projectList);
  });

  it("normalizes cached display projects before reading them", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "tmux-ui.kanban-status-projects.v1",
      JSON.stringify({
        projects: [
          {
            name: " local ",
            virtual: true,
            sessions: [
              { name: " local-pm ", label: " PM " },
              { name: "local-pm", label: "duplicate" },
              { name: "", label: "bad" },
              { name: "local-dev", label: "" }
            ]
          },
          {
            name: "empty",
            sessions: []
          },
          null
        ]
      })
    );

    const cache = createKanbanStatusProjectsCache(storage);

    expect(cache.read()).toEqual([
      {
        name: "local",
        virtual: true,
        sessions: [
          { name: "local-pm", label: "PM" },
          { name: "local-dev", label: "local-dev" }
        ]
      }
    ]);
  });

  it("returns an empty cache for malformed storage values", () => {
    const storage = new MemoryStorage();
    storage.setItem("tmux-ui.kanban-status-projects.v1", "{bad json");

    const cache = createKanbanStatusProjectsCache(storage);

    expect(cache.read()).toEqual([]);
  });

  it("does not persist stale grouped sessions when no sessions remain", () => {
    const storage = new MemoryStorage();
    const cache = createKanbanStatusProjectsCache(storage);

    cache.write(getKanbanStatusProjects(sessions, projects));
    cache.write([]);

    expect(cache.read()).toEqual([]);
    expect(storage.getItem("tmux-ui.kanban-status-projects.v1")).toBeNull();
  });
});
