import type {
  SessionSummary,
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
  sessions?: SessionSummary[];
  targetProjectName?: string | null;
  draft: KanbanDraft;
  availableSessions: string[];
  loading: boolean;
  error: string | null;
  onDraftChange: (draft: KanbanDraft, options?: { render?: boolean }) => void;
  onCreateProject: () => void;
  onOpenSession: (sessionName: string) => void;
  onRemoveSession: (projectName: string, agentName: string) => void;
  onKillSession: (projectName: string, agentName: string) => void;
  onAddSession: (projectName: string, sessionName: string) => void;
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

function getKanbanAgentActualSessionName(projectName: string, agent: KanbanProject["agents"][number]) {
  return agent.sessionName ?? getKanbanAgentSessionName(projectName, agent.name);
}

function getKanbanProjectElementId(projectName: string) {
  return `kanban-project-${normalizeSessionNamePart(projectName)}`;
}

function getSessionPreview(
  sessions: SessionSummary[] | undefined,
  sessionName: string
) {
  return sessions?.find((session) => session.name === sessionName)?.preview ?? null;
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePreviewLine(value: string, limit = 66) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return " ";
  }

  return normalized.length > limit
    ? `${normalized.slice(0, Math.max(0, limit - 1))}…`
    : normalized;
}

function buildPreviewThumbnailDataUrl(
  projectName: string,
  sessionName: string,
  preview: string | null
) {
  const previewLines = (preview ?? "")
    .split(/\r?\n/)
    .map((line) => normalizePreviewLine(line));
  const visibleLines =
    previewLines.filter((line) => line.trim().length > 0).slice(-8);
  const lines = visibleLines.length
    ? visibleLines
    : ["No recent tmux preview available."];
  const summary = (preview ?? "No recent tmux preview available.")
    .replace(/\s+/g, " ")
    .trim();
  const alt = `Tmux preview for ${sessionName} in ${projectName}: ${summary}`;
  const lineMarkup = lines
    .map(
      (line, index) =>
        `<text x="28" y="${94 + index * 24}" fill="rgba(239,246,252,0.88)" font-family="Iosevka Term, Menlo, PingFang SC, monospace" font-size="18" xml:space="preserve">${escapeSvgText(line)}</text>`
    )
    .join("");
  const footer = escapeSvgText(`tmux preview · ${sessionName}`);
  const header = escapeSvgText(projectName);
  const body = escapeSvgText(sessionName);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="280" viewBox="0 0 640 280" role="img" aria-label="${escapeSvgText(alt)}">
  <defs>
    <linearGradient id="kanbanPreviewBg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#111820"/>
      <stop offset="100%" stop-color="#0a0f14"/>
    </linearGradient>
    <linearGradient id="kanbanPreviewPanel" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#18212a"/>
      <stop offset="100%" stop-color="#0f151b"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="640" height="280" rx="20" fill="url(#kanbanPreviewBg)"/>
  <rect x="16" y="16" width="608" height="248" rx="16" fill="url(#kanbanPreviewPanel)" stroke="#2a3641" stroke-width="1.5"/>
  <circle cx="42" cy="42" r="7" fill="#ff5f5f"/>
  <circle cx="66" cy="42" r="7" fill="#ffbd4c"/>
  <circle cx="90" cy="42" r="7" fill="#34c759"/>
  <text x="122" y="47" fill="#99a8b4" font-family="Iosevka Term, Menlo, PingFang SC, monospace" font-size="18">${header}</text>
  <text x="122" y="74" fill="#d5ffd8" font-family="Iosevka Term, Menlo, PingFang SC, monospace" font-size="20" font-weight="700">${body}</text>
  <rect x="24" y="86" width="592" height="150" rx="10" fill="#0c1116" stroke="#21303a" stroke-width="1"/>
  <text x="38" y="106" fill="#6fe16f" font-family="Iosevka Term, Menlo, PingFang SC, monospace" font-size="15">preview</text>
  ${lineMarkup}
  <text x="28" y="222" fill="#54616d" font-family="Iosevka Term, Menlo, PingFang SC, monospace" font-size="14">${footer}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderKillConfirm(
  projectName: string,
  sessionName: string,
  preview: string | null,
  onConfirm: () => void,
  onCancel: () => void
) {
  const confirm = document.createElement("section");
  confirm.className = "kanban-kill-confirm";
  confirm.setAttribute("role", "alertdialog");
  confirm.setAttribute("aria-label", `Confirm kill ${sessionName}`);

  const title = document.createElement("strong");
  title.textContent = `Kill ${sessionName}?`;

  const hint = document.createElement("span");
  hint.textContent = `This will kill the tmux session and remove it from ${projectName}.`;

  const previewBox = document.createElement("figure");
  previewBox.className = "kanban-kill-preview";

  const previewImage = document.createElement("img");
  previewImage.className = "kanban-kill-preview-image";
  previewImage.alt = `Tmux preview for ${sessionName} in ${projectName}: ${
    (preview ?? "No recent tmux preview available.")
      .replace(/\s+/g, " ")
      .trim()
  }`;
  previewImage.src = buildPreviewThumbnailDataUrl(projectName, sessionName, preview);
  previewBox.append(previewImage);

  const actions = document.createElement("div");
  actions.className = "kanban-kill-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.dataset.action = "cancel-kanban-kill";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", onCancel);

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.dataset.action = "confirm-kanban-kill";
  confirmButton.textContent = "Kill session";
  confirmButton.addEventListener("click", onConfirm);

  actions.append(cancelButton, confirmButton);
  confirm.append(title, hint, previewBox, actions);

  return confirm;
}

export function renderKanban(root: HTMLElement, state: KanbanState) {
  let pendingKill:
    | { projectName: string; sessionName: string; preview: string | null }
    | null = null;

  const draw = () => {
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
      state.onDraftChange(
        {
          name: nameInput.value,
          path: pathInput.value,
          server: serverInput.value,
          selectedAgentNames: [...state.draft.selectedAgentNames]
        },
        { render: false }
      );
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

        state.onDraftChange(
          {
            ...state.draft,
            name: nameInput.value,
            path: pathInput.value,
            server: serverInput.value,
            selectedAgentNames
          },
          { render: true }
        );
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
    const isTargeted = state.targetProjectName === project.name;
    card.className = `kanban-project-card${isTargeted ? " is-targeted" : ""}`;
    card.id = getKanbanProjectElementId(project.name);
    card.dataset.projectName = project.name;

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
      const sessionName = getKanbanAgentActualSessionName(project.name, agent);
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
        state.onRemoveSession(project.name, sessionName)
      );

      const killButton = document.createElement("button");
      killButton.type = "button";
      killButton.className = "kanban-agent-kill";
      killButton.textContent = "Kill";
      killButton.title = "Kill tmux session and remove from kanban";
      killButton.addEventListener("click", () => {
        pendingKill = {
          projectName: project.name,
          sessionName,
          preview: getSessionPreview(state.sessions, sessionName)
        };
        draw();
      });

      const agentActions = document.createElement("div");
      agentActions.className = "kanban-agent-actions";
      agentActions.append(openButton, removeButton, killButton);

      agentCard.append(agentName, agentKind, agentSession, agentCommand, agentActions);
      if (
        pendingKill?.projectName === project.name &&
        pendingKill.sessionName === sessionName
      ) {
        agentCard.append(
          renderKillConfirm(
            project.name,
            sessionName,
            pendingKill.preview,
            () => {
              pendingKill = null;
              state.onKillSession(project.name, sessionName);
            },
            () => {
              pendingKill = null;
              draw();
            }
          )
        );
      }
      agents.append(agentCard);
    });

    const actions = document.createElement("div");
    actions.className = "kanban-project-actions";

    const createInfo = document.createElement("span");
    createInfo.textContent = `${project.agents.length} recommended sessions`;
    actions.append(createInfo);

    const addSessionForm = document.createElement("form");
    addSessionForm.className = "kanban-add-session-form";

    const addSessionSelect = document.createElement("select");
    addSessionSelect.className = "kanban-add-session-select";
    addSessionSelect.setAttribute("aria-label", `Add existing session to ${project.name}`);

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Add existing";
    addSessionSelect.append(placeholder);

    const existingSessionNames = new Set(
      project.agents.map((agent) =>
        getKanbanAgentActualSessionName(project.name, agent)
      )
    );

    state.availableSessions
      .filter((sessionName) => !existingSessionNames.has(sessionName))
      .forEach((sessionName) => {
        const option = document.createElement("option");
        option.value = sessionName;
        option.textContent = sessionName;
        addSessionSelect.append(option);
      });

    const addSessionButton = document.createElement("button");
    addSessionButton.type = "submit";
    addSessionButton.className = "kanban-add-session-button";
    addSessionButton.textContent = "Add";

    addSessionForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!addSessionSelect.value) {
        return;
      }

      state.onAddSession(project.name, addSessionSelect.value);
    });

    addSessionForm.append(addSessionSelect, addSessionButton);
    actions.append(addSessionForm);

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
  };

  draw();
}
