import { describe, expect, it } from "vitest";

import {
  mergeTmuxPaneSummaries,
  parseTmuxListOutput,
  parseTmuxPaneOutput
} from "../../../../src/server/services/tmux/parseTmuxListOutput";

describe("parseTmuxListOutput", () => {
  it("parses formatted tmux list output into dashboard rows", () => {
    const output = [
      "build\t2\t1\t1714200000",
      "ops\t1\t0\t1714200060"
    ].join("\n");

    expect(parseTmuxListOutput(output)).toEqual([
      {
        name: "build",
        windows: 2,
        status: "attached",
        lastActivityAt: 1714200000,
        paneCount: 0,
        activeWindowName: null,
        currentCommand: null,
        runtimeKind: "unknown",
        currentPath: null,
        gitBranch: null,
        gitDirty: null,
        paneDead: false,
        paneDeadStatus: null,
        preview: null,
        inputPrompt: null
      },
      {
        name: "ops",
        windows: 1,
        status: "detached",
        lastActivityAt: 1714200060,
        paneCount: 0,
        activeWindowName: null,
        currentCommand: null,
        runtimeKind: "unknown",
        currentPath: null,
        gitBranch: null,
        gitDirty: null,
        paneDead: false,
        paneDeadStatus: null,
        preview: null,
        inputPrompt: null
      }
    ]);
  });

  it("parses pane status output and merges the active pane into session summaries", () => {
    const sessions = parseTmuxListOutput("build\t2\t1\t1714200000");
    const panes = parseTmuxPaneOutput(
      [
        "build\t%1\t0\tserver\t0\t0\t1\tvim\t/tmp/project\t0\t\t100\t0\t0\t80\t24",
        "build\t%2\t1\tworker\t1\t0\t1\tnpm\t/tmp/project/app\t1\t1\t101\t0\t0\t80\t24"
      ].join("\n")
    );

    expect(mergeTmuxPaneSummaries(sessions, panes)).toEqual([
      {
        name: "build",
        windows: 2,
        status: "attached",
        lastActivityAt: 1714200000,
        paneCount: 2,
        activeWindowName: "worker",
        currentCommand: "npm",
        runtimeKind: "unknown",
        currentPath: "/tmp/project/app",
        gitBranch: null,
        gitDirty: null,
        paneDead: true,
        paneDeadStatus: 1,
        preview: null,
        inputPrompt: null
      }
    ]);
  });

  it("can keep individual pane summaries for dashboard navigation", () => {
    const sessions = parseTmuxListOutput("build\t1\t0\t1714200000");
    const panes = parseTmuxPaneOutput(
      [
        "build\t%1\t0\tserver\t1\t0\t0\tzsh\t/tmp/project\t0\t\t100\t0\t0\t40\t24",
        "build\t%2\t0\tserver\t1\t1\t1\ttail\t/tmp/project/logs\t0\t\t101\t41\t0\t39\t24"
      ].join("\n")
    );

    expect(mergeTmuxPaneSummaries(sessions, panes, { includePanes: true })).toEqual([
      {
        name: "build",
        windows: 1,
        status: "detached",
        lastActivityAt: 1714200000,
        paneCount: 2,
        activeWindowName: "server",
        currentCommand: "tail",
        runtimeKind: "unknown",
        currentPath: "/tmp/project/logs",
        gitBranch: null,
        gitDirty: null,
        paneDead: false,
        paneDeadStatus: null,
        preview: null,
        inputPrompt: null,
        panes: [
          {
            sessionName: "build",
            paneId: "%1",
            windowIndex: 0,
            windowName: "server",
            windowActive: true,
            paneIndex: 0,
            paneActive: false,
            currentCommand: "zsh",
            runtimeKind: "shell",
            currentPath: "/tmp/project",
            paneDead: false,
            paneDeadStatus: null,
            panePid: 100,
            paneLeft: 0,
            paneTop: 0,
            paneWidth: 40,
            paneHeight: 24
          },
          {
            sessionName: "build",
            paneId: "%2",
            windowIndex: 0,
            windowName: "server",
            windowActive: true,
            paneIndex: 1,
            paneActive: true,
            currentCommand: "tail",
            runtimeKind: "unknown",
            currentPath: "/tmp/project/logs",
            paneDead: false,
            paneDeadStatus: null,
            panePid: 101,
            paneLeft: 41,
            paneTop: 0,
            paneWidth: 39,
            paneHeight: 24
          }
        ]
      }
    ]);
  });

  it("marks sessions with active agent panes as agent runtime", () => {
    const sessions = parseTmuxListOutput("agent\t1\t0\t1714200000");
    const panes = parseTmuxPaneOutput(
      "agent\t%1\t0\tmain\t1\t0\t1\tcodex\t/tmp/project\t0\t\t100\t0\t0\t80\t24"
    );

    expect(mergeTmuxPaneSummaries(sessions, panes)[0]).toMatchObject({
      name: "agent",
      currentCommand: "codex",
      runtimeKind: "agent"
    });
  });
});
