import type { TerminalInputPrompt } from "../../../shared/inputPromptDetector.js";

export type TmuxSessionSummary = {
  name: string;
  windows: number;
  status: "attached" | "detached";
  lastActivityAt: number | null;
  paneCount: number;
  activeWindowName: string | null;
  currentCommand: string | null;
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
  currentPath: string | null;
  paneDead: boolean;
  paneDeadStatus: number | null;
  panePid: number | null;
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

      if (fields.length !== 12) {
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
        panePid
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
        currentPath: nullableString(currentPath),
        paneDead: paneDead === "1",
        paneDeadStatus: nullableNumber(paneDeadStatus),
        panePid: nullableNumber(panePid)
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
