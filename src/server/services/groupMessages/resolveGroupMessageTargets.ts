import type { GroupMessageTarget } from "../../../shared/groupMessages.js";
import type {
  KanbanAgent,
  KanbanProject
} from "../preferences/createPreferenceStore.js";

export type ResolveGroupMessageTargetsInput = {
  project: KanbanProject;
  liveSessionNames: string[];
  fromSession: string;
  target: GroupMessageTarget;
};

export type ResolveGroupMessageTargetsResult = {
  sessions: string[];
  warnings: string[];
};

function normalizeSessionNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getKanbanAgentSessionName(projectName: string, agentName: string) {
  const normalizedProjectName = normalizeSessionNamePart(projectName);
  const normalizedAgentName = normalizeSessionNamePart(agentName);

  return normalizedProjectName && normalizedAgentName
    ? `${normalizedProjectName}-${normalizedAgentName}`
    : "";
}

function getAgentSessionName(projectName: string, agent: KanbanAgent) {
  return agent.sessionName ?? getKanbanAgentSessionName(projectName, agent.name);
}

function agentMatchesRole(projectName: string, agent: KanbanAgent, role: string) {
  const normalizedRole = normalizeSessionNamePart(role);
  const normalizedAgentName = normalizeSessionNamePart(agent.name);
  const normalizedKind = normalizeSessionNamePart(agent.kind);
  const sessionName = getAgentSessionName(projectName, agent);

  return (
    normalizedAgentName === normalizedRole ||
    normalizedKind === normalizedRole ||
    normalizeSessionNamePart(sessionName).endsWith(`-${normalizedRole}`)
  );
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function resolveGroupMessageTargets(
  input: ResolveGroupMessageTargetsInput
): ResolveGroupMessageTargetsResult {
  const liveSessionNames = new Set(input.liveSessionNames);
  const warnings: string[] = [];
  const target = input.target;
  let candidateSessions: string[];

  switch (target.type) {
    case "session":
      candidateSessions = [target.sessionName.trim()];
      break;
    case "others":
      candidateSessions = input.project.agents
        .map((agent) => getAgentSessionName(input.project.name, agent))
        .filter((sessionName) => sessionName !== input.fromSession);
      break;
    case "role":
      candidateSessions = input.project.agents
        .filter((agent) => agentMatchesRole(input.project.name, agent, target.role))
        .map((agent) => getAgentSessionName(input.project.name, agent));
      break;
  }

  const sessions = unique(candidateSessions).filter((sessionName) => {
    if (liveSessionNames.has(sessionName)) {
      return true;
    }

    warnings.push(`Session ${sessionName} is not live`);
    return false;
  });

  if (sessions.length === 0) {
    if (warnings.length === 0) {
      warnings.push("No matching target sessions");
    }

    throw new Error("No live target sessions found");
  }

  return { sessions, warnings };
}
