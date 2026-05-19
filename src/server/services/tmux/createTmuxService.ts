import {
  mergeTmuxPaneSummaries,
  parseTmuxListOutput,
  parseTmuxPaneOutput,
  type TmuxSessionSummary
} from "./parseTmuxListOutput.js";
import { homedir } from "node:os";
import {
  getGitSummary,
  type GitSummary
} from "../git/getGitSummary.js";
import { runTmuxCommand, type RunTmuxCommand } from "./runTmuxCommand.js";

const SESSION_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const PANE_ID_PATTERN = /^%[0-9]+$/;
const COLOR_SESSION_ENV = [
  "CLICOLOR=1",
  "COLORTERM=truecolor",
  "TERM=xterm-256color"
];
const PREVIEW_LINE_LIMIT = 20;
export type SplitPaneDirection = "horizontal" | "vertical";
export type ListSessionsOptions = {
  includePreview?: boolean;
  includePanes?: boolean;
};

export type TmuxService = {
  listSessions: (options?: ListSessionsOptions) => Promise<TmuxSessionSummary[]>;
  getSessionStatus: (name: string) => Promise<TmuxSessionSummary>;
  createSession: (name: string) => Promise<void>;
  renameSession: (fromName: string, toName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
  sendCommand: (name: string, command: string) => Promise<void>;
  splitPane: (name: string, direction: SplitPaneDirection) => Promise<void>;
  selectPane: (name: string, paneId: string) => Promise<void>;
  killPane: (name: string, paneId: string) => Promise<void>;
};

export function validateSessionName(name: string): void {
  if (!SESSION_NAME_PATTERN.test(name)) {
    throw new Error("Invalid tmux session name");
  }
}

function validateCommand(command: string): string {
  const normalizedCommand = command.trim();

  if (!normalizedCommand) {
    throw new Error("Invalid tmux command");
  }

  return normalizedCommand;
}

function validatePaneId(paneId: string): void {
  if (!PANE_ID_PATTERN.test(paneId)) {
    throw new Error("Invalid tmux pane id");
  }
}

function getSplitPaneFlag(direction: SplitPaneDirection) {
  if (direction === "horizontal") {
    return "-h";
  }

  if (direction === "vertical") {
    return "-v";
  }

  throw new Error("Invalid split pane direction");
}

function trimPreview(output: string) {
  const preview = output
    .replace(/\n+$/g, "")
    .split("\n")
    .slice(-PREVIEW_LINE_LIMIT)
    .join("\n");

  return preview || null;
}

export function createTmuxService(deps: {
  run?: RunTmuxCommand;
  getGitSummary?: (cwd: string | null | undefined) => Promise<GitSummary | null>;
  homeDirectory?: string;
  previewTtlMs?: number;
  now?: () => number;
} = {}): TmuxService {
  const run = deps.run ?? runTmuxCommand;
  const getSessionGitSummary = deps.getGitSummary ?? getGitSummary;
  const homeDirectory = deps.homeDirectory ?? homedir();
  const previewTtlMs = deps.previewTtlMs ?? 60_000;
  const now = deps.now ?? Date.now;
  const previewCache = new Map<
    string,
    { expiresAt: number; preview: string | null }
  >();
  const paneFormat =
    "#{session_name}\t#{pane_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{pane_index}\t#{pane_active}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}";

  async function getSessionPreview(sessionName: string) {
    const cached = previewCache.get(sessionName);
    const nowMs = now();

    if (cached && cached.expiresAt > nowMs) {
      return cached.preview;
    }

    try {
      const result = await run("capture-pane", [
        "-p",
        "-t",
        sessionName,
        "-S",
        `-${PREVIEW_LINE_LIMIT}`
      ]);
      const preview = trimPreview(result.stdout);

      previewCache.set(sessionName, {
        expiresAt: nowMs + previewTtlMs,
        preview
      });

      return preview;
    } catch {
      previewCache.set(sessionName, {
        expiresAt: nowMs + previewTtlMs,
        preview: null
      });

      return null;
    }
  }

  return {
    async listSessions(options: ListSessionsOptions = {}) {
      try {
        const sessionResult = await run("list-sessions", [
          "-F",
          "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"
        ]);
        const paneResult = await run("list-panes", [
          "-a",
          "-F",
          paneFormat
        ]);

        const sessions = mergeTmuxPaneSummaries(
          parseTmuxListOutput(sessionResult.stdout),
          parseTmuxPaneOutput(paneResult.stdout),
          { includePanes: options.includePanes }
        );

        return Promise.all(
          sessions.map(async (session) => {
            const [gitSummary, preview] = await Promise.all([
              getSessionGitSummary(session.currentPath),
              options.includePreview ? getSessionPreview(session.name) : null
            ]);

            return {
              ...session,
              gitBranch: gitSummary?.branch ?? null,
              gitDirty: gitSummary?.dirty ?? null,
              preview
            };
          })
        );
      } catch (error) {
        if (
          error instanceof Error &&
          /no server running|failed to connect/i.test(error.message)
        ) {
          return [];
        }

        throw error;
      }
    },
    async getSessionStatus(name: string) {
      validateSessionName(name);
      const [sessionResult, paneResult] = await Promise.all([
        run("list-sessions", [
          "-F",
          "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"
        ]),
        run("list-panes", [
          "-t",
          name,
          "-F",
          paneFormat
        ])
      ]);
      const sessions = parseTmuxListOutput(sessionResult.stdout).filter(
        (session) => session.name === name
      );
      const [session] = mergeTmuxPaneSummaries(
        sessions,
        parseTmuxPaneOutput(paneResult.stdout),
        { includePanes: true }
      );

      if (!session) {
        throw new Error("Tmux session not found");
      }

      const gitSummary = await getSessionGitSummary(session.currentPath);

      return {
        ...session,
        gitBranch: gitSummary?.branch ?? null,
        gitDirty: gitSummary?.dirty ?? null
      };
    },
    async createSession(name: string) {
      validateSessionName(name);
      await run("new-session", [
        "-d",
        "-c",
        homeDirectory,
        ...COLOR_SESSION_ENV.flatMap((value) => ["-e", value]),
        "-s",
        name
      ]);
    },
    async renameSession(fromName: string, toName: string) {
      validateSessionName(fromName);
      validateSessionName(toName);
      await run("rename-session", ["-t", fromName, toName]);
    },
    async killSession(name: string) {
      validateSessionName(name);
      await run("kill-session", ["-t", name]);
    },
    async sendCommand(name: string, command: string) {
      validateSessionName(name);
      await run("send-keys", ["-t", name, validateCommand(command), "C-m"]);
      previewCache.delete(name);
    },
    async splitPane(name: string, direction: SplitPaneDirection) {
      validateSessionName(name);
      await run("split-window", [
        getSplitPaneFlag(direction),
        "-d",
        "-t",
        name,
        "-c",
        "#{pane_current_path}"
      ]);
      previewCache.delete(name);
    },
    async selectPane(name: string, paneId: string) {
      validateSessionName(name);
      validatePaneId(paneId);
      await run("select-pane", ["-t", paneId]);
      previewCache.delete(name);
    },
    async killPane(name: string, paneId: string) {
      validateSessionName(name);
      validatePaneId(paneId);
      const paneResult = await run("list-panes", [
        "-t",
        name,
        "-F",
        "#{pane_id}"
      ]);
      const paneIds = paneResult.stdout.split("\n").filter(Boolean);

      if (!paneIds.includes(paneId)) {
        throw new Error("Pane does not belong to session");
      }

      if (paneIds.length <= 1) {
        throw new Error("Cannot kill the only pane");
      }

      await run("kill-pane", ["-t", paneId]);
      previewCache.delete(name);
    }
  };
}
