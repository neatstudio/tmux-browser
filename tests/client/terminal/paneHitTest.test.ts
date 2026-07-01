import { describe, expect, it } from "vitest";

import {
  findPaneAtTerminalPoint,
  isSelectionWithinOnePane
} from "../../../src/client/terminal/paneHitTest";
import type { PaneSummary } from "../../../src/client/api/sessionApi";

function createPane(overrides: Partial<PaneSummary>): PaneSummary {
  return {
    sessionName: "build",
    paneId: "%1",
    windowIndex: 0,
    windowName: "main",
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
    paneHeight: 24,
    ...overrides
  };
}

describe("findPaneAtTerminalPoint", () => {
  it("maps browser click coordinates to the tmux pane geometry", () => {
    const panes = [
      createPane({ paneId: "%1", paneIndex: 0, paneLeft: 0, paneWidth: 40 }),
      createPane({ paneId: "%2", paneIndex: 1, paneLeft: 41, paneWidth: 39 })
    ];

    expect(
      findPaneAtTerminalPoint({
        panes,
        clientX: 620,
        clientY: 140,
        rect: {
          left: 100,
          top: 20,
          width: 800,
          height: 240
        },
        cols: 80,
        rows: 24
      })
    ).toBe("%2");
  });

  it("ignores panes in inactive windows", () => {
    const panes = [
      createPane({
        paneId: "%1",
        windowActive: false,
        paneLeft: 0,
        paneTop: 0,
        paneWidth: 80,
        paneHeight: 24
      })
    ];

    expect(
      findPaneAtTerminalPoint({
        panes,
        clientX: 120,
        clientY: 40,
        rect: {
          left: 100,
          top: 20,
          width: 800,
          height: 240
        },
        cols: 80,
        rows: 24
      })
    ).toBeNull();
  });
});

describe("isSelectionWithinOnePane", () => {
  it("detects selections that span different panes", () => {
    const panes = [
      createPane({ paneId: "%1", paneIndex: 0, paneLeft: 0, paneWidth: 40 }),
      createPane({ paneId: "%2", paneIndex: 1, paneLeft: 40, paneWidth: 40 })
    ];

    expect(
      isSelectionWithinOnePane(panes, {
        start: { x: 10, y: 5 },
        end: { x: 50, y: 5 }
      })
    ).toBe(false);
  });

  it("detects cross-pane selections after mapping xterm buffer rows back to visible rows", () => {
    const panes = [
      createPane({
        paneId: "%1",
        paneIndex: 0,
        paneLeft: 0,
        paneTop: 0,
        paneWidth: 80,
        paneHeight: 12
      }),
      createPane({
        paneId: "%2",
        paneIndex: 1,
        paneLeft: 0,
        paneTop: 12,
        paneWidth: 80,
        paneHeight: 12
      })
    ];

    expect(
      isSelectionWithinOnePane(
        panes,
        {
          start: { x: 5, y: 113 },
          end: { x: 30, y: 111 }
        },
        { viewportY: 100 }
      )
    ).toBe(false);
  });

  it("rejects multi-line selections that start and end inside the same right-hand pane but include the left pane", () => {
    const panes = [
      createPane({ paneId: "%1", paneIndex: 0, paneLeft: 0, paneWidth: 40 }),
      createPane({ paneId: "%2", paneIndex: 1, paneLeft: 40, paneWidth: 40 })
    ];

    expect(
      isSelectionWithinOnePane(panes, {
        start: { x: 50, y: 5 },
        end: { x: 60, y: 7 }
      })
    ).toBe(false);
  });
});
