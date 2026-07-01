import type { PaneSummary } from "../api/sessionApi";

export type TerminalPaneHitTestInput = {
  panes: PaneSummary[];
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
  cols: number;
  rows: number;
};

export type TerminalBufferSelectionPosition = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export type TerminalPaneCellPosition = {
  cellX: number;
  cellY: number;
};

export type TerminalSelectionPaneOptions = {
  viewportY?: number;
  cols?: number;
};

type TerminalCellRange = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export function findPaneAtTerminalCell(
  panes: PaneSummary[],
  { cellX, cellY }: TerminalPaneCellPosition
) {
  return (
    panes.find(
      (pane) =>
        pane.windowActive &&
        cellX >= pane.paneLeft &&
        cellX < pane.paneLeft + pane.paneWidth &&
        cellY >= pane.paneTop &&
        cellY < pane.paneTop + pane.paneHeight
    )?.paneId ?? null
  );
}

export function findPaneAtTerminalPoint({
  panes,
  clientX,
  clientY,
  rect,
  cols,
  rows
}: TerminalPaneHitTestInput) {
  if (
    panes.length === 0 ||
    cols <= 0 ||
    rows <= 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }

  const cellX = Math.floor(((clientX - rect.left) / rect.width) * cols);
  const cellY = Math.floor(((clientY - rect.top) / rect.height) * rows);

  return findPaneAtTerminalCell(panes, { cellX, cellY });
}

function compareCellPosition(
  first: TerminalCellRange["start"],
  second: TerminalCellRange["start"]
) {
  if (first.y !== second.y) {
    return first.y - second.y;
  }

  return first.x - second.x;
}

function normalizeSelectionPosition(
  selectionPosition: TerminalBufferSelectionPosition,
  viewportY: number
): TerminalCellRange {
  const first = {
    x: Math.max(0, selectionPosition.start.x),
    y: Math.max(0, selectionPosition.start.y - viewportY)
  };
  const second = {
    x: Math.max(0, selectionPosition.end.x),
    y: Math.max(0, selectionPosition.end.y - viewportY)
  };

  if (compareCellPosition(first, second) <= 0) {
    return {
      start: first,
      end: second
    };
  }

  return {
    start: second,
    end: first
  };
}

function getTerminalCols(panes: PaneSummary[], fallbackCols = 0) {
  return Math.max(
    fallbackCols,
    ...panes
      .filter((pane) => pane.windowActive)
      .map((pane) => pane.paneLeft + pane.paneWidth)
  );
}

function selectionSegmentsFitPane(
  pane: PaneSummary,
  selection: TerminalCellRange,
  cols: number
) {
  const paneRight = pane.paneLeft + pane.paneWidth;
  const paneBottom = pane.paneTop + pane.paneHeight;

  for (let row = selection.start.y; row <= selection.end.y; row += 1) {
    const fromX = row === selection.start.y ? selection.start.x : 0;
    const toX = row === selection.end.y ? selection.end.x : cols;

    if (toX <= fromX) {
      continue;
    }

    if (
      row < pane.paneTop ||
      row >= paneBottom ||
      fromX < pane.paneLeft ||
      toX > paneRight
    ) {
      return false;
    }
  }

  return true;
}

export function isSelectionWithinOnePane(
  panes: PaneSummary[],
  selectionPosition: TerminalBufferSelectionPosition | undefined,
  options: TerminalSelectionPaneOptions = {}
) {
  if (!selectionPosition) {
    return true;
  }

  const viewportY = Math.max(0, Math.trunc(options.viewportY ?? 0));
  const selection = normalizeSelectionPosition(selectionPosition, viewportY);
  const startPane = panes.find((pane) => {
    if (!pane.windowActive) {
      return false;
    }

    return (
      selection.start.x >= pane.paneLeft &&
      selection.start.x < pane.paneLeft + pane.paneWidth &&
      selection.start.y >= pane.paneTop &&
      selection.start.y < pane.paneTop + pane.paneHeight
    );
  });

  if (!startPane) {
    return true;
  }

  return selectionSegmentsFitPane(
    startPane,
    selection,
    getTerminalCols(panes, options.cols)
  );
}
