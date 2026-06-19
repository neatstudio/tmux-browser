import type {
  KanbanStatusProject,
  KanbanStatusSession
} from "./sessionStatusBar";

export type SessionGroupRailActions = {
  maxVisibleSessions?: number;
  onOpenSession?: (sessionName: string) => void;
  onOpenGroupTask?: () => void;
};

function getVisibleSessions(
  currentSessionName: string,
  sessions: KanbanStatusSession[],
  maxVisibleSessions: number
) {
  const firstVisibleSessions = sessions.slice(0, maxVisibleSessions);
  const currentVisible = firstVisibleSessions.some(
    (session) => session.name === currentSessionName
  );

  if (currentVisible || maxVisibleSessions >= sessions.length) {
    return firstVisibleSessions;
  }

  const current = sessions.find((session) => session.name === currentSessionName);

  if (!current) {
    return firstVisibleSessions;
  }

  return [
    ...firstVisibleSessions.slice(0, Math.max(0, maxVisibleSessions - 1)),
    current
  ];
}

function createSessionButton(
  currentSessionName: string,
  session: KanbanStatusSession,
  actions: SessionGroupRailActions
) {
  const isCurrent = session.name === currentSessionName;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `terminal-session-rail-session${
    isCurrent ? " is-active" : ""
  }`;
  button.dataset.action = "top-switch-kanban-session";
  button.dataset.sessionName = session.name;
  button.textContent = session.label;
  button.title = isCurrent
    ? `Current session: ${session.name}`
    : `Switch to ${session.name}`;

  if (isCurrent) {
    button.setAttribute("aria-current", "true");
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (!isCurrent) {
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

  const maxVisibleSessions = Math.max(1, actions.maxVisibleSessions ?? 8);
  const visibleSessions = getVisibleSessions(
    currentSessionName,
    project.sessions,
    maxVisibleSessions
  );
  const visibleSessionNames = new Set(
    visibleSessions.map((session) => session.name)
  );
  const hiddenSessions = project.sessions.filter(
    (session) => !visibleSessionNames.has(session.name)
  );
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
    taskButton.textContent = "Task";
    taskButton.title = `Send task in ${project.name}`;
    taskButton.addEventListener("click", (event) => {
      event.stopPropagation();
      actions.onOpenGroupTask?.();
    });
    rail.append(taskButton);
  }

  const sessions = document.createElement("div");
  sessions.className = "terminal-session-rail-sessions";

  visibleSessions.forEach((session) => {
    sessions.append(createSessionButton(currentSessionName, session, actions));
  });

  if (hiddenSessions.length > 0) {
    const overflow = document.createElement("span");
    overflow.className = "terminal-session-rail-overflow";
    overflow.dataset.action = "top-kanban-overflow";
    overflow.textContent = `+${hiddenSessions.length}`;
    overflow.title = hiddenSessions
      .map((session) => session.label)
      .join(", ");
    sessions.append(overflow);
  }

  rail.append(sessions);
  root.classList.add("has-session-rail");
  root.prepend(rail);
}
