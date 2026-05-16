import {
  mergeTmuxPaneSummaries,
  parseTmuxListOutput,
  parseTmuxPaneOutput,
  type TmuxSessionSummary
} from "./parseTmuxListOutput.js";
import {
  getGitSummary,
  type GitSummary
} from "../git/getGitSummary.js";
import { runTmuxCommand, type RunTmuxCommand } from "./runTmuxCommand.js";

const SESSION_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const COLOR_SESSION_ENV = [
  "CLICOLOR=1",
  "COLORTERM=truecolor",
  "TERM=xterm-256color"
];

export type TmuxService = {
  listSessions: () => Promise<TmuxSessionSummary[]>;
  createSession: (name: string) => Promise<void>;
  renameSession: (fromName: string, toName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
};

export function validateSessionName(name: string): void {
  if (!SESSION_NAME_PATTERN.test(name)) {
    throw new Error("Invalid tmux session name");
  }
}

export function createTmuxService(deps: {
  run?: RunTmuxCommand;
  getGitSummary?: (cwd: string | null | undefined) => Promise<GitSummary | null>;
} = {}): TmuxService {
  const run = deps.run ?? runTmuxCommand;
  const getSessionGitSummary = deps.getGitSummary ?? getGitSummary;

  return {
    async listSessions() {
      try {
        const sessionResult = await run("list-sessions", [
          "-F",
          "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"
        ]);
        const paneResult = await run("list-panes", [
          "-a",
          "-F",
          "#{session_name}\t#{window_name}\t#{window_active}\t#{pane_active}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}"
        ]);

        const sessions = mergeTmuxPaneSummaries(
          parseTmuxListOutput(sessionResult.stdout),
          parseTmuxPaneOutput(paneResult.stdout)
        );

        return Promise.all(
          sessions.map(async (session) => {
            const gitSummary = await getSessionGitSummary(session.currentPath);

            return {
              ...session,
              gitBranch: gitSummary?.branch ?? null,
              gitDirty: gitSummary?.dirty ?? null
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
    async createSession(name: string) {
      validateSessionName(name);
      await run("new-session", [
        "-d",
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
    }
  };
}
