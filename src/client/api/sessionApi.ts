export type SessionSummary = {
  name: string;
  windows: number;
};

export type SessionApi = {
  listSessions: () => Promise<SessionSummary[]>;
  createSession: (name: string) => Promise<void>;
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
