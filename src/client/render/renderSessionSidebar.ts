import type { SessionSummary } from "../api/sessionApi";
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

function renderSessionButton(
  session: SessionSummary,
  state: DashboardState,
  actions: {
    activeSessionName: string | null;
    browserTabs?: BrowserSessionTabState[];
    pinnedSessionNames?: Set<string>;
    onOpenSession: (name: string) => void;
    onTogglePinned: (name: string) => void;
  }
) {
  const button = document.createElement("button");
  const browserStatus = getBrowserStatus(session.name, actions.browserTabs);
  const isActive = actions.activeSessionName === session.name;
  const isPinned = isPinnedSession(session.name, actions.pinnedSessionNames);
  const path = formatDisplayPath(
    session.currentPath,
    state.serverStatus?.homeDirectory
  );
  const iconText = session.name.trim().slice(0, 1).toLowerCase() || "?";

  button.type = "button";
  button.className = `session-sidebar-item${isActive ? " is-active" : ""}${
    isPinned ? " is-pinned" : ""
  }`;
  button.dataset.sessionName = session.name;
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
  name.className = "session-sidebar-text";
  name.textContent = session.name;
  header.append(icon, name);

  const pinButton = document.createElement("button");
  pinButton.type = "button";
  pinButton.className = "session-sidebar-pin";
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

  const badges = document.createElement("span");
  badges.className = "session-sidebar-badges session-sidebar-text";

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

  if (session.inputPrompt) {
    const promptBadge = document.createElement("span");
    promptBadge.className = "session-sidebar-badge is-waiting";
    promptBadge.textContent = "WAIT";
    badges.append(promptBadge);
  }

  header.append(pinButton, badges);

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
    onOpenSession: (name: string) => void;
    onTogglePinned: (name: string) => void;
  },
  pinned: boolean
) {
  const group = document.createElement("section");
  group.className = `session-sidebar-group${pinned ? " is-pinned" : ""}`;
  group.dataset.group = pinned ? "pinned" : "sessions";

  const title = document.createElement("div");
  title.className = "session-sidebar-group-title session-sidebar-text";
  title.textContent = label;
  group.append(title);

  sessions.forEach((session) => {
    group.append(renderSessionButton(session, state, actions));
  });

  return group;
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
    onCreateSession: (name: string) => void;
    onDraftChange: (value: string) => void;
    onOpenDashboard: () => void;
    onOpenSession: (name: string) => void;
    onTogglePinned: (name: string) => void;
    onRefresh: () => void;
    onToggleCollapsed?: () => void;
  }
) {
  root.innerHTML = "";

  const sidebar = document.createElement("aside");
  sidebar.className = `session-sidebar${actions.collapsed ? " is-collapsed" : ""}`;
  sidebar.setAttribute("aria-label", "Sessions");

  const header = document.createElement("div");
  header.className = "session-sidebar-header";

  const title = document.createElement("strong");
  title.textContent = "Tmux";

  const count = document.createElement("span");
  count.className = "session-sidebar-text";
  count.textContent = `${state.sessions.length} sessions`;

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "session-sidebar-toggle";
  toggleButton.dataset.action = "toggle-sidebar";
  toggleButton.setAttribute("aria-label", "Toggle sidebar");
  toggleButton.setAttribute("aria-expanded", actions.collapsed ? "false" : "true");
  toggleButton.textContent = actions.collapsed ? ">" : "<";
  toggleButton.addEventListener("click", () => actions.onToggleCollapsed?.());

  header.append(title, count, toggleButton);

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

  const dashboardButton = document.createElement("button");
  dashboardButton.type = "button";
  dashboardButton.className = `session-sidebar-dashboard${
    actions.activeSessionName === null ? " is-active" : ""
  }`;
  dashboardButton.dataset.action = "open-dashboard";
  const dashboardIcon = document.createElement("span");
  dashboardIcon.className = "session-sidebar-icon";
  dashboardIcon.textContent = "D";
  dashboardIcon.setAttribute("aria-hidden", "true");

  const dashboardText = document.createElement("span");
  dashboardText.className = "session-sidebar-text";
  dashboardText.textContent = "Dashboard";

  dashboardButton.append(dashboardIcon, dashboardText);
  dashboardButton.addEventListener("click", actions.onOpenDashboard);

  const list = document.createElement("div");
  list.className = "session-sidebar-list";

  const pinnedSessions = state.sessions.filter((session) =>
    isPinnedSession(session.name, actions.pinnedSessionNames)
  );
  const regularSessions = state.sessions.filter(
    (session) => !isPinnedSession(session.name, actions.pinnedSessionNames)
  );

  if (pinnedSessions.length > 0) {
    list.append(renderSessionGroup("Pinned", pinnedSessions, state, actions, true));
  }

  if (regularSessions.length > 0) {
    list.append(
      renderSessionGroup(
        pinnedSessions.length > 0 ? "Sessions" : "",
        regularSessions,
        state,
        actions,
        false
      )
    );
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

  sidebar.append(header, dashboardButton, list, toolbar);
  root.append(sidebar);
}
