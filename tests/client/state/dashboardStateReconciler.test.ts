import { describe, expect, it } from "vitest";
import type { DashboardState } from "../../../src/client/state/dashboardStore";
import { reconcileDashboardState } from "../../../src/client/state/dashboardStateReconciler";

const state = (): DashboardState => ({
  sessions: [
    {
      name: "build",
      windows: 2,
      status: "attached",
      lastActivityAt: 42,
      paneCount: 1,
      activeWindowName: "editor",
      currentCommand: "codex",
      runtimeKind: "codex",
      currentPath: "/repo",
      gitBranch: "main",
      gitDirty: false,
      paneDead: false,
      paneDeadStatus: null,
      preview: "ready",
      inputPrompt: {
        snippet: "Continue? [y/n]",
        actions: [{ label: "y", input: "y\r" }]
      },
      panes: [
        {
          sessionName: "build",
          paneId: "%1",
          windowIndex: 0,
          windowName: "editor",
          windowActive: true,
          paneIndex: 0,
          paneActive: true,
          currentCommand: "codex",
          runtimeKind: "codex",
          currentPath: "/repo",
          paneDead: false,
          paneDeadStatus: null,
          panePid: 123,
          paneLeft: 0,
          paneTop: 0,
          paneWidth: 120,
          paneHeight: 40
        }
      ]
    }
  ],
  serverStatus: {
    platform: "darwin",
    cpuCount: 8,
    loadAverage: [1, 2, 3],
    loadPercent: 25,
    memoryTotalBytes: 1000,
    memoryFreeBytes: 400,
    memoryUsedPercent: 60,
    uptimeSeconds: 99,
    homeDirectory: "/Users/test"
  },
  kanbanProjects: [
    {
      name: "project",
      path: "/repo",
      server: "local",
      agents: [
        { kind: "codex", name: "review", command: "codex", sessionName: "build" }
      ]
    }
  ],
  timelineEvents: [
    {
      id: "message-1",
      type: "conversation-message",
      messageId: "message-1",
      sessionName: "build",
      role: "assistant",
      contentType: "text",
      content: "done",
      summary: "done",
      status: "complete",
      createdAt: "2026-07-16T01:00:00.000Z",
      revision: 2,
      updatedAt: "2026-07-16T01:00:01.000Z",
      toolName: null,
      parentMessageId: null,
      metadata: { durationms: 10 }
    }
  ],
  timelineNextCursor: "older",
  timelineHistoryExpired: false,
  loading: false,
  error: null
});

describe("reconcileDashboardState", () => {
  it("reuses every field-equal nested object and array", () => {
    const previous = state();
    const next = structuredClone(previous);

    const reconciled = reconcileDashboardState(previous, next);

    expect(reconciled).toBe(previous);
    expect(reconciled.serverStatus).toBe(previous.serverStatus);
    expect(reconciled.serverStatus?.loadAverage).toBe(previous.serverStatus?.loadAverage);
    expect(reconciled.kanbanProjects).toBe(previous.kanbanProjects);
    expect(reconciled.kanbanProjects[0]).toBe(previous.kanbanProjects[0]);
    expect(reconciled.kanbanProjects[0]?.agents).toBe(previous.kanbanProjects[0]?.agents);
    expect(reconciled.kanbanProjects[0]?.agents[0]).toBe(previous.kanbanProjects[0]?.agents[0]);
    expect(reconciled.sessions).toBe(previous.sessions);
    expect(reconciled.sessions[0]).toBe(previous.sessions[0]);
    expect(reconciled.sessions[0]?.inputPrompt).toBe(previous.sessions[0]?.inputPrompt);
    expect(reconciled.sessions[0]?.inputPrompt?.actions).toBe(previous.sessions[0]?.inputPrompt?.actions);
    expect(reconciled.sessions[0]?.panes).toBe(previous.sessions[0]?.panes);
    expect(reconciled.sessions[0]?.panes?.[0]).toBe(previous.sessions[0]?.panes?.[0]);
    expect(reconciled.timelineEvents).toBe(previous.timelineEvents);
    expect(reconciled.timelineEvents?.[0]).toBe(previous.timelineEvents?.[0]);
  });

  it("reuses keyed entities when new sessions and timeline events are inserted", () => {
    const previous = state();
    const next = structuredClone(previous);
    next.sessions.unshift({
      ...structuredClone(next.sessions[0]!),
      name: "new-session"
    });
    next.timelineEvents!.unshift({
      id: "new-event",
      type: "session-created",
      sessionName: "new-session",
      message: "created",
      createdAt: "2026-07-16T01:01:00.000Z"
    });

    const reconciled = reconcileDashboardState(previous, next);

    expect(reconciled.sessions[1]).toBe(previous.sessions[0]);
    expect(reconciled.timelineEvents?.[1]).toBe(previous.timelineEvents?.[0]);
  });

  it.each([
    ["server status", (next: DashboardState) => { next.serverStatus!.uptimeSeconds += 1; }],
    ["kanban agent", (next: DashboardState) => { next.kanbanProjects[0]!.agents[0]!.command = "claude"; }],
    ["session runtime", (next: DashboardState) => { next.sessions[0]!.runtimeKind = "claude"; }],
    ["prompt action", (next: DashboardState) => { next.sessions[0]!.inputPrompt!.actions[0]!.input = "n\r"; }],
    ["pane geometry", (next: DashboardState) => { next.sessions[0]!.panes![0]!.paneWidth = 80; }],
    ["timeline revision", (next: DashboardState) => { const event = next.timelineEvents![0]!; if (event.type === "conversation-message") event.revision += 1; }],
    ["timeline cursor", (next: DashboardState) => { next.timelineNextCursor = "oldest"; }],
    ["history expiry", (next: DashboardState) => { next.timelineHistoryExpired = true; }],
    ["loading", (next: DashboardState) => { next.loading = true; }],
    ["error", (next: DashboardState) => { next.error = "failed"; }]
  ])("detects changed %s while preserving unrelated slices", (_name, mutate) => {
    const previous = state();
    const next = structuredClone(previous);
    mutate(next);

    const reconciled = reconcileDashboardState(previous, next);

    expect(reconciled).not.toBe(previous);
    expect(reconciled.timelineEvents === previous.timelineEvents || reconciled.sessions === previous.sessions || reconciled.kanbanProjects === previous.kanbanProjects).toBe(true);
  });
});
