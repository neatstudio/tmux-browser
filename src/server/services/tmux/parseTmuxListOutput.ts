import type { TerminalInputPrompt } from "../../../shared/inputPromptDetector.js";
import type { SessionRuntimeKind } from "../../../shared/sessionRuntime.js";
import { classifySessionRuntime } from "../groupMessages/classifySessionRuntime.js";

export type TmuxSessionSummary = {
  name: string;
  windows: number;
  status: "attached" | "detached";
  lastActivityAt: number | null;
  paneCount: number;
  activeWindowName: string | null;
  currentCommand: string | null;
  runtimeKind: SessionRuntimeKind;
  currentPath: string | null;
  gitBranch: string | null;
  gitDirty: boolean | null;
  paneDead: boolean;
  paneDeadStatus: number | null;
  preview: string | null;
  inputPrompt: TerminalInputPrompt | null;
  panes?: TmuxPaneSummary[];
};

export type TmuxPaneSummary = {
  sessionName: string;
  paneId: string;
  windowIndex: number;
  windowName: string;
  windowActive: boolean;
  paneIndex: number;
  paneActive: boolean;
  currentCommand: string | null;
  runtimeKind: SessionRuntimeKind;
  currentPath: string | null;
  paneDead: boolean;
  paneDeadStatus: number | null;
  panePid: number | null;
  paneLeft: number;
  paneTop: number;
  paneWidth: number;
  paneHeight: number;
};

export function parseTmuxListOutput(output: string): TmuxSessionSummary[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\t");

      if (fields.length !== 4) {
        throw new Error(`Unsupported tmux output: ${line}`);
      }

      const [name, windows, attachedClients, lastActivityAt] = fields;

      if (!name || !windows || attachedClients === undefined) {
        throw new Error(`Unsupported tmux output: ${line}`);
      }

      return {
        name,
        windows: Number(windows),
        status: Number(attachedClients) > 0 ? "attached" : "detached",
        lastActivityAt: lastActivityAt ? Number(lastActivityAt) : null,
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
      };
    });
}

function nullableNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: string | undefined) {
  return value ? value : null;
}

export function parseTmuxPaneOutput(output: string): TmuxPaneSummary[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\t");

      if (fields.length !== 12 && fields.length !== 16) {
        throw new Error(`Unsupported tmux pane output: ${line}`);
      }

      const [
        sessionName,
        paneId,
        windowIndex,
        windowName,
        windowActive,
        paneIndex,
        paneActive,
        currentCommand,
        currentPath,
        paneDead,
        paneDeadStatus,
        panePid,
        paneLeft,
        paneTop,
        paneWidth,
        paneHeight
      ] = fields;

      if (!sessionName || !paneId || !windowName) {
        throw new Error(`Unsupported tmux pane output: ${line}`);
      }

      return {
        sessionName,
        paneId,
        windowIndex: Number(windowIndex),
        windowName,
        windowActive: windowActive === "1",
        paneIndex: Number(paneIndex),
        paneActive: paneActive === "1",
        currentCommand: nullableString(currentCommand),
        runtimeKind: classifySessionRuntime(currentCommand).kind,
        currentPath: nullableString(currentPath),
        paneDead: paneDead === "1",
        paneDeadStatus: nullableNumber(paneDeadStatus),
        panePid: nullableNumber(panePid),
        paneLeft: Number(paneLeft ?? 0),
        paneTop: Number(paneTop ?? 0),
        paneWidth: Number(paneWidth ?? 0),
        paneHeight: Number(paneHeight ?? 0)
      };
    });
}

export function mergeTmuxPaneSummaries(
  sessions: TmuxSessionSummary[],
  panes: TmuxPaneSummary[],
  options: { includePanes?: boolean } = {}
): TmuxSessionSummary[] {
  return sessions.map((session) => {
    const sessionPanes = panes
      .filter((pane) => pane.sessionName === session.name)
      .sort(
        (left, right) =>
          left.windowIndex - right.windowIndex || left.paneIndex - right.paneIndex
      );
    const activePane =
      sessionPanes.find((pane) => pane.windowActive && pane.paneActive) ??
      sessionPanes.find((pane) => pane.paneActive) ??
      sessionPanes[0];

    const merged = {
      ...session,
      paneCount: sessionPanes.length,
      activeWindowName: activePane?.windowName ?? null,
      currentCommand: activePane?.currentCommand ?? null,
      runtimeKind: classifySessionRuntime(activePane?.currentCommand).kind,
      currentPath: activePane?.currentPath ?? null,
      gitBranch: null,
      gitDirty: null,
      paneDead: activePane?.paneDead ?? false,
      paneDeadStatus: activePane?.paneDeadStatus ?? null,
      preview: session.preview,
      inputPrompt: session.inputPrompt
    };

    return options.includePanes ? { ...merged, panes: sessionPanes } : merged;
  });
}
