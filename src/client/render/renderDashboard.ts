import type { KanbanProject } from "../api/sessionApi";
import type { DashboardState } from "../state/dashboardStore";
import { renderSessionConfigModal } from "./sessionConfigModal";
import type { SessionSettings } from "../state/sessionSettings";
import type { AppTheme } from "../theme/themeState";
import { getKanbanAgentSessionName } from "./renderKanban";
import { openSessionGroupMenu } from "./sessionGroupMenu";
import type { ResponsiveUiTier } from "../responsiveUiTier";

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${value}%` : "n/a";
}

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) {
    return "n/a";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let nextValue = value;

  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  return `${nextValue >= 10 ? Math.round(nextValue) : nextValue.toFixed(1)} ${
    units[unitIndex]
  }`;
}

function formatUptime(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "n/a";
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

export function formatCompactDateTime(date: Date) {
  return `${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatRelativeActivity(
  lastActivityAt: number | null | undefined,
  nowMs = Date.now()
) {
  if (!lastActivityAt) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor(nowMs / 1000 - lastActivityAt));

  if (elapsedSeconds < 10) {
    return "active now";
  }

  if (elapsedSeconds < 60) {
    return `idle ${elapsedSeconds}s`;
  }

  if (elapsedSeconds < 3600) {
    return `idle ${Math.floor(elapsedSeconds / 60)}m`;
  }

  if (elapsedSeconds < 86400) {
    return `idle ${Math.floor(elapsedSeconds / 3600)}h`;
  }

  return `idle ${Math.floor(elapsedSeconds / 86400)}d`;
}

export function formatSessionActivity(
  lastActivityAt: number | null | undefined,
  nowMs = Date.now()
) {
  if (!lastActivityAt) {
    return null;
  }

  const relativeActivity = formatRelativeActivity(lastActivityAt, nowMs);
  const activityDateTime = formatDateTime(new Date(lastActivityAt * 1000));

  return relativeActivity
    ? `${relativeActivity} · ${activityDateTime}`
    : activityDateTime;
}

export function formatDashboardSessionActivity(
  lastActivityAt: number | null | undefined,
  nowMs = Date.now()
) {
  if (!lastActivityAt) {
    return null;
  }

  const relativeActivity = formatRelativeActivity(lastActivityAt, nowMs);
  const activityDateTime = formatCompactDateTime(new Date(lastActivityAt * 1000));

  return relativeActivity
    ? `${relativeActivity} · ${activityDateTime}`
    : activityDateTime;
}

export function formatDisplayPath(
  path: string | null | undefined,
  homeDirectory: string | null | undefined
) {
  if (!path) {
    return "path unavailable";
  }

  if (!homeDirectory || homeDirectory === "/") {
    return path;
  }

  const normalizedHome =
    homeDirectory.endsWith("/") && homeDirectory !== "/"
      ? homeDirectory.slice(0, -1)
      : homeDirectory;

  if (path === normalizedHome) {
    return "~";
  }

  if (path.startsWith(`${normalizedHome}/`)) {
    return `~${path.slice(normalizedHome.length)}`;
  }

  return path;
}

function appendMetaItem(
  parent: HTMLElement,
  text: string | null | undefined,
  className = ""
) {
  if (!text) {
    return;
  }

  const item = document.createElement("span");
  item.className = `session-meta-item${className ? ` ${className}` : ""}`;
  item.textContent = text;
  item.title = text;
  parent.append(item);
}

function getProjectNames(projects: KanbanProject[]) {
  return [...projects]
    .filter((project) => project.name !== "ungrouped")
    .map((project) => project.name)
    .sort((left, right) => left.localeCompare(right));
}

function getProjectNameForSession(
  sessionName: string,
  projects: KanbanProject[]
) {
  return (
    projects.find((project) =>
      project.agents.some(
        (agent) =>
          (agent.sessionName ??
            getKanbanAgentSessionName(project.name, agent.name)) === sessionName
      )
    )?.name ?? null
  );
}

type BrowserSessionTabState = {
  sessionName: string;
  active: boolean;
};

export function renderDashboard(
  root: HTMLElement,
  state: DashboardState,
  actions: {
    onCreateSession: (name: string) => void;
    onOpenSession: (name: string) => void;
    onOpenSessionPane?: (name: string, paneId: string) => void;
    onOpenKanban?: () => void;
    onKillSession: (name: string) => void;
    onMoveKanbanSession?: (
      fromProjectName: string | null,
      toProjectName: string,
      sessionName: string
    ) => void;
    onRenameSession: (fromName: string, toName: string) => void;
    getSessionSettings: (name: string) => SessionSettings;
    onSessionFontSizeChange: (name: string, fontSize: number) => void;
    onSessionFontFamilyChange: (name: string, fontFamily: string) => void;
    onSessionLineHeightChange: (name: string, lineHeight: number) => void;
    onSessionThemeChange: (name: string, themeId: string) => void;
    activeConfigSessionName: string | null;
    onOpenSessionConfig: (name: string) => void;
    onCloseSessionConfig: () => void;
    draftSessionName: string;
    onDraftChange: (value: string) => void;
    themes: AppTheme[];
    activeThemeId: string;
    onThemeChange: (themeId: string) => void;
    onRefreshDashboard?: () => void;
    uiTier?: ResponsiveUiTier;
    browserTabs?: BrowserSessionTabState[];
  }
) {
  const previousInput = root.querySelector<HTMLInputElement>(
    "input[name='sessionName']"
  );
  const shouldRestoreFocus = previousInput === document.activeElement;
  const previousSelectionStart = previousInput?.selectionStart ?? null;
  const previousSelectionEnd = previousInput?.selectionEnd ?? null;
  const existingCleanupEvent = root.dataset.cleanupSessionGroupMenu;

  if (existingCleanupEvent) {
    document.dispatchEvent(new CustomEvent(existingCleanupEvent));
  }

  root.innerHTML = "";

  const section = document.createElement("section");
  section.className = "dashboard";

  const header = document.createElement("div");
  header.className = "dashboard-header";

  const heading = document.createElement("h1");
  heading.textContent = "Tmux";

  const titleGroup = document.createElement("div");
  titleGroup.className = "dashboard-title-group";

  const serverStatus = document.createElement("div");
  serverStatus.className = "server-status";

  if (state.serverStatus) {
    const loadLabel =
      state.serverStatus.platform === "win32" ? "cpu" : "load";
    const memoryUsedBytes = Math.max(
      0,
      state.serverStatus.memoryTotalBytes - state.serverStatus.memoryFreeBytes
    );

    appendMetaItem(serverStatus, state.serverStatus.platform);
    appendMetaItem(
      serverStatus,
      `${loadLabel} ${formatPercent(state.serverStatus.loadPercent)}`
    );
    appendMetaItem(
      serverStatus,
      `mem ${formatPercent(state.serverStatus.memoryUsedPercent)} (${formatBytes(
        memoryUsedBytes
      )}/${formatBytes(state.serverStatus.memoryTotalBytes)})`
    );
    appendMetaItem(serverStatus, `up ${formatUptime(state.serverStatus.uptimeSeconds)}`);
  } else {
    appendMetaItem(serverStatus, "server status pending");
  }

  const themeMenu = document.createElement("details");
  themeMenu.className = "dashboard-theme-menu";

  const themeSummary = document.createElement("summary");
  themeSummary.textContent = "Theme";
  themeMenu.append(themeSummary);

  const themeToolbar = document.createElement("div");
  themeToolbar.className = "dashboard-theme-toolbar";
  themeToolbar.setAttribute("aria-label", "Theme");

  actions.themes.forEach((theme) => {
    const swatchButton = document.createElement("button");
    swatchButton.type = "button";
    swatchButton.className = `theme-swatch${
      theme.id === actions.activeThemeId ? " is-active" : ""
    }`;
    swatchButton.title = theme.label;
    swatchButton.setAttribute("aria-label", theme.label);
    swatchButton.setAttribute(
      "aria-pressed",
      theme.id === actions.activeThemeId ? "true" : "false"
    );
    swatchButton.addEventListener("click", () => actions.onThemeChange(theme.id));

    theme.swatches.forEach((color) => {
      const colorChip = document.createElement("span");
      colorChip.style.background = color;
      swatchButton.append(colorChip);
    });

    themeToolbar.append(swatchButton);
  });

  themeMenu.append(themeToolbar);
  const headerActions = document.createElement("div");
  headerActions.className = "dashboard-header-actions";

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "dashboard-refresh-button";
  refreshButton.textContent = "Refresh";
  refreshButton.title = "Refresh dashboard";
  refreshButton.setAttribute("aria-label", "Refresh dashboard");
  refreshButton.dataset.action = "refresh-dashboard";
  refreshButton.disabled = !actions.onRefreshDashboard;
  refreshButton.addEventListener("click", () => {
    actions.onRefreshDashboard?.();
  });

  headerActions.append(refreshButton, themeMenu);
  titleGroup.append(heading, serverStatus);
  header.append(titleGroup, headerActions);
  section.append(header);

  const createRow = document.createElement("form");
  createRow.className = "session-form";

  const input = document.createElement("input");
  input.name = "sessionName";
  input.placeholder = "name";
  input.value = actions.draftSessionName;
  input.addEventListener("input", () => {
    actions.onDraftChange(input.value);
  });

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Create";

  createRow.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();

    if (!name) {
      return;
    }

    actions.onCreateSession(name);
    actions.onDraftChange("");
    input.value = "";
  });

  createRow.append(input, button);
  section.append(createRow);

  if (state.error) {
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = state.error;
    section.append(error);
  }

  const table = document.createElement("table");
  table.className = "session-table";

  const body = document.createElement("tbody");
  const browserTabsBySession = new Map(
    (actions.browserTabs ?? []).map((tab) => [tab.sessionName, tab])
  );

  state.sessions.forEach((session) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.className = "session-name-cell";

    const sessionName = document.createElement("span");
    sessionName.className = "session-name";
    sessionName.textContent = session.name;

    const sessionStatus = document.createElement("span");
    sessionStatus.className = `session-status is-${session.status}`;
    sessionStatus.textContent = `tmux ${session.status}`;

    const browserTab = browserTabsBySession.get(session.name);
    const browserStatus = document.createElement("span");
    browserStatus.className = `session-browser-status ${
      browserTab?.active ? "is-browser-active" : "is-browser-open"
    }`;
    browserStatus.textContent = browserTab?.active
      ? "browser active"
      : "browser open";
    browserStatus.hidden = !browserTab;

    const sessionTitleCluster = document.createElement("div");
    sessionTitleCluster.className = "session-title-cluster";

    const sessionHeaderActions = document.createElement("div");
    sessionHeaderActions.className = "session-heading-actions";

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "session-icon-button session-rename-button";
    renameButton.textContent = "✎";
    renameButton.title = "Rename";
    renameButton.setAttribute("aria-label", `Rename ${session.name}`);
    renameButton.dataset.action = `rename-${session.name}`;
    renameButton.addEventListener("click", () => {
      const form = document.createElement("form");
      form.className = "session-rename-form";

      const renameInput = document.createElement("input");
      renameInput.name = `rename-${session.name}`;
      renameInput.value = session.name;

      const saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.textContent = "Save";

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const nextName = renameInput.value.trim();

        if (!nextName || nextName === session.name) {
          return;
        }

        actions.onRenameSession(session.name, nextName);
      });

      form.append(renameInput, saveButton);
      sessionTitleCluster.replaceChildren(form);
      renameInput.focus();
      renameInput.select();
    });

    const configButton = document.createElement("button");
    configButton.type = "button";
    configButton.className = "session-icon-button session-config-button";
    configButton.textContent = "⚙";
    configButton.title = "Config";
    configButton.setAttribute("aria-label", `Configure ${session.name}`);
    configButton.dataset.action = `configure-${session.name}`;
    configButton.addEventListener("click", () =>
      actions.onOpenSessionConfig(session.name)
    );

    sessionTitleCluster.append(sessionName, renameButton, configButton);
    sessionHeaderActions.append(sessionStatus, browserStatus);

    const sessionNameHeader = document.createElement("div");
    sessionNameHeader.className = "session-name-header";
    sessionNameHeader.append(sessionTitleCluster, sessionHeaderActions);

    const openSessionGroupMenuForSession = () => {
      openSessionGroupMenu(
        root,
        sessionNameHeader,
        {
          currentSessionName: session.name,
          currentProjectName: getProjectNameForSession(
            session.name,
            state.kanbanProjects
          ),
          projectNames: getProjectNames(state.kanbanProjects),
          onOpenKanban: () => actions.onOpenKanban?.(),
          onMoveKanbanSession: actions.onMoveKanbanSession,
          onKillSession: actions.onKillSession,
          uiTier: actions.uiTier
        },
        session.name
      );
    };

    sessionNameHeader.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openSessionGroupMenuForSession();
    });

    let longPressTimer: number | null = null;
    sessionNameHeader.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") {
        return;
      }

      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        openSessionGroupMenuForSession();
      }, 600);
    });
    sessionNameHeader.addEventListener("pointerup", () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
    sessionNameHeader.addEventListener("pointercancel", () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
    sessionNameHeader.addEventListener("pointermove", () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    const sessionPath = document.createElement("div");
    sessionPath.className = "session-path";
    sessionPath.textContent = formatDisplayPath(
      session.currentPath,
      state.serverStatus?.homeDirectory
    );
    sessionPath.title = session.currentPath || "";

    const sessionMeta = document.createElement("div");
    sessionMeta.className = "session-meta";
    appendMetaItem(
      sessionMeta,
      formatDashboardSessionActivity(session.lastActivityAt)
    );
    appendMetaItem(sessionMeta, session.windows > 1 ? `${session.windows}w` : null);
    appendMetaItem(
      sessionMeta,
      session.paneCount > 1 ? `${session.paneCount}p` : null
    );
    appendMetaItem(
      sessionMeta,
      session.paneDead
        ? session.paneDeadStatus === 0
          ? "exited 0"
          : `failed ${session.paneDeadStatus ?? "unknown"}`
        : null,
      session.paneDead && session.paneDeadStatus !== 0 ? "is-failed" : ""
    );

    const sessionDetailRow = document.createElement("div");
    sessionDetailRow.className = "session-detail-row";
    sessionDetailRow.append(sessionPath);

    nameCell.append(sessionNameHeader, sessionDetailRow);

    if (session.panes && session.panes.length > 1) {
      const paneList = document.createElement("div");
      paneList.className = "session-pane-list";
      paneList.setAttribute("aria-label", `Panes in ${session.name}`);

      session.panes.forEach((pane) => {
        const paneButton = document.createElement("button");
        const paneCommand = pane.currentCommand ?? "pane";
        const paneLabel =
          session.windows > 1
            ? `${pane.windowIndex}.${pane.paneIndex} ${paneCommand}`
            : `#${pane.paneIndex} ${paneCommand}`;

        paneButton.type = "button";
        paneButton.className = `session-pane-button${
          pane.paneActive && pane.windowActive ? " is-active" : ""
        }`;
        paneButton.textContent = paneLabel;
        paneButton.title = `${pane.windowName} ${formatDisplayPath(
          pane.currentPath,
          state.serverStatus?.homeDirectory
        )}`;
        paneButton.setAttribute(
          "aria-label",
          `Open ${session.name} pane ${paneLabel}`
        );
        paneButton.addEventListener("click", () => {
          const openPane = actions.onOpenSessionPane ?? actions.onOpenSession;

          if (actions.onOpenSessionPane) {
            openPane(session.name, pane.paneId);
            return;
          }

          actions.onOpenSession(session.name);
        });
        paneList.append(paneButton);
      });

      nameCell.append(paneList);
    }

    if (session.preview) {
      const sessionPreview = document.createElement("pre");
      sessionPreview.className = "session-preview";
      sessionPreview.textContent = session.preview;
      sessionPreview.title = session.preview;
      nameCell.append(sessionPreview);
    }

    const actionsCell = document.createElement("td");
    actionsCell.dataset.label = "Actions";

    const actionButtons = document.createElement("div");
    actionButtons.className = "session-action-buttons";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => actions.onOpenSession(session.name));

    const killButton = document.createElement("button");
    killButton.type = "button";
    killButton.className = "session-kill-button";
    killButton.textContent = "🗑";
    killButton.title = "Kill";
    killButton.setAttribute("aria-label", `Kill ${session.name}`);
    killButton.addEventListener("click", () => {
      if (window.confirm(`Kill tmux session "${session.name}"?`)) {
        actions.onKillSession(session.name);
      }
    });

    actionButtons.append(openButton, killButton);
    actionsCell.append(sessionMeta, actionButtons);
    row.append(nameCell, actionsCell);
    body.append(row);
  });

  table.append(body);
  section.append(table);

  const activeConfigSession = state.sessions.find(
    (session) => session.name === actions.activeConfigSessionName
  );

  if (activeConfigSession) {
    section.append(renderSessionConfigModal(activeConfigSession.name, actions));
  }

  root.append(section);

  if (shouldRestoreFocus) {
    input.focus();

    if (previousSelectionStart !== null && previousSelectionEnd !== null) {
      input.setSelectionRange(previousSelectionStart, previousSelectionEnd);
    }
  }
}
