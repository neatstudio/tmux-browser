import type { AppEventHub } from "../events/createAppEventHub.js";
import type { TmuxService } from "./createTmuxService.js";

type TmuxSessionListWatcherDeps = {
  tmuxService: Pick<TmuxService, "listSessionNames" | "listSessions">;
  eventHub: AppEventHub;
  pollMs?: number;
};

function buildSessionSignature(sessionNames: string[]) {
  return sessionNames.slice().sort().join("\n");
}

export function createTmuxSessionListWatcher(deps: TmuxSessionListWatcherDeps) {
  const pollMs = deps.pollMs ?? 10_000;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSignature: string | null = null;
  let running = false;

  async function pollOnce() {
    if (running) {
      return;
    }

    running = true;

    try {
      const sessionNames = deps.tmuxService.listSessionNames
        ? await deps.tmuxService.listSessionNames()
        : (
            await deps.tmuxService.listSessions({ includePreview: false })
          ).map((session) => session.name);
      const signature = buildSessionSignature(sessionNames);

      if (lastSignature !== null && signature !== lastSignature) {
        deps.eventHub.publish({
          type: "sessions-invalidated",
          reason: "session-list-changed",
          sessionName: sessionNames[0]
        });
      }

      lastSignature = signature;
    } catch {
      // Ignore tmux transient errors and keep the watcher alive.
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer !== null) {
        return;
      }

      void pollOnce();
      timer = globalThis.setInterval(() => {
        void pollOnce();
      }, pollMs);
    },
    stop() {
      if (timer === null) {
        return;
      }

      globalThis.clearInterval(timer);
      timer = null;
    },
    testOnly: {
      pollOnce
    }
  };
}
