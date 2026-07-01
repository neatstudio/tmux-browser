import { KANBAN_RECOMMENDED_SESSIONS } from "../../shared/kanbanTemplates";
import type { ResponsiveUiTier } from "../responsiveUiTier";

export type KanbanCreateDraft = {
  name: string;
  path: string;
  server: string;
  selectedAgentNames: string[];
};

export type KanbanCreatePanelState = {
  draft: KanbanCreateDraft;
  loading: boolean;
  uiTier?: ResponsiveUiTier;
  onDraftChange: (draft: KanbanCreateDraft, options?: { render?: boolean }) => void;
  onCreateProject: (draft: KanbanCreateDraft) => void;
};

function normalizeSessionNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getKanbanAgentSessionName(
  projectName: string,
  agentName: string
) {
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

function renderHiddenInput(name: string, value: string) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;

  return input;
}

function getSessionNameForProject(projectName: string, sessionName: string) {
  return getKanbanAgentSessionName(projectName, sessionName);
}

export function hasKanbanDraftContent(draft: KanbanCreateDraft) {
  return (
    draft.name.trim().length > 0 ||
    draft.server.trim().length > 0 ||
    draft.path.trim() !== "~"
  );
}

export function renderKanbanCreatePanelContent(
  state: KanbanCreatePanelState
) {
  const section = document.createElement("section");
  section.className = "kanban-create-panel-content";
  section.dataset.uiTier = state.uiTier ?? "desktop";

  const form = document.createElement("form");
  form.className = "kanban-create-form";

  const nameInput = document.createElement("input");
  nameInput.name = "project-name";
  nameInput.placeholder = "xxvisa";
  nameInput.value = state.draft.name;

  const projectField = renderField("Project", nameInput);

  const emitDraftChange = () => {
    state.onDraftChange(
      {
        name: nameInput.value,
        path: "~",
        server: "",
        selectedAgentNames: [...state.draft.selectedAgentNames]
      },
      { render: false }
    );
  };

  nameInput.addEventListener("input", emitDraftChange);

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Create group";
  submit.disabled = state.loading;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    state.onCreateProject({
      name: nameInput.value,
      path: "~",
      server: "",
      selectedAgentNames: [...state.draft.selectedAgentNames]
    });
  });

  form.append(
    projectField,
    renderHiddenInput("project-path", "~"),
    submit
  );

  const template = document.createElement("section");
  template.className = "kanban-template";

  const templateHeader = document.createElement("div");
  templateHeader.className = "kanban-template-header";

  const templateTitle = document.createElement("h2");
  templateTitle.textContent = "Recommended sessions";

  templateHeader.append(templateTitle);

  const templateList = document.createElement("div");
  templateList.className = "kanban-template-list";

  KANBAN_RECOMMENDED_SESSIONS.forEach((session) => {
    const row = document.createElement("label");
    row.className = "kanban-template-item";
    if (state.uiTier && state.uiTier !== "desktop") {
      row.classList.add("is-compact");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.draft.selectedAgentNames.includes(session.name);
    checkbox.addEventListener("change", () => {
      const selectedAgentNames = checkbox.checked
        ? [...new Set([...state.draft.selectedAgentNames, session.name])]
        : state.draft.selectedAgentNames.filter((name) => name !== session.name);

      state.onDraftChange(
        {
          name: nameInput.value,
          path: "~",
          server: "",
          selectedAgentNames
        },
        { render: true }
      );
    });

    const info = document.createElement("div");
    info.className = "kanban-template-info";

    const role = document.createElement("strong");
    role.textContent = session.name;

    const derived = document.createElement("code");
    derived.textContent = getSessionNameForProject(
      state.draft.name || "project",
      session.name
    );

    info.append(role, derived);
    row.append(checkbox, info);

    templateList.append(row);
  });

  template.append(templateHeader, templateList);
  form.append(template);

  section.append(form);

  return section;
}

export function createKanbanDraftFromSessionName(
  sessionName: string
): KanbanCreateDraft {
  return {
    name: sessionName,
    path: "~",
    server: "",
    selectedAgentNames: []
  };
}
