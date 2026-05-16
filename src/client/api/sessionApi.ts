export type SessionSummary = {
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
};

export type ServerStatus = {
  platform: string;
  cpuCount: number;
  loadAverage: [number, number, number];
  loadPercent: number | null;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedPercent: number | null;
  uptimeSeconds: number;
  homeDirectory: string;
};

export type SessionApi = {
  listSessions: () => Promise<SessionSummary[]>;
  getServerStatus: () => Promise<ServerStatus>;
  createSession: (name: string) => Promise<void>;
  renameSession: (fromName: string, toName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
};

export function createSessionApi(baseUrl = ""): SessionApi {
  return {
    async listSessions() {
      const response = await fetch(`${baseUrl}/api/sessions`);

      if (!response.ok) {
        throw new Error("Failed to load tmux sessions");
      }

      return (await response.json()) as SessionSummary[];
    },
    async getServerStatus() {
      const response = await fetch(`${baseUrl}/api/server-status`);

      if (!response.ok) {
        throw new Error("Failed to load server status");
      }

      return (await response.json()) as ServerStatus;
    },
    async createSession(name: string) {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        throw new Error("Failed to create tmux session");
      }
    },
    async renameSession(fromName: string, toName: string) {
      const response = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(fromName)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name: toName })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to rename tmux session");
      }
    },
    async killSession(name: string) {
      const response = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(name)}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Failed to kill tmux session");
      }
    }
  };
}
