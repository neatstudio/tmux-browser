import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createPreferenceStore } from "../../../../src/server/services/preferences/createPreferenceStore";

describe("createPreferenceStore", () => {
  it("persists favorite sessions to disk and normalizes names", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.setPinnedSession("build", true);
      await store.setPinnedSession(" logs ", true);
      await store.setPinnedSession("build", true);

      expect(store.getPreferences()).toEqual({
        pinnedSessionNames: ["build", "logs"],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      });
      expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({
        pinnedSessionNames: ["build", "logs"],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      });
      expect(createPreferenceStore({ filePath }).getPreferences()).toEqual({
        pinnedSessionNames: ["build", "logs"],
        mutedSessionNames: ["tmux-ui"],
        sessionSettings: {},
        kanbanProjects: []
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renames and removes favorite sessions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.setPinnedSession("build", true);
      await store.setMutedSession("build", true);
      await store.setSessionSettings("build", {
        fontSize: 18,
        fontFamily: "Menlo, monospace",
        lineHeight: 1.4,
        themeId: "paper"
      });
      await store.renameSession("build", "api");
      await store.setPinnedSession("api", false);

      expect(store.getPreferences()).toEqual({
        pinnedSessionNames: [],
        mutedSessionNames: ["api", "tmux-ui"],
        sessionSettings: {
          api: {
            fontSize: 18,
            fontFamily:
              "Menlo, PingFang SC, Hiragino Sans GB, Noto Sans Mono CJK SC, Microsoft YaHei UI, monospace",
            lineHeight: 1.4,
            themeId: "paper"
          }
        },
        kanbanProjects: []
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renames kanban session bindings when a session is renamed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.upsertKanbanProject({
        name: "xxvisa",
        path: "~/server/wwwroot/app/xxvisa-v2",
        server: null,
        agents: [
          {
            kind: "session",
            name: "build",
            command: null,
            sessionName: "build"
          },
          { kind: "pm", name: "pm", command: null }
        ]
      });

      await store.renameSession("build", "build-test");

      expect(store.getPreferences().kanbanProjects).toEqual([
        {
          name: "xxvisa",
          path: "~/server/wwwroot/app/xxvisa-v2",
          server: null,
          agents: [
            {
              kind: "session",
              name: "build",
              command: null,
              sessionName: "build-test"
            },
            { kind: "pm", name: "pm", command: null }
          ]
        }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists muted sessions and session settings for cross-client sync", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.setMutedSession("tmux-ui", false);
      await store.setMutedSession("logs", true);
      await store.setSessionSettings("build", {
        fontSize: 42,
        fontFamily: "JetBrains Mono, monospace",
        lineHeight: 0.5,
        themeId: "solar"
      });

      expect(store.getPreferences()).toEqual({
        pinnedSessionNames: [],
        mutedSessionNames: ["logs"],
        sessionSettings: {
          build: {
            fontSize: 24,
            fontFamily:
              "JetBrains Mono, PingFang SC, Hiragino Sans GB, Noto Sans Mono CJK SC, Microsoft YaHei UI, monospace",
            lineHeight: 1,
            themeId: "solar"
          }
        },
        kanbanProjects: []
      });
      expect(createPreferenceStore({ filePath }).getPreferences()).toEqual(
        store.getPreferences()
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("persists kanban projects with normalized agent definitions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.upsertKanbanProject({
        name: " XXVisa ",
        path: " ~/server/wwwroot/app/xxvisa-v2 ",
        server: " tw1 ",
        agents: [
          { kind: "claude", name: " api ", command: " claude --resume xxvisa-api " },
          { kind: "codex", name: " web ", command: "" },
          { kind: "kiro", name: "", command: "kiro" }
        ]
      });

      expect(store.getPreferences().kanbanProjects).toEqual([
        {
          name: "XXVisa",
          path: "~/server/wwwroot/app/xxvisa-v2",
          server: "tw1",
          agents: [
            {
              kind: "claude",
              name: "api",
              command: "claude --resume xxvisa-api"
            },
            {
              kind: "codex",
              name: "web",
              command: null
            }
          ]
        }
      ]);
      expect(createPreferenceStore({ filePath }).getPreferences().kanbanProjects).toEqual(
        store.getPreferences().kanbanProjects
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("removes a kanban agent by its tmux session name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.upsertKanbanProject({
        name: "xxvisa",
        path: "~/server/wwwroot/app/xxvisa-v2",
        server: null,
        agents: [
          { kind: "pm", name: "pm", command: null },
          { kind: "codex", name: "codex", command: null }
        ]
      });

      await store.removeKanbanSession("xxvisa-codex");

      expect(store.getPreferences().kanbanProjects).toEqual([
        {
          name: "xxvisa",
          path: "~/server/wwwroot/app/xxvisa-v2",
          server: null,
          agents: [{ kind: "pm", name: "pm", command: null }]
        }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds an existing tmux session to a kanban project without renaming it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.upsertKanbanProject({
        name: "xxvisa",
        path: "~/server/wwwroot/app/xxvisa-v2",
        server: null,
        agents: [{ kind: "pm", name: "pm", command: null }]
      });

      await store.addKanbanSession("xxvisa", "local-ssh");

      expect(store.getPreferences().kanbanProjects).toEqual([
        {
          name: "xxvisa",
          path: "~/server/wwwroot/app/xxvisa-v2",
          server: null,
          agents: [
            { kind: "session", name: "local-ssh", command: null, sessionName: "local-ssh" },
            { kind: "pm", name: "pm", command: null }
          ]
        }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps manually added kanban sessions during live sync by sessionName", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.upsertKanbanProject({
        name: "xxvisa",
        path: "~/server/wwwroot/app/xxvisa-v2",
        server: null,
        agents: [
          { kind: "session", name: "local-ssh", command: null, sessionName: "local-ssh" },
          { kind: "codex", name: "codex", command: null }
        ]
      });

      await store.syncKanbanSessions(["local-ssh"]);

      expect(store.getPreferences().kanbanProjects).toEqual([
        {
          name: "xxvisa",
          path: "~/server/wwwroot/app/xxvisa-v2",
          server: null,
          agents: [
            { kind: "session", name: "local-ssh", command: null, sessionName: "local-ssh" }
          ]
        }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prunes missing kanban agents against live tmux session names", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tmux-ui-preferences-"));
    const filePath = join(dir, "preferences.json");

    try {
      const store = createPreferenceStore({ filePath });

      await store.upsertKanbanProject({
        name: "xxvisa",
        path: "~/server/wwwroot/app/xxvisa-v2",
        server: null,
        agents: [
          { kind: "pm", name: "pm", command: null },
          { kind: "codex", name: "codex", command: null }
        ]
      });
      await store.upsertKanbanProject({
        name: "seo",
        path: "~/server/wwwroot/app/seo-server",
        server: null,
        agents: [{ kind: "review", name: "review", command: null }]
      });

      await store.syncKanbanSessions(["xxvisa-pm"]);

      expect(store.getPreferences().kanbanProjects).toEqual([
        {
          name: "seo",
          path: "~/server/wwwroot/app/seo-server",
          server: null,
          agents: []
        },
        {
          name: "xxvisa",
          path: "~/server/wwwroot/app/xxvisa-v2",
          server: null,
          agents: [{ kind: "pm", name: "pm", command: null }]
        }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
