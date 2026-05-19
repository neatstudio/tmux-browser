import type { PaneSummary, SessionSummary } from "../api/sessionApi";
import { formatSessionActivity } from "./renderDashboard";

type StatusBarMode = "compact" | "full" | "git";
const STATUS_BAR_MODES: StatusBarMode[] = ["compact", "full", "git"];

export type SessionStatusBarActions = {
  onClear?: () => void;
  onRedraw?: () => void;
  onReconnect?: () => void;
  onRefresh?: () => void;
  onConfig?: () => void;
  onRename?: () => void;
  onSendCommand?: () => void;
  onViewSession?: () => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
  onSelectPane?: (sessionName: string, paneId: string) => void;
  onKillPane?: (sessionName: string, paneId: string) => void;
  onKill?: () => void;
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
  disabled = false,
  title = label
) {
  const button = document.createElement("button");
  button.className = "terminal-status-action";
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.disabled = disabled;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });

  return button;
}

function formatPaneLabel(session: SessionSummary, pane: PaneSummary) {
  const command = pane.currentCommand ?? "pane";

  if (session.windows > 1) {
    return `${pane.windowIndex}.${pane.paneIndex} ${command}`;
  }

  return `#${pane.paneIndex} ${command}`;
}

function renderPaneSwitches(
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions
) {
  if (!session?.panes || session.panes.length <= 1) {
    return null;
  }

  const panesRoot = document.createElement("div");
  panesRoot.className = "terminal-status-panes";
  panesRoot.setAttribute("aria-label", `Panes in ${session.name}`);

  session.panes.forEach((pane) => {
    const paneItem = document.createElement("span");
    const paneButton = document.createElement("button");
    const paneLabel = formatPaneLabel(session, pane);

    paneItem.className = "terminal-status-pane";
    paneButton.className = `terminal-status-pane-button${
      pane.paneActive && pane.windowActive ? " is-active" : ""
    }`;
    paneButton.type = "button";
    paneButton.textContent = paneLabel;
    paneButton.title = `Switch to ${paneLabel}`;
    paneButton.disabled = !actions.onSelectPane;
    paneButton.addEventListener("click", (event) => {
      event.stopPropagation();
      actions.onSelectPane?.(session.name, pane.paneId);
    });

    const killButton = document.createElement("button");
    killButton.className = "terminal-status-pane-kill";
    killButton.type = "button";
    killButton.textContent = "×";
    killButton.title = `Close ${paneLabel}`;
    killButton.setAttribute("aria-label", `Close ${paneLabel}`);
    killButton.disabled = !actions.onKillPane;
    killButton.addEventListener("click", (event) => {
      event.stopPropagation();
      actions.onKillPane?.(session.name, pane.paneId);
    });

    paneItem.append(paneButton, killButton);
    panesRoot.append(paneItem);
  });

  return panesRoot;
}

function renderStatusActions(
  root: HTMLElement,
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions
) {
  const actionsRoot = document.createElement("div");
  actionsRoot.className = "terminal-status-actions";

  actionsRoot.append(
    createActionButton("clear", "Clear", () => actions.onClear?.(), !actions.onClear, "Clear terminal"),
    createActionButton("redraw", "Draw", () => actions.onRedraw?.(), !actions.onRedraw, "Redraw terminal"),
    createActionButton("reconnect", "Recon", () => actions.onReconnect?.(), !actions.onReconnect, "Reconnect terminal websocket"),
    createActionButton("refresh", "Sync", () => {
      actions.onRefresh?.();
      renderSessionStatusBar(root, session, actions);
    }, false, "Refresh tmux status"),
    createActionButton("config", "Cfg", () => actions.onConfig?.(), !actions.onConfig, "Config session"),
    createActionButton("rename", "Ren", () => actions.onRename?.(), !actions.onRename, "Rename session"),
    createActionButton("send", "Send", () => actions.onSendCommand?.(), !actions.onSendCommand, "Send command"),
    createActionButton("view", "View", () => actions.onViewSession?.(), !actions.onViewSession, "View session"),
    createActionButton("split-horizontal", "Split", () => actions.onSplitHorizontal?.(), !actions.onSplitHorizontal, "Split pane horizontally"),
    createActionButton("split-vertical", "Stack", () => actions.onSplitVertical?.(), !actions.onSplitVertical, "Split pane vertically"),
    createActionButton("kill", "Kill", () => actions.onKill?.(), !actions.onKill, "Kill session")
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
    if (
      (event.target as HTMLElement | null)?.closest(
        ".terminal-status-action, .terminal-status-pane-button, .terminal-status-pane-kill"
      )
    ) {
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
    const paneSwitches = renderPaneSwitches(session, actions);
    statusBar.append(
      main,
      ...(paneSwitches ? [paneSwitches] : []),
      renderStatusActions(root, session, actions)
    );
    return;
  }

  items.forEach((item) => {
    const statusItem = document.createElement("span");
    statusItem.className = "terminal-status-item";
    statusItem.textContent = item;
    statusItem.title = item;
    main.append(statusItem);
  });

  const paneSwitches = renderPaneSwitches(session, actions);
  statusBar.append(
    main,
    ...(paneSwitches ? [paneSwitches] : []),
    renderStatusActions(root, session, actions)
  );
}
