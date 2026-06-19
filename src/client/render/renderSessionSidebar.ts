import type { KanbanProject, SessionSummary } from "../api/sessionApi";
import type { TimelineEvent } from "../../shared/timeline";
import type { DashboardState } from "../state/dashboardStore";
import {
  formatDashboardSessionActivity,
  formatDisplayPath
} from "./renderDashboard";

type BrowserSessionTabState = {
  sessionName: string;
  active: boolean;
};

function isPinnedSession(sessionName: string, pinnedSessionNames?: Set<string>) {
  return pinnedSessionNames?.has(sessionName) ?? false;
}

function isMutedSession(sessionName: string, mutedSessionNames?: Set<string>) {
  return mutedSessionNames?.has(sessionName) ?? false;
}

function appendSidebarMeta(parent: HTMLElement, text: string | null | undefined) {
  if (!text) {
    return;
  }

  const item = document.createElement("span");
  item.className = "session-sidebar-meta-item";
  item.textContent = text;
  item.title = text;
  parent.append(item);
}

function getBrowserStatus(
  sessionName: string,
  browserTabs: BrowserSessionTabState[] | undefined
) {
  const tab = browserTabs?.find((item) => item.sessionName === sessionName);

  if (!tab) {
    return null;
  }

  return tab.active ? "ACTIVE" : "OPEN";
}

function getCompactSessionMarker(sessionName: string) {
  const normalized = sessionName
    .trim()
    .replace(/^[^a-zA-Z0-9]+/, "")
    .slice(0, 2)
    .toLowerCase();

  return normalized || "?";
}

function renderSessionButton(
  session: SessionSummary,
  state: DashboardState,
  actions: {
    activeSessionName: string | null;
    browserTabs?: BrowserSessionTabState[];
    pinnedSessionNames?: Set<string>;
    mutedSessionNames?: Set<string>;
    hiddenSessionNames?: Set<string>;
    onOpenSession: (name: string) => void;
    onTogglePinned: (name: string) => void;
    onToggleMuted?: (name: string) => void;
  }
) {
  const button = document.createElement("button");
  const browserStatus = getBrowserStatus(session.name, actions.browserTabs);
  const isActive = actions.activeSessionName === session.name;
  const isPinned = isPinnedSession(session.name, actions.pinnedSessionNames);
  const isMuted = isMutedSession(session.name, actions.mutedSessionNames);
  const path = formatDisplayPath(
    session.currentPath,
    state.serverStatus?.homeDirectory
  );
  const iconText = getCompactSessionMarker(session.name);

  button.type = "button";
  button.className = `session-sidebar-item${isActive ? " is-active" : ""}${
    isPinned ? " is-pinned" : ""
  }${isMuted ? " is-muted" : ""}`;
  button.dataset.sessionName = session.name;
  button.setAttribute("aria-label", [session.name, path].filter(Boolean).join(" · "));
  button.title = [session.name, path, session.currentCommand]
    .filter(Boolean)
    .join(" · ");
  button.addEventListener("click", () => actions.onOpenSession(session.name));

  const header = document.createElement("span");
  header.className = "session-sidebar-item-header";

  const icon = document.createElement("span");
  icon.className = "session-sidebar-icon";
  icon.textContent = iconText;
  icon.setAttribute("aria-hidden", "true");

  const name = document.createElement("strong");
  name.className = "session-sidebar-name session-sidebar-text";
  name.textContent = session.name;
  header.append(icon, name);

  const pinButton = document.createElement("button");
  pinButton.type = "button";
  pinButton.className = "session-sidebar-pin session-sidebar-collapse-hidden";
  pinButton.dataset.collapsedHidden = "true";
  pinButton.dataset.action = "toggle-sidebar-pin";
  pinButton.setAttribute("aria-label", `${isPinned ? "Unpin" : "Pin"} ${session.name}`);
  pinButton.setAttribute("aria-pressed", isPinned ? "true" : "false");
  pinButton.title = isPinned ? "Unpin from sidebar" : "Pin to sidebar";
  pinButton.textContent = isPinned ? "★" : "☆";
  pinButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    actions.onTogglePinned(session.name);
  });

  const muteButton = document.createElement("button");
  muteButton.type = "button";
  muteButton.className = "session-sidebar-mute session-sidebar-collapse-hidden";
  muteButton.dataset.collapsedHidden = "true";
  muteButton.dataset.action = "toggle-sidebar-muted";
  muteButton.setAttribute("aria-label", `${isMuted ? "Unmute" : "Mute"} ${session.name}`);
  muteButton.setAttribute("aria-pressed", isMuted ? "true" : "false");
  muteButton.title = isMuted ? "Unmute session refresh" : "Mute heavy refresh";
  muteButton.textContent = "M";
  muteButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    actions.onToggleMuted?.(session.name);
  });

  const badges = document.createElement("span");
  badges.className =
    "session-sidebar-badges session-sidebar-text session-sidebar-collapse-hidden";
  badges.dataset.collapsedHidden = "true";

  const tmuxStatus = document.createElement("span");
  tmuxStatus.className = `session-sidebar-badge is-${session.status}`;
  tmuxStatus.textContent = session.status;
  badges.append(tmuxStatus);

  if (browserStatus) {
    const browserBadge = document.createElement("span");
    browserBadge.className = "session-sidebar-badge is-browser";
    browserBadge.textContent = browserStatus;
    badges.append(browserBadge);
  }

  if (isMuted) {
    const mutedBadge = document.createElement("span");
    mutedBadge.className = "session-sidebar-badge is-muted";
    mutedBadge.textContent = "MUTE";
    badges.append(mutedBadge);
  }

  if (session.inputPrompt) {
    const promptBadge = document.createElement("span");
    promptBadge.className = "session-sidebar-badge is-waiting";
    promptBadge.textContent = "WAIT";
    badges.append(promptBadge);
  }

  header.append(pinButton, muteButton, badges);

  const meta = document.createElement("span");
  meta.className = "session-sidebar-meta";
  appendSidebarMeta(meta, `${session.windows}w ${session.paneCount}p`);
  appendSidebarMeta(meta, session.currentCommand);
  appendSidebarMeta(meta, formatDashboardSessionActivity(session.lastActivityAt));

  const pathItem = document.createElement("span");
  pathItem.className = "session-sidebar-path";
  pathItem.textContent = path;
  pathItem.title = path;

  button.append(header, meta, pathItem);

  return button;
}

function renderSessionGroup(
  label: string,
  sessions: SessionSummary[],
  state: DashboardState,
  actions: {
    activeSessionName: string | null;
    browserTabs?: BrowserSessionTabState[];
    pinnedSessionNames?: Set<string>;
    mutedSessionNames?: Set<string>;
    onOpenSession: (name: string) => void;
    onTogglePinned: (name: string) => void;
    onToggleMuted?: (name: string) => void;
    onRefreshMuted?: () => void;
  },
  groupType: "pinned" | "sessions" | "muted"
) {
  const group = document.createElement("section");
  group.className = `session-sidebar-group is-${groupType}`;
  group.dataset.group = groupType;

  const title = document.createElement("div");
  title.className = "session-sidebar-group-title session-sidebar-text";
  const titleText = document.createElement("span");
  titleText.textContent = label;
  title.append(titleText);

  if (groupType === "muted" && actions.onRefreshMuted) {
    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "session-sidebar-muted-refresh";
    refreshButton.dataset.action = "refresh-muted-sessions";
    refreshButton.title = "Refresh muted sessions";
    refreshButton.setAttribute("aria-label", "Refresh muted sessions");
    refreshButton.textContent = "↻";
    refreshButton.addEventListener("click", actions.onRefreshMuted);
    title.append(refreshButton);
  }

  group.append(title);

  sessions.forEach((session) => {
    group.append(renderSessionButton(session, state, actions));
  });

  return group;
}

function formatTimelineTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function renderTimeline(events: TimelineEvent[]) {
  const timeline = document.createElement("section");
  timeline.className = "session-sidebar-timeline session-sidebar-text";

  const title = document.createElement("div");
  title.className = "session-sidebar-timeline-title";
  title.textContent = "Timeline";
  timeline.append(title);

  events.slice(0, 5).forEach((event) => {
    const item = document.createElement("div");
    item.className = "session-sidebar-timeline-item";
    item.title = `${event.sessionName ?? "system"} · ${event.message}`;

    const time = document.createElement("span");
    time.className = "session-sidebar-timeline-time";
    time.textContent = formatTimelineTime(event.createdAt);

    const text = document.createElement("span");
    text.className = "session-sidebar-timeline-text";
    text.textContent = `${event.sessionName ?? "system"} · ${event.message}`;

    item.append(time, text);
    timeline.append(item);
  });

  return timeline;
}

function normalizeKanbanSessionNamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getKanbanAgentSessionName(projectName: string, agentName: string) {
  const project = normalizeKanbanSessionNamePart(projectName);
  const agent = normalizeKanbanSessionNamePart(agentName);

  return project && agent ? `${project}-${agent}` : "";
}

function renderKanbanProjectShortcuts(
  projects: KanbanProject[],
  existingSessionNames: Set<string>,
  activeSessionName: string | null,
  onOpenProject: (name: string) => void,
  onOpenSession: (name: string) => void
) {
  const section = document.createElement("section");
  section.className = "session-sidebar-kanban-projects session-sidebar-text";

  const title = document.createElement("div");
  title.className = "session-sidebar-kanban-title";
  title.textContent = "Boards";
  section.append(title);

  projects.forEach((project) => {
    const projectItem = document.createElement("div");
    projectItem.className = "session-sidebar-kanban-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-sidebar-kanban-project";
    button.dataset.action = "open-kanban-project";
    button.dataset.projectName = project.name;
    button.title = `${project.name} · ${project.path}`;
    button.addEventListener("click", () => onOpenProject(project.name));

    const name = document.createElement("span");
    name.textContent = project.name;

    const count = document.createElement("span");
    count.className = "session-sidebar-kanban-count";
    count.textContent = String(project.agents.length);

    button.append(name, count);
    projectItem.append(button);

    if (project.agents.length > 0) {
      const sessions = document.createElement("div");
      sessions.className = "session-sidebar-kanban-sessions";

      project.agents.forEach((agent) => {
        const sessionName =
          agent.sessionName ?? getKanbanAgentSessionName(project.name, agent.name);

        if (!sessionName || !existingSessionNames.has(sessionName)) {
          return;
        }

        const sessionButton = document.createElement("button");
        const isActive = sessionName === activeSessionName;

        sessionButton.type = "button";
        sessionButton.className = `session-sidebar-kanban-session${
          isActive ? " is-active" : ""
        }`;
        sessionButton.dataset.action = "open-kanban-session";
        sessionButton.dataset.projectName = project.name;
        sessionButton.dataset.sessionName = sessionName;
        sessionButton.textContent = agent.name || sessionName;
        sessionButton.title = `Open ${sessionName}`;
        if (isActive) {
          sessionButton.setAttribute("aria-current", "true");
        }
        sessionButton.addEventListener("click", () => onOpenSession(sessionName));
        sessions.append(sessionButton);
      });

      if (sessions.childElementCount > 0) {
        projectItem.append(sessions);
      }
    }

    section.append(projectItem);
  });

  return section;
}

export function renderSessionSidebar(
  root: HTMLElement,
  state: DashboardState,
  actions: {
    activeSessionName: string | null;
    collapsed?: boolean;
    draftSessionName: string;
    browserTabs?: BrowserSessionTabState[];
    pinnedSessionNames?: Set<string>;
    mutedSessionNames?: Set<string>;
    timelineEvents?: TimelineEvent[];
    actionCount?: number;
    actionCenterOpen?: boolean;
    activeView?: "dashboard" | "kanban";
    hiddenSessionNames?: Set<string>;
    kanbanProjects?: KanbanProject[];
    onCreateSession: (name: string) => void;
    onDraftChange: (value: string) => void;
    onOpenDashboard: () => void;
    onOpenKanban?: () => void;
    onOpenKanbanProject?: (name: string) => void;
    onOpenSession: (name: string) => void;
    onTogglePinned: (name: string) => void;
    onToggleMuted?: (name: string) => void;
    onToggleActionCenter?: () => void;
    onRefresh: () => void;
    onRefreshMuted?: () => void;
    onToggleCollapsed?: () => void;
  }
) {
  root.innerHTML = "";

  const mobileLauncher = document.createElement("button");
  mobileLauncher.type = "button";
  mobileLauncher.className = "mobile-sidebar-launcher";
  mobileLauncher.dataset.action = "open-mobile-sidebar";
  mobileLauncher.setAttribute("aria-label", "Open sessions");
  mobileLauncher.addEventListener("click", () => actions.onToggleCollapsed?.());

  const launcherLogo = document.createElement("span");
  launcherLogo.className = "mobile-sidebar-logo";
  launcherLogo.textContent = "T";

  const visibleSessions = state.sessions.filter(
    (session) => !actions.hiddenSessionNames?.has(session.name)
  );

  const launcherCount = document.createElement("span");
  launcherCount.className = "mobile-sidebar-count";
  launcherCount.textContent = String(visibleSessions.length);

  mobileLauncher.append(launcherLogo, launcherCount);

  const sidebar = document.createElement("aside");
  sidebar.className = `session-sidebar${actions.collapsed ? " is-collapsed" : ""}`;
  sidebar.setAttribute("aria-label", "Sessions");

  const header = document.createElement("div");
  header.className = "session-sidebar-header";

  const title = document.createElement("strong");
  title.textContent = "Tmux";

  const count = document.createElement("span");
  count.className = "session-sidebar-text";
  count.textContent = `${visibleSessions.length} sessions`;

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "session-sidebar-toggle";
  toggleButton.dataset.action = "toggle-sidebar";
  toggleButton.setAttribute("aria-label", "Toggle sidebar");
  toggleButton.setAttribute("aria-expanded", actions.collapsed ? "false" : "true");
  toggleButton.textContent = actions.collapsed ? ">" : "<";
  toggleButton.addEventListener("click", () => actions.onToggleCollapsed?.());

  const headerActions = document.createElement("span");
  headerActions.className = "session-sidebar-header-actions";

  if ((actions.actionCount ?? 0) > 0 || actions.actionCenterOpen) {
    const actionCenterButton = document.createElement("button");
    actionCenterButton.type = "button";
    actionCenterButton.className = `session-sidebar-action-center${
      actions.actionCenterOpen ? " is-active" : ""
    }`;
    actionCenterButton.dataset.action = "toggle-action-center";
    actionCenterButton.setAttribute("aria-label", "Open action center");
    actionCenterButton.setAttribute(
      "aria-pressed",
      actions.actionCenterOpen ? "true" : "false"
    );
    actionCenterButton.textContent = `!${actions.actionCount ?? 0}`;
    actionCenterButton.addEventListener("click", () => {
      actions.onToggleActionCenter?.();
    });
    headerActions.append(actionCenterButton);
  }

  headerActions.append(toggleButton);
  header.append(title, count, headerActions);

  const toolbar = document.createElement("div");
  toolbar.className = "session-sidebar-toolbar";

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "session-sidebar-tool-button";
  refreshButton.dataset.action = "refresh-sidebar";
  refreshButton.title = "Refresh sessions";
  refreshButton.setAttribute("aria-label", "Refresh sessions");
  refreshButton.textContent = "↻";
  refreshButton.addEventListener("click", actions.onRefresh);

  const createForm = document.createElement("form");
  createForm.className = "session-sidebar-create-form";

  const createInput = document.createElement("input");
  createInput.name = "sidebar-session-name";
  createInput.placeholder = "new session";
  createInput.value = actions.draftSessionName;
  createInput.addEventListener("input", () => {
    actions.onDraftChange(createInput.value);
  });

  const createButton = document.createElement("button");
  createButton.type = "submit";
  createButton.className = "session-sidebar-tool-button";
  createButton.dataset.action = "new-sidebar-session";
  createButton.title = "New session";
  createButton.textContent = actions.collapsed ? "+" : "New";
  createButton.addEventListener("click", (event) => {
    if (!actions.collapsed) {
      return;
    }

    event.preventDefault();
    actions.onToggleCollapsed?.();
  });

  createForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const sessionName = createInput.value.trim();
    if (!sessionName) {
      return;
    }

    actions.onCreateSession(sessionName);
  });

  createForm.append(createInput, createButton);
  toolbar.append(refreshButton, createForm);

  const kanbanButton = document.createElement("button");
  kanbanButton.type = "button";
  kanbanButton.className = `session-sidebar-dashboard${
    actions.activeSessionName === null
      ? " is-active"
      : ""
  }`;
  kanbanButton.dataset.action = "open-kanban";
  kanbanButton.title = "Open Kanban projects";

  const kanbanIcon = document.createElement("span");
  kanbanIcon.className = "session-sidebar-icon";
  kanbanIcon.textContent = "K";
  kanbanIcon.setAttribute("aria-hidden", "true");

  const kanbanText = document.createElement("span");
  kanbanText.className = "session-sidebar-text";
  kanbanText.textContent = "Kanban";

  kanbanButton.append(kanbanIcon, kanbanText);
  kanbanButton.addEventListener("click", () => actions.onOpenKanban?.());

  const kanbanProjects =
    actions.kanbanProjects && actions.kanbanProjects.length > 0
      ? renderKanbanProjectShortcuts(
          actions.kanbanProjects,
          new Set(state.sessions.map((session) => session.name)),
          actions.activeSessionName,
          actions.onOpenKanbanProject ?? (() => actions.onOpenKanban?.()),
          actions.onOpenSession
        )
      : null;

  const list = document.createElement("div");
  list.className = "session-sidebar-list";

  const pinnedSessions = visibleSessions.filter((session) =>
    isPinnedSession(session.name, actions.pinnedSessionNames)
  );
  const mutedSessions = visibleSessions.filter(
    (session) =>
      !isPinnedSession(session.name, actions.pinnedSessionNames) &&
      isMutedSession(session.name, actions.mutedSessionNames)
  );
  const regularSessions = visibleSessions.filter(
    (session) =>
      !isPinnedSession(session.name, actions.pinnedSessionNames) &&
      !isMutedSession(session.name, actions.mutedSessionNames)
  );

  if (pinnedSessions.length > 0) {
    list.append(renderSessionGroup("Pinned", pinnedSessions, state, actions, "pinned"));
  }

  if (regularSessions.length > 0) {
    list.append(
      renderSessionGroup(
        pinnedSessions.length > 0 ? "Sessions" : "",
        regularSessions,
        state,
        actions,
        "sessions"
      )
    );
  }

  if (mutedSessions.length > 0) {
    list.append(renderSessionGroup("Mute", mutedSessions, state, actions, "muted"));
  }

  if (state.loading) {
    const loading = document.createElement("div");
    loading.className = "session-sidebar-note";
    loading.textContent = "Loading sessions";
    list.append(loading);
  }

  if (state.error) {
    const error = document.createElement("div");
    error.className = "session-sidebar-note is-error";
    error.textContent = state.error;
    list.append(error);
  }

  sidebar.append(
    header,
    kanbanButton,
    ...(kanbanProjects ? [kanbanProjects] : []),
    list
  );

  if (!actions.collapsed && actions.timelineEvents?.length) {
    sidebar.append(renderTimeline(actions.timelineEvents));
  }

  sidebar.append(toolbar);
  root.append(mobileLauncher, sidebar);
}
