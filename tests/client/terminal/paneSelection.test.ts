import { describe, expect, it, vi } from "vitest";

import type { PaneSummary } from "../../../src/client/api/sessionApi";

describe("pane selection", () => {
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

  it("blocks drag selection once the pointer leaves the starting pane", async () => {
    const { createTerminalPaneSelectionGuard } = await import(
      "../../../src/client/terminal/paneSelection"
    );
    const panes = [
      createPane({ paneId: "%1", paneIndex: 0, paneLeft: 0, paneWidth: 40 }),
      createPane({ paneId: "%2", paneIndex: 1, paneLeft: 40, paneWidth: 40 })
    ];
    const guard = createTerminalPaneSelectionGuard(() => panes);

    guard.beginSelection({
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
    });

    expect(
      guard.shouldBlockSelectionDrag({
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
    ).toBe(false);

    expect(
      guard.shouldBlockSelectionDrag({
        clientX: 180,
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
    ).toBe(true);

    guard.endSelection();
  });

  it("clears the selection anchor after mouseup", async () => {
    const { createTerminalPaneSelectionGuard } = await import(
      "../../../src/client/terminal/paneSelection"
    );
    const panes = [
      createPane({ paneId: "%1", paneIndex: 0, paneLeft: 0, paneWidth: 40 }),
      createPane({ paneId: "%2", paneIndex: 1, paneLeft: 40, paneWidth: 40 })
    ];
    const guard = createTerminalPaneSelectionGuard(() => panes);

    guard.beginSelection({
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
    });
    guard.endSelection();

    expect(
      guard.shouldBlockSelectionDrag({
        clientX: 180,
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
    ).toBe(false);
  });

  it("extracts multiline text only from the selected pane columns", async () => {
    const { extractPaneSelectionText } = await import(
      "../../../src/client/terminal/paneSelection"
    );
    const rightPane = createPane({
      paneId: "%2",
      paneIndex: 1,
      paneLeft: 40,
      paneWidth: 40
    });
    const leftText = "L".repeat(40);
    const rightRows = [
      "0123456789abcdefghijklmnopqrstuvwxyz....",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789....",
      "right-pane-last-row-content.............."
    ];
    const lines = [
      `${leftText}${rightRows[0]}`,
      `${leftText}${rightRows[1]}`,
      `${leftText}${rightRows[2]}`
    ];

    const text = extractPaneSelectionText({
      pane: rightPane,
      start: { cellX: 46, cellY: 0 },
      end: { cellX: 58, cellY: 2 },
      bufferBaseY: 10,
      getLineText: (row, startColumn, endColumn) =>
        lines[row - 10]?.slice(startColumn, endColumn) ?? "",
      trimRight: true
    });

    expect(text).toBe(
      [
        rightRows[0].slice(6),
        rightRows[1],
        rightRows[2].slice(0, 18)
      ].join("\n")
    );
  });

  it("extracts the same pane text when the user drags backward", async () => {
    const { extractPaneSelectionText } = await import(
      "../../../src/client/terminal/paneSelection"
    );
    const rightPane = createPane({
      paneId: "%2",
      paneIndex: 1,
      paneLeft: 40,
      paneWidth: 40
    });
    const leftText = "L".repeat(40);
    const rightRows = [
      "0123456789abcdefghijklmnopqrstuvwxyz....",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789....",
      "right-pane-last-row-content.............."
    ];
    const lines = [
      `${leftText}${rightRows[0]}`,
      `${leftText}${rightRows[1]}`,
      `${leftText}${rightRows[2]}`
    ];

    const text = extractPaneSelectionText({
      pane: rightPane,
      start: { cellX: 58, cellY: 2 },
      end: { cellX: 46, cellY: 0 },
      bufferBaseY: 10,
      getLineText: (row, startColumn, endColumn) =>
        lines[row - 10]?.slice(startColumn, endColumn) ?? "",
      trimRight: true
    });

    expect(text).toBe(
      [
        rightRows[0].slice(6),
        rightRows[1],
        rightRows[2].slice(0, 18)
      ].join("\n")
    );
  });

  it("clamps same-line pane text when the drag crosses into a neighbor pane", async () => {
    const { extractPaneSelectionText } = await import(
      "../../../src/client/terminal/paneSelection"
    );
    const rightPane = createPane({
      paneId: "%2",
      paneIndex: 1,
      paneLeft: 40,
      paneWidth: 40
    });
    const leftText = "L".repeat(40);
    const rightRow = "0123456789abcdefghijklmnopqrstuvwxyz....";
    const line = `${leftText}${rightRow}`;

    const text = extractPaneSelectionText({
      pane: rightPane,
      start: { cellX: 58, cellY: 0 },
      end: { cellX: 20, cellY: 0 },
      bufferBaseY: 10,
      getLineText: (_row, startColumn, endColumn) =>
        line.slice(startColumn, endColumn),
      trimRight: true
    });

    expect(text).toBe(rightRow.slice(0, 18));
  });
});
