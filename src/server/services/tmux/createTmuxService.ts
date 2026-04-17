import {
  parseTmuxListOutput,
  type TmuxSessionSummary
} from "./parseTmuxListOutput";
import { runTmuxCommand, type RunTmuxCommand } from "./runTmuxCommand";

const SESSION_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export type TmuxService = {
  listSessions: () => Promise<TmuxSessionSummary[]>;
  createSession: (name: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
};

export function validateSessionName(name: string): void {
  if (!SESSION_NAME_PATTERN.test(name)) {
    throw new Error("Invalid tmux session name");
  }
}

export function createTmuxService(deps: {
  run?: RunTmuxCommand;
} = {}): TmuxService {
  const run = deps.run ?? runTmuxCommand;

  return {
    async listSessions() {
      try {
        const result = await run("list-sessions", []);
        return parseTmuxListOutput(result.stdout);
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
      await run("new-session", ["-d", "-s", name]);
    },
    async killSession(name: string) {
      validateSessionName(name);
      await run("kill-session", ["-t", name]);
    }
  };
}
