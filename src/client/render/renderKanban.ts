import type { KanbanProject } from "../api/sessionApi";

export type KanbanDraft = {
  name: string;
  path: string;
  server: string;
  agentsText: string;
};

export type KanbanState = {
  projects: KanbanProject[];
  draft: KanbanDraft;
  loading: boolean;
  error: string | null;
  onDraftChange: (draft: KanbanDraft) => void;
  onCreateProject: () => void;
  onOpenSession: (sessionName: string) => void;
};

function normalizeSessionNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getKanbanAgentSessionName(projectName: string, agentName: string) {
  return `${normalizeSessionNamePart(projectName)}-${normalizeSessionNamePart(agentName)}`;
}

function renderField(
  labelText: string,
  input: HTMLInputElement | HTMLTextAreaElement
) {
  const label = document.createElement("label");
  const labelTitle = document.createElement("span");
  labelTitle.textContent = labelText;
  label.append(labelTitle, input);

  return label;
}

export function renderKanban(root: HTMLElement, state: KanbanState) {
  root.innerHTML = "";

  const section = document.createElement("section");
  section.className = "kanban-root";

  const header = document.createElement("header");
  header.className = "kanban-header";

  const title = document.createElement("h1");
  title.textContent = "Kanban";

  const subtitle = document.createElement("p");
  subtitle.textContent =
    "Create project-scoped tmux sessions for Claude, Codex, Kiro, and other agents.";
  header.append(title, subtitle);

  const form = document.createElement("form");
  form.className = "kanban-create-form";

  const nameInput = document.createElement("input");
  nameInput.name = "project-name";
  nameInput.placeholder = "xxvisa";
  nameInput.value = state.draft.name;

  const pathInput = document.createElement("input");
  pathInput.name = "project-path";
  pathInput.placeholder = "/srv/project";
  pathInput.value = state.draft.path;

  const serverInput = document.createElement("input");
  serverInput.name = "project-server";
  serverInput.placeholder = "tw1";
  serverInput.value = state.draft.server;

  const agentsInput = document.createElement("textarea");
  agentsInput.name = "project-agents";
  agentsInput.placeholder = "claude:claude --resume project\ncodex\nkiro";
  agentsInput.value = state.draft.agentsText;

  const emitDraftChange = () => {
    state.onDraftChange({
      name: nameInput.value,
      path: pathInput.value,
      server: serverInput.value,
      agentsText: agentsInput.value
    });
  };

  nameInput.addEventListener("input", emitDraftChange);
  pathInput.addEventListener("input", emitDraftChange);
  serverInput.addEventListener("input", emitDraftChange);
  agentsInput.addEventListener("input", emitDraftChange);

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Create project";
  submit.disabled = state.loading;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.onCreateProject();
  });

  form.append(
    renderField("Project", nameInput),
    renderField("Path", pathInput),
    renderField("Server", serverInput),
    renderField("Agents", agentsInput),
    submit
  );

  section.append(header, form);

  if (state.error) {
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = state.error;
    section.append(error);
  }

  const list = document.createElement("div");
  list.className = "kanban-project-list";

  state.projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "kanban-project-card";

    const cardHeader = document.createElement("div");
    cardHeader.className = "kanban-project-header";

    const projectTitle = document.createElement("h2");
    projectTitle.textContent = project.name;

    const server = document.createElement("span");
    server.className = "kanban-project-server";
    server.textContent = project.server || "local";
    cardHeader.append(projectTitle, server);

    const path = document.createElement("div");
    path.className = "kanban-project-path";
    path.textContent = project.path;
    path.title = project.path;

    const agents = document.createElement("div");
    agents.className = "kanban-agent-list";

    project.agents.forEach((agent) => {
      const sessionName = getKanbanAgentSessionName(project.name, agent.name);
      const agentCard = document.createElement("div");
      agentCard.className = "kanban-agent-card";

      const agentName = document.createElement("strong");
      agentName.textContent = agent.name;

      const agentKind = document.createElement("span");
      agentKind.textContent = agent.kind;

      const agentSession = document.createElement("code");
      agentSession.textContent = sessionName;

      const agentCommand = document.createElement("p");
      agentCommand.textContent = agent.command || "resume manually in this tmux session";

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "kanban-agent-open";
      openButton.textContent = "Open";
      openButton.addEventListener("click", () => state.onOpenSession(sessionName));

      agentCard.append(agentName, agentKind, agentSession, agentCommand, openButton);
      agents.append(agentCard);
    });

    card.append(cardHeader, path, agents);
    list.append(card);
  });

  if (state.projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "kanban-empty";
    empty.textContent = "No projects yet.";
    list.append(empty);
  }

  section.append(list);
  root.append(section);
}
