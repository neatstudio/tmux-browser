import type { TerminalInputPrompt } from "../../shared/inputPromptDetector";

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
  preview: string | null;
  inputPrompt: TerminalInputPrompt | null;
  panes?: PaneSummary[];
};

export type PaneSummary = {
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

export type SplitPaneDirection = "horizontal" | "vertical";

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
  listPaneSessions: () => Promise<SessionSummary[]>;
  listDashboardSessions: () => Promise<SessionSummary[]>;
  getSessionStatus: (name: string) => Promise<SessionSummary>;
  getServerStatus: () => Promise<ServerStatus>;
  createSession: (name: string) => Promise<void>;
  renameSession: (fromName: string, toName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
  sendCommand: (name: string, command: string) => Promise<void>;
  splitPane: (name: string, direction: SplitPaneDirection) => Promise<void>;
  selectPane: (name: string, paneId: string) => Promise<void>;
  killPane: (name: string, paneId: string) => Promise<void>;
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
    async listDashboardSessions() {
      const response = await fetch(`${baseUrl}/api/sessions-all`);

      if (!response.ok) {
        throw new Error("Failed to load dashboard tmux sessions");
      }

      return (await response.json()) as SessionSummary[];
    },
    async listPaneSessions() {
      const response = await fetch(`${baseUrl}/api/sessions-panes`);

      if (!response.ok) {
        throw new Error("Failed to load tmux panes");
      }

      return (await response.json()) as SessionSummary[];
    },
    async getSessionStatus(name: string) {
      const response = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(name)}/status`
      );

      if (!response.ok) {
        throw new Error("Failed to load tmux session status");
      }

      return (await response.json()) as SessionSummary;
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
    },
    async sendCommand(name: string, command: string) {
      const response = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(name)}/send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ command })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send tmux command");
      }
    },
    async splitPane(name: string, direction: SplitPaneDirection) {
      const response = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(name)}/split`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ direction })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to split tmux pane");
      }
    },
    async selectPane(name: string, paneId: string) {
      const response = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(name)}/select-pane`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ paneId })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to select tmux pane");
      }
    },
    async killPane(name: string, paneId: string) {
      const response = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(name)}/panes/${encodeURIComponent(paneId)}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Failed to kill tmux pane");
      }
    }
  };
}
