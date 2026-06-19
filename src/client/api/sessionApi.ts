import type { TerminalInputPrompt } from "../../shared/inputPromptDetector";
import { getKanbanTemplateAgents } from "../../shared/kanbanTemplates";
import type {
  CreateGroupMessageRequest,
  GroupMessage
} from "../../shared/groupMessages";
import type { SessionSettings } from "../../shared/sessionSettings";
import type { TimelineEvent } from "../../shared/timeline";

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

export type Preferences = {
  pinnedSessionNames: string[];
  mutedSessionNames: string[];
  sessionSettings: Record<string, SessionSettings>;
  kanbanProjects: KanbanProject[];
};

export type KanbanAgent = {
  kind: string;
  name: string;
  command: string | null;
  sessionName?: string;
};

export type KanbanProject = {
  name: string;
  path: string;
  server: string | null;
  agents: KanbanAgent[];
};

export type CreateKanbanProjectRequest = Omit<KanbanProject, "agents"> & {
  agents?: KanbanAgent[];
  selectedAgentNames?: string[];
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
  listPaneSessions: (mutedSessionNames?: string[]) => Promise<SessionSummary[]>;
  listDashboardSessions: (onlySessionNames?: string[]) => Promise<SessionSummary[]>;
  listTimelineEvents: (limit?: number) => Promise<TimelineEvent[]>;
  getPreferences: () => Promise<Preferences>;
  listKanbanProjects: () => Promise<KanbanProject[]>;
  createKanbanProject: (project: CreateKanbanProjectRequest) => Promise<string[]>;
  addKanbanSession: (projectName: string, sessionName: string) => Promise<void>;
  removeKanbanSession: (
    projectName: string,
    agentName: string,
    options?: { kill?: boolean }
  ) => Promise<void>;
  deleteKanbanProject: (projectName: string) => Promise<void>;
  listGroupMessages: (projectName: string) => Promise<GroupMessage[]>;
  sendGroupMessage: (
    projectName: string,
    request: CreateGroupMessageRequest
  ) => Promise<GroupMessage>;
  scanGroupMessage: (
    projectName: string,
    messageId: string
  ) => Promise<GroupMessage>;
  setPinnedSession: (name: string, pinned: boolean) => Promise<void>;
  setMutedSession: (name: string, muted: boolean) => Promise<void>;
  setSessionSettings: (name: string, settings: SessionSettings) => Promise<void>;
  getSessionStatus: (name: string) => Promise<SessionSummary>;
  getServerStatus: () => Promise<ServerStatus>;
  createSession: (name: string) => Promise<void>;
  renameSession: (fromName: string, toName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
  sendCommand: (name: string, command: string) => Promise<void>;
  sendInput: (name: string, input: string) => Promise<void>;
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
    async listDashboardSessions(onlySessionNames = []) {
      const params = new URLSearchParams();

      if (onlySessionNames.length > 0) {
        params.set("only", onlySessionNames.join(","));
      }

      const query = params.toString();
      const response = await fetch(
        `${baseUrl}/api/sessions-all${query ? `?${query}` : ""}`
      );

      if (!response.ok) {
        throw new Error("Failed to load dashboard tmux sessions");
      }

      return (await response.json()) as SessionSummary[];
    },
    async listPaneSessions(mutedSessionNames = []) {
      const params = new URLSearchParams();

      if (mutedSessionNames.length > 0) {
        params.set("muted", mutedSessionNames.join(","));
      }

      const query = params.toString();
      const response = await fetch(
        `${baseUrl}/api/sessions-panes${query ? `?${query}` : ""}`
      );

      if (!response.ok) {
        throw new Error("Failed to load tmux panes");
      }

      return (await response.json()) as SessionSummary[];
    },
    async listTimelineEvents(limit = 20) {
      const params = new URLSearchParams({ limit: String(limit) });
      const response = await fetch(`${baseUrl}/api/timeline?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to load timeline events");
      }

      const payload = (await response.json()) as { events: TimelineEvent[] };

      return payload.events;
    },
    async getPreferences() {
      const response = await fetch(`${baseUrl}/api/preferences`);

      if (!response.ok) {
        throw new Error("Failed to load preferences");
      }

      return (await response.json()) as Preferences;
    },
    async listKanbanProjects() {
      const response = await fetch(`${baseUrl}/api/kanban/projects`);

      if (!response.ok) {
        throw new Error("Failed to load kanban projects");
      }

      const payload = (await response.json()) as { projects: KanbanProject[] };

      return payload.projects;
    },
    async createKanbanProject(project) {
      const response = await fetch(`${baseUrl}/api/kanban/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...project,
          agents: project.agents ?? getKanbanTemplateAgents()
        })
      });

      if (!response.ok) {
        throw new Error("Failed to create kanban project");
      }

      const payload = (await response.json()) as { sessions: string[] };

      return payload.sessions;
    },
    async removeKanbanSession(projectName, agentName, options = {}) {
      const params = new URLSearchParams({
        kill: options.kill ? "true" : "false"
      });
      const response = await fetch(
        `${baseUrl}/api/kanban/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(agentName)}?${params.toString()}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove kanban session");
      }
    },
    async addKanbanSession(projectName, sessionName) {
      const response = await fetch(
        `${baseUrl}/api/kanban/projects/${encodeURIComponent(projectName)}/sessions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ sessionName })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to add kanban session");
      }
    },
    async deleteKanbanProject(projectName) {
      const response = await fetch(
        `${baseUrl}/api/kanban/projects/${encodeURIComponent(projectName)}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete kanban project");
      }
    },
    async listGroupMessages(projectName) {
      const response = await fetch(
        `${baseUrl}/api/kanban/projects/${encodeURIComponent(projectName)}/messages`
      );

      if (!response.ok) {
        throw new Error("Failed to load group messages");
      }

      const payload = (await response.json()) as { messages: GroupMessage[] };

      return payload.messages;
    },
    async sendGroupMessage(projectName, request) {
      const response = await fetch(
        `${baseUrl}/api/kanban/projects/${encodeURIComponent(projectName)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(request)
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send group message");
      }

      const payload = (await response.json()) as { message: GroupMessage };

      return payload.message;
    },
    async scanGroupMessage(projectName, messageId) {
      const response = await fetch(
        `${baseUrl}/api/kanban/projects/${encodeURIComponent(projectName)}/messages/${encodeURIComponent(messageId)}/scan`,
        {
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error("Failed to scan group message replies");
      }

      const payload = (await response.json()) as { message: GroupMessage };

      return payload.message;
    },
    async setPinnedSession(name: string, pinned: boolean) {
      const response = await fetch(
        `${baseUrl}/api/preferences/pinned-sessions/${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ pinned })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update favorite session");
      }
    },
    async setMutedSession(name: string, muted: boolean) {
      const response = await fetch(
        `${baseUrl}/api/preferences/muted-sessions/${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ muted })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update muted session");
      }
    },
    async setSessionSettings(name: string, settings: SessionSettings) {
      const response = await fetch(
        `${baseUrl}/api/preferences/session-settings/${encodeURIComponent(name)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ settings })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update session settings");
      }
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
    async sendInput(name: string, input: string) {
      const response = await fetch(
        `${baseUrl}/api/sessions/${encodeURIComponent(name)}/input`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ input })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send tmux input");
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
