import {
  mergeTmuxPaneSummaries,
  parseTmuxListOutput,
  parseTmuxPaneOutput,
  type TmuxSessionSummary
} from "./parseTmuxListOutput.js";
import { homedir } from "node:os";
import { detectTerminalInputPrompt } from "../../../shared/inputPromptDetector.js";
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
  includeInputPrompt?: boolean;
  mutedSessionNames?: string[];
  onlySessionNames?: string[];
};

export type TmuxService = {
  listSessions: (options?: ListSessionsOptions) => Promise<TmuxSessionSummary[]>;
  getSessionStatus: (name: string) => Promise<TmuxSessionSummary>;
  createSession: (name: string) => Promise<void>;
  renameSession: (fromName: string, toName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
  sendCommand: (name: string, command: string) => Promise<void>;
  sendInput: (name: string, input: string) => Promise<void>;
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

function validateInput(input: unknown): string {
  if (typeof input !== "string" || input.length === 0 || input.length > 256) {
    throw new Error("Invalid tmux input");
  }

  return input;
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

function getTmuxKey(input: string) {
  if (input === "\u001b") {
    return "Escape";
  }

  if (input === "\t") {
    return "Tab";
  }

  if (input === "\u0003") {
    return "C-c";
  }

  if (input === "\u0004") {
    return "C-d";
  }

  if (input === "\u000c") {
    return "C-l";
  }

  return null;
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
  inputPromptTtlMs?: number;
  gitSummaryTtlMs?: number;
  now?: () => number;
} = {}): TmuxService {
  const run = deps.run ?? runTmuxCommand;
  const getSessionGitSummary = deps.getGitSummary ?? getGitSummary;
  const homeDirectory = deps.homeDirectory ?? homedir();
  const previewTtlMs = deps.previewTtlMs ?? 60_000;
  const inputPromptTtlMs = deps.inputPromptTtlMs ?? 60_000;
  const gitSummaryTtlMs = deps.gitSummaryTtlMs ?? 60_000;
  const now = deps.now ?? Date.now;
  const previewCache = new Map<
    string,
    { expiresAt: number; preview: string | null }
  >();
  const gitSummaryCache = new Map<
    string,
    { expiresAt: number; summary: GitSummary | null }
  >();
  const paneCaptureCache = new Map<
    string,
    { expiresAt: number; output: string | null }
  >();
  const paneCaptureInflight = new Map<string, Promise<string | null>>();
  const inputPromptCache = new Map<
    string,
    {
      expiresAt: number;
      prompt: ReturnType<typeof detectTerminalInputPrompt> | null;
    }
  >();
  const paneFormat =
    "#{session_name}\t#{pane_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{pane_index}\t#{pane_active}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}";

  async function getPaneCapture(sessionName: string, ttlMs: number) {
    const cached = paneCaptureCache.get(sessionName);
    const nowMs = now();

    if (cached && cached.expiresAt > nowMs) {
      return cached.output;
    }

    const inflight = paneCaptureInflight.get(sessionName);

    if (inflight) {
      return inflight;
    }

    const capture = (async () => {
      try {
        const result = await run("capture-pane", [
          "-p",
          "-t",
          sessionName,
          "-S",
          `-${PREVIEW_LINE_LIMIT}`
        ]);

        paneCaptureCache.set(sessionName, {
          expiresAt: nowMs + ttlMs,
          output: result.stdout
        });

        return result.stdout;
      } catch {
        paneCaptureCache.set(sessionName, {
          expiresAt: nowMs + ttlMs,
          output: null
        });

        return null;
      } finally {
        paneCaptureInflight.delete(sessionName);
      }
    })();

    paneCaptureInflight.set(sessionName, capture);

    return capture;
  }

  async function getSessionPreview(sessionName: string) {
    const cached = previewCache.get(sessionName);
    const nowMs = now();

    if (cached && cached.expiresAt > nowMs) {
      return cached.preview;
    }

    const output = await getPaneCapture(sessionName, previewTtlMs);
    const preview = output === null ? null : trimPreview(output);

    previewCache.set(sessionName, {
      expiresAt: nowMs + previewTtlMs,
      preview
    });

    return preview;
  }

  async function getSessionInputPrompt(sessionName: string) {
    const cached = inputPromptCache.get(sessionName);
    const nowMs = now();

    if (cached && cached.expiresAt > nowMs) {
      return cached.prompt;
    }

    const output = await getPaneCapture(sessionName, inputPromptTtlMs);
    const prompt = output === null ? null : detectTerminalInputPrompt(output);

    inputPromptCache.set(sessionName, {
      expiresAt: nowMs + inputPromptTtlMs,
      prompt
    });

    return prompt;
  }

  async function getCachedGitSummary(cwd: string | null | undefined) {
    if (!cwd) {
      return null;
    }

    const nowMs = now();
    const cached = gitSummaryCache.get(cwd);

    if (cached && cached.expiresAt > nowMs) {
      return cached.summary;
    }

    const summary = await getSessionGitSummary(cwd);
    gitSummaryCache.set(cwd, {
      expiresAt: nowMs + gitSummaryTtlMs,
      summary
    });

    return summary;
  }

  function invalidateSessionCaches(name: string) {
    previewCache.delete(name);
    paneCaptureCache.delete(name);
    paneCaptureInflight.delete(name);
    inputPromptCache.delete(name);
    gitSummaryCache.clear();
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

        const onlySessionNames = new Set(options.onlySessionNames ?? []);
        const mutedSessionNames = new Set(options.mutedSessionNames ?? []);
        const sessions = mergeTmuxPaneSummaries(
          parseTmuxListOutput(sessionResult.stdout),
          parseTmuxPaneOutput(paneResult.stdout),
          { includePanes: options.includePanes }
        ).filter(
          (session) =>
            onlySessionNames.size === 0 || onlySessionNames.has(session.name)
        );

        return Promise.all(
          sessions.map(async (session) => {
            if (mutedSessionNames.has(session.name)) {
              return {
                ...session,
                gitBranch: null,
                gitDirty: null,
                preview: null,
                inputPrompt: null
              };
            }

            const [gitSummary, preview, inputPrompt] = await Promise.all([
              getCachedGitSummary(session.currentPath),
              options.includePreview ? getSessionPreview(session.name) : null,
              options.includeInputPrompt ? getSessionInputPrompt(session.name) : null
            ]);

            return {
              ...session,
              gitBranch: gitSummary?.branch ?? null,
              gitDirty: gitSummary?.dirty ?? null,
              preview,
              inputPrompt
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

      const [gitSummary, inputPrompt] = await Promise.all([
        getCachedGitSummary(session.currentPath),
        getSessionInputPrompt(session.name)
      ]);

      return {
        ...session,
        gitBranch: gitSummary?.branch ?? null,
        gitDirty: gitSummary?.dirty ?? null,
        inputPrompt
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
      const normalizedCommand = validateCommand(command);
      await run("send-keys", ["-t", name, "-l", normalizedCommand]);
      await run("send-keys", ["-t", name, "Enter"]);
      invalidateSessionCaches(name);
    },
    async sendInput(name: string, input: string) {
      validateSessionName(name);
      const normalizedInput = validateInput(input);
      const key = getTmuxKey(normalizedInput);

      if (key) {
        await run("send-keys", ["-t", name, key]);
        invalidateSessionCaches(name);
        return;
      }

      if (normalizedInput.endsWith("\r")) {
        const literalInput = normalizedInput.slice(0, -1);

        if (literalInput) {
          await run("send-keys", ["-t", name, "-l", literalInput]);
        }

        await run("send-keys", ["-t", name, "Enter"]);
        invalidateSessionCaches(name);
        return;
      }

      await run("send-keys", ["-t", name, "-l", normalizedInput]);
      invalidateSessionCaches(name);
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
      invalidateSessionCaches(name);
    },
    async selectPane(name: string, paneId: string) {
      validateSessionName(name);
      validatePaneId(paneId);
      await run("select-pane", ["-t", paneId]);
      invalidateSessionCaches(name);
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
      invalidateSessionCaches(name);
    }
  };
}
