import type {
  KanbanStatusProject,
  KanbanStatusSession
} from "./sessionStatusBar";
import type { ResponsiveUiTier } from "../responsiveUiTier";

export type SessionGroupRailActions = {
  onOpenSession?: (sessionName: string) => void;
  onOpenGroupTask?: () => void;
  uiTier?: ResponsiveUiTier;
};

function createSessionButton(
  currentSessionName: string,
  session: KanbanStatusSession,
  actions: SessionGroupRailActions
) {
  const isCurrent = session.name === currentSessionName;
  const isOffline = session.live === false;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `terminal-session-rail-session${
    isCurrent ? " is-active" : ""
  }${isOffline ? " is-offline" : ""}`;
  button.dataset.action = "top-switch-kanban-session";
  button.dataset.sessionName = session.name;
  button.textContent = session.label;
  button.title = isCurrent
    ? `Current session: ${session.name}`
    : isOffline
      ? `Offline saved session: ${session.name}`
    : `Switch to ${session.name}`;
  button.disabled = isOffline;

  if (isCurrent) {
    button.setAttribute("aria-current", "true");
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (!isCurrent && !isOffline) {
      actions.onOpenSession?.(session.name);
    }
  });

  return button;
}

export function renderSessionGroupRail(
  root: HTMLElement,
  currentSessionName: string,
  project: KanbanStatusProject | null | undefined,
  actions: SessionGroupRailActions = {}
) {
  root.querySelector(".terminal-session-rail")?.remove();

  if (!project || project.sessions.length <= 1) {
    root.classList.remove("has-session-rail");
    return;
  }

  const rail = document.createElement("nav");
  rail.className = "terminal-session-rail";
  rail.setAttribute(
    "aria-label",
    `Sessions in Kanban project ${project.name}`
  );

  const projectLabel = document.createElement("span");
  projectLabel.className = "terminal-session-rail-project";
  projectLabel.textContent = project.name;
  projectLabel.title = `Kanban project: ${project.name}`;
  rail.append(projectLabel);

  if (actions.onOpenGroupTask) {
    const taskButton = document.createElement("button");
    taskButton.type = "button";
    taskButton.className = "terminal-session-rail-action";
    taskButton.dataset.action = "top-open-group-task";
    taskButton.textContent = "📝";
    taskButton.setAttribute("aria-label", "Task");
    taskButton.title = `Send task in ${project.name}`;
    taskButton.addEventListener("click", (event) => {
      event.stopPropagation();
      actions.onOpenGroupTask?.();
    });
    rail.append(taskButton);
  }

  const sessions = document.createElement("div");
  sessions.className = "terminal-session-rail-sessions";

  project.sessions.forEach((session) => {
    sessions.append(createSessionButton(currentSessionName, session, actions));
  });

  rail.append(sessions);
  root.classList.add("has-session-rail");
  root.prepend(rail);
}
