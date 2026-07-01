import type { PaneSummary } from "../api/sessionApi";
import {
  findPaneAtTerminalCell,
  findPaneAtTerminalPoint,
  isSelectionWithinOnePane,
  type TerminalBufferSelectionPosition,
  type TerminalPaneHitTestInput
} from "./paneHitTest";

export type TerminalPaneSelectionPoint = TerminalPaneHitTestInput;

type PaneSelectionAnchor = {
  paneId: string;
};

export type TerminalPaneSelectionGuard = {
  beginSelection: (point: TerminalPaneSelectionPoint) => void;
  shouldBlockSelectionDrag: (point: TerminalPaneSelectionPoint) => boolean;
  endSelection: () => void;
};

export type TerminalPaneSelectionCell = {
  cellX: number;
  cellY: number;
};

export type ExtractPaneSelectionTextOptions = {
  pane: PaneSummary;
  start: TerminalPaneSelectionCell;
  end: TerminalPaneSelectionCell;
  bufferBaseY: number;
  getLineText: (
    row: number,
    startColumn: number,
    endColumn: number
  ) => string;
  trimRight?: boolean;
};

function isPointInPane(
  panes: PaneSummary[],
  point: TerminalPaneSelectionPoint
) {
  return findPaneAtTerminalPoint({
    ...point,
    panes
  });
}

export function createTerminalPaneSelectionGuard(
  getPaneSummaries: () => PaneSummary[]
): TerminalPaneSelectionGuard {
  let anchor: PaneSelectionAnchor | null = null;

  function reset() {
    anchor = null;
  }

  function getPaneIdAtPoint(point: TerminalPaneSelectionPoint) {
    return isPointInPane(getPaneSummaries(), point);
  }

  return {
    beginSelection(point) {
      const paneId = getPaneIdAtPoint(point);

      anchor = paneId ? { paneId } : null;
    },
    shouldBlockSelectionDrag(point) {
      if (!anchor) {
        return false;
      }

      const paneId = getPaneIdAtPoint(point);

      return paneId !== null && paneId !== anchor.paneId;
    },
    endSelection: reset
  };
}

function compareCells(
  first: TerminalPaneSelectionCell,
  second: TerminalPaneSelectionCell
) {
  if (first.cellY !== second.cellY) {
    return first.cellY - second.cellY;
  }

  return first.cellX - second.cellX;
}

function normalizeCells(
  start: TerminalPaneSelectionCell,
  end: TerminalPaneSelectionCell
) {
  if (compareCells(start, end) <= 0) {
    return { start, end };
  }

  return {
    start: end,
    end: start
  };
}

export function extractPaneSelectionText({
  pane,
  start,
  end,
  bufferBaseY,
  getLineText,
  trimRight = false
}: ExtractPaneSelectionTextOptions) {
  const selection = normalizeCells(start, end);
  const paneLeft = pane.paneLeft;
  const paneRight = pane.paneLeft + pane.paneWidth;
  const paneTop = pane.paneTop;
  const paneBottom = pane.paneTop + pane.paneHeight;
  const firstRow = Math.max(paneTop, selection.start.cellY);
  const lastRow = Math.min(paneBottom - 1, selection.end.cellY);
  const lines: string[] = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    const fromColumn =
      row === selection.start.cellY
        ? Math.max(paneLeft, selection.start.cellX)
        : paneLeft;
    const toColumn =
      row === selection.end.cellY
        ? Math.min(paneRight, selection.end.cellX)
        : paneRight;

    if (toColumn <= fromColumn) {
      lines.push("");
      continue;
    }

    const line = getLineText(bufferBaseY + row, fromColumn, toColumn);
    lines.push(trimRight ? line.trimEnd() : line);
  }

  return lines.join("\n");
}

export {
  findPaneAtTerminalCell,
  findPaneAtTerminalPoint,
  isSelectionWithinOnePane,
  type TerminalBufferSelectionPosition
};
