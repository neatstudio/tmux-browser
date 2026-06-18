import type {
  KanbanProject
} from "../api/sessionApi";
import {
  KANBAN_RECOMMENDED_SESSIONS
} from "../../shared/kanbanTemplates";

export type KanbanDraft = {
  name: string;
  path: string;
  server: string;
  selectedAgentNames: string[];
};

export type KanbanState = {
  projects: KanbanProject[];
  draft: KanbanDraft;
  loading: boolean;
  error: string | null;
  onDraftChange: (draft: KanbanDraft, options?: { render?: boolean }) => void;
  onCreateProject: () => void;
  onOpenSession: (sessionName: string) => void;
  onRemoveSession: (projectName: string, agentName: string) => void;
  onKillSession: (projectName: string, agentName: string) => void;
  onDeleteProject: (projectName: string) => void;
  confirm?: (message: string) => boolean;
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

function getSessionNameForProject(projectName: string, sessionName: string) {
  return getKanbanAgentSessionName(projectName, sessionName);
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
  pathInput.placeholder = "~";
  pathInput.value = state.draft.path;

  const serverInput = document.createElement("input");
  serverInput.name = "project-server";
  serverInput.placeholder = "tw1";
  serverInput.value = state.draft.server;

  const emitDraftChange = () => {
    state.onDraftChange({
      name: nameInput.value,
      path: pathInput.value,
      server: serverInput.value,
      selectedAgentNames: [...state.draft.selectedAgentNames]
    }, { render: false });
  };

  nameInput.addEventListener("input", emitDraftChange);
  pathInput.addEventListener("input", emitDraftChange);
  serverInput.addEventListener("input", emitDraftChange);

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
    submit
  );

  const template = document.createElement("section");
  template.className = "kanban-template";

  const templateHeader = document.createElement("div");
  templateHeader.className = "kanban-template-header";

  const templateTitle = document.createElement("h2");
  templateTitle.textContent = "Recommended sessions";

  const templateHint = document.createElement("p");
  templateHint.textContent =
    "Choose the tmux sessions to create now. The project is saved either way.";
  templateHeader.append(templateTitle, templateHint);

  const templateList = document.createElement("div");
  templateList.className = "kanban-template-list";

  KANBAN_RECOMMENDED_SESSIONS.forEach((session) => {
    const row = document.createElement("label");
    row.className = "kanban-template-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.draft.selectedAgentNames.includes(session.name);
    checkbox.addEventListener("change", () => {
      const selectedAgentNames = checkbox.checked
        ? [...new Set([...state.draft.selectedAgentNames, session.name])]
        : state.draft.selectedAgentNames.filter((name) => name !== session.name);

      state.onDraftChange({
        ...state.draft,
        name: nameInput.value,
        path: pathInput.value,
        server: serverInput.value,
        selectedAgentNames
      }, { render: true });
    });

    const info = document.createElement("div");
    info.className = "kanban-template-info";

    const role = document.createElement("strong");
    role.textContent = session.name;

    const summary = document.createElement("span");
    summary.textContent = session.description;

    const derived = document.createElement("code");
    derived.textContent = getSessionNameForProject(
      state.draft.name || "project",
      session.name
    );

    info.append(role, summary, derived);
    row.append(checkbox, info);

    templateList.append(row);
  });

  template.append(templateHeader, templateList);
  form.append(template);

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

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "kanban-project-close";
    closeButton.textContent = "Close";
    closeButton.title = "Close this kanban project";
    closeButton.addEventListener("click", () => {
      const shouldClose = (state.confirm ?? window.confirm)(
        `Close kanban project ${project.name}?`
      );

      if (shouldClose) {
        state.onDeleteProject(project.name);
      }
    });

    cardHeader.append(projectTitle, server, closeButton);

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

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "kanban-agent-remove";
      removeButton.textContent = "Remove";
      removeButton.title = "Remove from kanban only";
      removeButton.addEventListener("click", () =>
        state.onRemoveSession(project.name, agent.name)
      );

      const killButton = document.createElement("button");
      killButton.type = "button";
      killButton.className = "kanban-agent-kill";
      killButton.textContent = "Kill";
      killButton.title = "Kill tmux session and remove from kanban";
      killButton.addEventListener("click", () =>
        state.onKillSession(project.name, agent.name)
      );

      const agentActions = document.createElement("div");
      agentActions.className = "kanban-agent-actions";
      agentActions.append(openButton, removeButton, killButton);

      agentCard.append(agentName, agentKind, agentSession, agentCommand, agentActions);
      agents.append(agentCard);
    });

    const actions = document.createElement("div");
    actions.className = "kanban-project-actions";

    const createInfo = document.createElement("span");
    createInfo.textContent = `${project.agents.length} recommended sessions`;
    actions.append(createInfo);

    card.append(cardHeader, path, actions, agents);
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
