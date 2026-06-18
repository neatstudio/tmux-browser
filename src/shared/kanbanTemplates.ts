export type KanbanRecommendedSession = {
  name: string;
  kind: string;
  command: string | null;
  description: string;
  defaultSelected: boolean;
};

export const KANBAN_RECOMMENDED_SESSIONS: KanbanRecommendedSession[] = [
  {
    name: "pm",
    kind: "pm",
    command: null,
    description: "Project coordinator that receives agent reports and assigns next steps.",
    defaultSelected: true
  },
  {
    name: "review",
    kind: "review",
    command: null,
    description: "Review lane for handoffs from pm or implementation agents.",
    defaultSelected: true
  },
  {
    name: "codex",
    kind: "codex",
    command: null,
    description: "Primary implementation session for coding and execution.",
    defaultSelected: true
  },
  {
    name: "claude",
    kind: "claude",
    command: null,
    description: "Long-context analysis or secondary implementation session.",
    defaultSelected: false
  },
  {
    name: "scratch",
    kind: "scratch",
    command: null,
    description: "Temporary shell for tests, logs, and ad hoc commands.",
    defaultSelected: false
  }
];

export function getDefaultKanbanSelectedSessionNames() {
  return KANBAN_RECOMMENDED_SESSIONS
    .filter((session) => session.defaultSelected)
    .map((session) => session.name);
}

export function getKanbanTemplateAgents() {
  return KANBAN_RECOMMENDED_SESSIONS.map((session) => ({
    kind: session.kind,
    name: session.name,
    command: session.command
  }));
}

