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
        currentPath: null,
        gitBranch: null,
        gitDirty: null,
        paneDead: false,
        paneDeadStatus: null
      },
      {
        name: "ops",
        windows: 1,
        status: "detached",
        lastActivityAt: 1714200060,
        paneCount: 0,
        activeWindowName: null,
        currentCommand: null,
        currentPath: null,
        gitBranch: null,
        gitDirty: null,
        paneDead: false,
        paneDeadStatus: null
      }
    ]);
  });

  it("parses pane status output and merges the active pane into session summaries", () => {
    const sessions = parseTmuxListOutput("build\t2\t1\t1714200000");
    const panes = parseTmuxPaneOutput(
      [
        "build\tserver\t0\t1\tvim\t/tmp/project\t0\t\t100",
        "build\tworker\t1\t1\tnpm\t/tmp/project/app\t1\t1\t101"
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
        currentPath: "/tmp/project/app",
        gitBranch: null,
        gitDirty: null,
        paneDead: true,
        paneDeadStatus: 1
      }
    ]);
  });
});
