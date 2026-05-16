import type { SessionSummary } from "../api/sessionApi";
import { formatSessionActivity } from "./renderDashboard";

type StatusBarMode = "compact" | "full" | "git";
const STATUS_BAR_MODES: StatusBarMode[] = ["compact", "full", "git"];

export type SessionStatusBarActions = {
  onClear?: () => void;
  onRedraw?: () => void;
  onRefresh?: () => void;
};

function formatWindowPaneSummary(
  session: SessionSummary,
  mode: StatusBarMode
) {
  if (mode === "full") {
    return [
      `${session.windows} ${session.windows === 1 ? "window" : "windows"}`,
      `${session.paneCount} ${session.paneCount === 1 ? "pane" : "panes"}`
    ];
  }

  return [`${session.windows}w ${session.paneCount}p`];
}

function formatGitSummary(session: SessionSummary) {
  if (!session.gitBranch) {
    return "no git repo";
  }

  return `git ${session.gitBranch}${session.gitDirty ? " dirty" : " clean"}`;
}

export function formatSessionStatusBar(
  session: SessionSummary,
  mode: StatusBarMode = "compact"
) {
  if (mode === "git") {
    return [
      session.name,
      formatGitSummary(session),
      session.currentPath,
      formatSessionActivity(session.lastActivityAt)
    ].filter((item): item is string => Boolean(item));
  }

  const items = [
    session.name,
    session.activeWindowName,
    ...formatWindowPaneSummary(session, mode),
    session.currentCommand,
    session.currentPath,
    session.paneDead
      ? session.paneDeadStatus === 0
        ? "exited 0"
        : `failed ${session.paneDeadStatus ?? "unknown"}`
      : session.status,
    formatSessionActivity(session.lastActivityAt)
  ];

  return items.filter((item): item is string => Boolean(item));
}

function getNextStatusBarMode(mode: StatusBarMode) {
  const index = STATUS_BAR_MODES.indexOf(mode);
  return STATUS_BAR_MODES[(index + 1) % STATUS_BAR_MODES.length]!;
}

function createActionButton(
  action: string,
  label: string,
  onClick: () => void,
  disabled = false
) {
  const button = document.createElement("button");
  button.className = "terminal-status-action";
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });

  return button;
}

function renderStatusActions(
  root: HTMLElement,
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions
) {
  const actionsRoot = document.createElement("div");
  actionsRoot.className = "terminal-status-actions";

  actionsRoot.append(
    createActionButton("clear", "clear", () => actions.onClear?.(), !actions.onClear),
    createActionButton("redraw", "redraw", () => actions.onRedraw?.(), !actions.onRedraw),
    createActionButton("refresh", "refresh", () => {
      actions.onRefresh?.();
      renderSessionStatusBar(root, session, actions);
    })
  );

  return actionsRoot;
}

export function renderSessionStatusBar(
  root: HTMLElement,
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions = {}
) {
  let statusBar = root.querySelector<HTMLElement>(".terminal-status-bar");

  if (!statusBar) {
    statusBar = document.createElement("div");
    statusBar.className = "terminal-status-bar";
    root.append(statusBar);
  }

  const mode = (statusBar.dataset.mode as StatusBarMode | undefined) ?? "compact";
  statusBar.dataset.mode = mode;
  statusBar.title = "Click to switch compact, full, and git status views";
  statusBar.onclick = (event) => {
    if ((event.target as HTMLElement | null)?.closest(".terminal-status-action")) {
      return;
    }

    statusBar.dataset.mode = getNextStatusBarMode(
      (statusBar.dataset.mode as StatusBarMode | undefined) ?? "compact"
    );
    renderSessionStatusBar(root, session, actions);
  };
  statusBar.innerHTML = "";

  const items = session ? formatSessionStatusBar(session, mode) : [];
  const main = document.createElement("div");
  main.className = "terminal-status-main";

  if (items.length === 0) {
    const emptyItem = document.createElement("span");
    emptyItem.className = "terminal-status-item is-muted";
    emptyItem.textContent = "waiting for tmux status";
    main.append(emptyItem);
    statusBar.append(main, renderStatusActions(root, session, actions));
    return;
  }

  items.forEach((item) => {
    const statusItem = document.createElement("span");
    statusItem.className = "terminal-status-item";
    statusItem.textContent = item;
    statusItem.title = item;
    main.append(statusItem);
  });

  statusBar.append(main, renderStatusActions(root, session, actions));
}
