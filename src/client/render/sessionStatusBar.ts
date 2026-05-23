import type { PaneSummary, SessionSummary } from "../api/sessionApi";

export type SessionStatusBarActions = {
  onClear?: () => void;
  onRedraw?: () => void;
  onReconnect?: () => void;
  onRefresh?: () => void;
  onConfig?: () => void;
  onRename?: () => void;
  onSendCommand?: () => void;
  onSwitchSession?: () => void;
  onPreviewImage?: () => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
  onToggleBrowserScroll?: () => void;
  browserScrollEnabled?: boolean;
  onScrollHistoryBack?: () => void;
  onScrollHistoryForward?: () => void;
  onSelectPane?: (sessionName: string, paneId: string) => void;
  onKillPane?: (sessionName: string, paneId: string) => void;
  onKill?: () => void;
};

export function formatSessionStatusBar(
  session: SessionSummary
) {
  return [session.currentPath].filter((item): item is string => Boolean(item));
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
    paneButton.dataset.action = "select-pane";
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

function createActionGroup(group: string, items: Array<HTMLElement | null>) {
  const groupRoot = document.createElement("div");
  groupRoot.className = "terminal-status-action-group";
  groupRoot.dataset.group = group;

  items.forEach((item) => {
    if (item) {
      groupRoot.append(item);
    }
  });

  return groupRoot;
}

function createBrowserScrollButton(actions: SessionStatusBarActions) {
  const browserScrollButton = createActionButton(
    "browser-scroll",
    actions.browserScrollEnabled ? "Tmux" : "Page",
    () => {
      actions.onToggleBrowserScroll?.();
    },
    !actions.onToggleBrowserScroll,
    actions.browserScrollEnabled
      ? "Switch wheel back to tmux history scroll"
      : "Let the browser/xterm viewport handle wheel scroll"
  );

  browserScrollButton.setAttribute(
    "aria-pressed",
    actions.browserScrollEnabled ? "true" : "false"
  );
  browserScrollButton.classList.toggle(
    "is-active",
    Boolean(actions.browserScrollEnabled)
  );

  return browserScrollButton;
}

function renderLeftStatusActions(
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions
): HTMLElement[] {
  const panesGroup = createActionGroup("panes", [
    createActionButton("split-horizontal", "Split", () => actions.onSplitHorizontal?.(), !actions.onSplitHorizontal, "Split pane horizontally"),
    createActionButton("split-vertical", "Stack", () => actions.onSplitVertical?.(), !actions.onSplitVertical, "Split pane vertically"),
    renderPaneSwitches(session, actions)
  ]);
  const toolsGroup = createActionGroup("tools", [
    createActionButton("reconnect", "Recon", () => actions.onReconnect?.(), !actions.onReconnect, "Reconnect terminal websocket"),
    createActionButton("config", "Cfg", () => actions.onConfig?.(), !actions.onConfig, "Config session"),
    createActionButton("rename", "Ren", () => actions.onRename?.(), !actions.onRename, "Rename session"),
    createActionButton("preview-image", "Img", () => actions.onPreviewImage?.(), !actions.onPreviewImage, "Preview image file")
  ]);

  panesGroup.classList.add("is-left");
  toolsGroup.classList.add("is-left");

  return [panesGroup, toolsGroup];
}

function renderRightStatusActions(
  root: HTMLElement,
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions
): HTMLElement[] {
  return [
    createActionGroup("view", [
      createBrowserScrollButton(actions),
      createActionButton("scroll-history-forward", "Live", () => actions.onScrollHistoryForward?.(), !actions.onScrollHistoryForward, "Page forward toward live output"),
      createActionButton("scroll-history-back", "Hist", () => actions.onScrollHistoryBack?.(), !actions.onScrollHistoryBack, "Page back in tmux history")
    ]),
    createActionGroup("routing", [
      createActionButton("send", "Send", () => actions.onSendCommand?.(), !actions.onSendCommand, "Send command"),
      createActionButton("switch-session", "Switch", () => actions.onSwitchSession?.(), !actions.onSwitchSession, "Switch session")
    ]),
    createActionGroup("recovery", [
      createActionButton("clear", "Clear", () => actions.onClear?.(), !actions.onClear, "Clear terminal"),
      createActionButton("redraw", "Draw", () => actions.onRedraw?.(), !actions.onRedraw, "Redraw terminal"),
      createActionButton("refresh", "Sync", () => {
        actions.onRefresh?.();
        renderSessionStatusBar(root, session, actions);
      }, false, "Refresh tmux status"),
      createActionButton("kill", "Kill", () => actions.onKill?.(), !actions.onKill, "Kill session")
    ])
  ];
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

  statusBar.removeAttribute("data-mode");
  statusBar.title = "Current tmux path";
  statusBar.onclick = null;
  statusBar.innerHTML = "";

  const items = session ? formatSessionStatusBar(session) : [];
  const main = document.createElement("div");
  main.className = "terminal-status-main";

  if (items.length === 0) {
    const emptyItem = document.createElement("span");
    emptyItem.className = "terminal-status-item is-muted";
    emptyItem.textContent = "waiting for tmux status";
    main.append(emptyItem);
    statusBar.append(
      ...renderLeftStatusActions(session, actions),
      main,
      ...renderRightStatusActions(root, session, actions)
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

  statusBar.append(
    ...renderLeftStatusActions(session, actions),
    main,
    ...renderRightStatusActions(root, session, actions)
  );
}
