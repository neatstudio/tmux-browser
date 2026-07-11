import type { SessionSummary } from "../api/sessionApi";
import type { ResponsiveUiTier } from "../responsiveUiTier";
import { formatDisplayPath } from "../pathDisplay";
import {
  MOBILE_EDITING_KEYS,
  MOBILE_SHIFT_CURSOR_KEYS,
  MOBILE_SOFT_KEYS,
  type SoftKey
} from "../terminal/softKeys";

const MOBILE_EDITING_KEY_IDS = new Set(MOBILE_EDITING_KEYS.map((key) => key.id));
const MOBILE_INLINE_SOFT_KEYS = MOBILE_SOFT_KEYS.filter(
  (key) => !MOBILE_EDITING_KEY_IDS.has(key.id)
);
const MOBILE_SHIFT_TOGGLE_KEY: SoftKey = {
  id: "shift",
  label: "⇧",
  title: "Toggle Shift for arrow keys",
  sequence: ""
};
const MOBILE_INLINE_SHIFT_SOFT_KEYS = [
  MOBILE_SHIFT_TOGGLE_KEY,
  ...MOBILE_INLINE_SOFT_KEYS
];
const MOBILE_SHIFT_CURSOR_KEY_BY_ID = new Map(
  MOBILE_SHIFT_CURSOR_KEYS.map((key) => [
    key.id.replace(/^shift-/, ""),
    key
  ])
);

const mobileSheetCleanupByStatusBar = new WeakMap<HTMLElement, () => void>();

export type TerminalConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type KanbanStatusSession = {
  name: string;
  label: string;
  live?: boolean;
};

export type KanbanStatusProject = {
  name: string;
  virtual?: boolean;
  sessions: KanbanStatusSession[];
};

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
  onChooseImage?: () => void;
  onCaptureImage?: () => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
  onToggleBrowserScroll?: () => void;
  browserScrollEnabled?: boolean;
  onScrollHistoryBack?: () => void;
  onScrollHistoryForward?: () => void;
  onSendSoftKey?: (sequence: string) => void;
  onKill?: () => void;
  kanbanProject?: KanbanStatusProject | null;
  kanbanProjects?: KanbanStatusProject[];
  onOpenKanbanProject?: (projectName: string) => void;
  onOpenSession?: (sessionName: string) => void;
  onOpenGroupTask?: () => void;
  onMoveKanbanSession?: (
    fromProjectName: string | null,
    toProjectName: string,
    sessionName: string
  ) => void;
  onOpenKanban?: () => void;
  mobileActionRoot?: HTMLElement | null;
  hideMobileActionToggle?: boolean;
  uiTier?: ResponsiveUiTier;
  onRestoreFocus?: () => void;
  homeDirectory?: string | null;
  connectionState?: TerminalConnectionState;
};

export function formatSessionStatusBar(
  session: SessionSummary,
  homeDirectory?: string | null
) {
  return [session.currentPath]
    .filter((item): item is string => Boolean(item))
    .map((item) => formatDisplayPath(item, homeDirectory));
}

function createActionButton(
  action: string,
  label: string,
  onClick: () => void,
  disabled = false,
  title = label,
  afterClick?: () => void
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
    afterClick?.();
  });

  return button;
}

function keepCurrentInputFocusOnPress(button: HTMLButtonElement) {
  const preventFocusSteal = (event: Event) => {
    event.preventDefault();
  };

  button.addEventListener("pointerdown", preventFocusSteal);
  button.addEventListener("mousedown", preventFocusSteal);
}

function createSwitchSessionButton(
  actions: SessionStatusBarActions,
  afterClick?: () => void
) {
  const button = createActionButton(
    "switch-session",
    "Switch",
    () => actions.onSwitchSession?.(),
    !actions.onSwitchSession,
    "Switch session",
    afterClick
  );
  button.classList.add("is-mobile-primary");

  return button;
}

function renderBottomProjectRail(
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions
) {
  const project = actions.kanbanProject;

  if (!project || project.sessions.length <= 1) {
    return null;
  }

  const rail = document.createElement("nav");
  rail.className = "terminal-status-project-rail";
  rail.dataset.group = "project-rail";
  rail.setAttribute(
    "aria-label",
    `Sessions in Kanban project ${project.name}`
  );

  const label = document.createElement("span");
  label.className = "terminal-status-project-label";
  label.textContent = project.name;
  label.title = `Kanban project: ${project.name}`;
  rail.append(label);

  if (actions.onOpenGroupTask) {
    const taskButton = createActionButton(
      "bottom-open-group-task",
      "Task",
      () => actions.onOpenGroupTask?.(),
      false,
      `Send task in ${project.name}`
    );
    taskButton.classList.add("terminal-status-project-action");
    rail.append(taskButton);
  }

  const sessions = document.createElement("div");
  sessions.className = "terminal-status-project-sessions";

  project.sessions.forEach((projectSession) => {
    const isCurrent = projectSession.name === session?.name;
    const isOffline = projectSession.live === false;
    const button = createActionButton(
      "bottom-switch-kanban-session",
      projectSession.label,
      () => {
        if (!isCurrent && !isOffline) {
          actions.onOpenSession?.(projectSession.name);
        }
      },
      isOffline || !actions.onOpenSession,
      isCurrent
        ? `Current group session: ${projectSession.name}`
        : isOffline
          ? `Offline saved group session: ${projectSession.name}`
          : `Switch to group session: ${projectSession.name}`
    );
    button.dataset.sessionName = projectSession.name;
    button.classList.add("terminal-status-project-session");

    if (isCurrent) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "true");
    }

    if (isOffline) {
      button.classList.add("is-offline");
    }

    sessions.append(button);
  });

  rail.append(sessions);

  return rail;
}

function renderKanbanProjectSwitches(
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions,
  afterClick?: () => void
) {
  const project = actions.kanbanProject;

  if (!project || project.sessions.length <= 1) {
    return null;
  }

  const label = document.createElement("span");
  label.className = "terminal-status-kanban-label";
  label.textContent = project.name;

  return createActionGroup(
    "kanban-sessions",
    [
      label,
      ...project.sessions.map((projectSession) => {
        const isCurrent = projectSession.name === session?.name;
        const button = createActionButton(
          "switch-kanban-session",
          projectSession.label,
          () => {
            if (!isCurrent) {
              actions.onOpenKanbanProject?.(project.name);
            }
          },
          !actions.onOpenKanbanProject,
          isCurrent
            ? `Current group session: ${projectSession.name}`
            : `Switch to group session: ${projectSession.name}`,
          afterClick
        );

        button.dataset.sessionName = projectSession.name;

        if (isCurrent) {
          button.classList.add("is-active");
          button.setAttribute("aria-current", "true");
        }

        return button;
      })
    ]
  );
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

function createMobileActionToggle(
  statusBar: HTMLElement,
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions
) {
  const button = document.createElement("button");
  button.className = "terminal-status-mobile-toggle terminal-status-action";
  button.type = "button";
  button.dataset.action = "toggle-mobile-status-actions";
  button.textContent = "Groups";
  button.title = "Switch groups";
  button.setAttribute("aria-label", "Switch groups");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const sheetOpen = Boolean(statusBar.querySelector(".terminal-status-mobile-sheet"));
    const open = !sheetOpen;

    setMobileSheetOpen(statusBar, open, button);

    if (open) {
      appendMobileActionSheet(statusBar, session, actions, button);
    }
  });

  return button;
}

function isMobileSheetOpen(statusBar: HTMLElement) {
  return statusBar.dataset.mobileActionsOpen === "true";
}

function setMobileSheetOpen(
  statusBar: HTMLElement,
  open: boolean,
  button: HTMLButtonElement
) {
  statusBar.dataset.mobileActionsOpen = open ? "true" : "false";
  button.setAttribute("aria-expanded", open ? "true" : "false");
  button.classList.toggle("is-active", open);

  if (!open) {
    mobileSheetCleanupByStatusBar.get(statusBar)?.();
    mobileSheetCleanupByStatusBar.delete(statusBar);
    statusBar.querySelector(".terminal-status-mobile-sheet")?.remove();
  }
}

function bindMobileSheetOutsideClose(
  statusBar: HTMLElement,
  button: HTMLButtonElement
) {
  mobileSheetCleanupByStatusBar.get(statusBar)?.();

  const handlePointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && statusBar.contains(event.target)) {
      return;
    }

    setMobileSheetOpen(statusBar, false, button);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setMobileSheetOpen(statusBar, false, button);
    }
  };

  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("keydown", handleKeyDown);
  mobileSheetCleanupByStatusBar.set(statusBar, () => {
    document.removeEventListener("pointerdown", handlePointerDown);
    document.removeEventListener("keydown", handleKeyDown);
  });
}

function appendMobileActionSheet(
  statusBar: HTMLElement,
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions,
  button: HTMLButtonElement
) {
  statusBar.querySelector(".terminal-status-mobile-sheet")?.remove();

  const sheet = document.createElement("div");
  sheet.className = "terminal-status-mobile-sheet";

  const closeSheet = () => {
    setMobileSheetOpen(statusBar, false, button);
  };

  const paneActions = renderMobilePaneActions(actions, closeSheet);
  if (paneActions) {
    sheet.append(paneActions);
  }
  const mediaActions = renderMobileMediaActions(actions, closeSheet);
  if (mediaActions) {
    sheet.append(mediaActions);
  }
  sheet.append(renderGroupSwitcherActions(session, actions, closeSheet));
  statusBar.append(sheet);
  bindMobileSheetOutsideClose(statusBar, button);
}

function renderMobilePaneActions(
  actions: SessionStatusBarActions,
  afterClick?: () => void
) {
  const items = [
    actions.onSplitHorizontal
      ? createActionButton(
          "split-horizontal",
          "Split",
          () => actions.onSplitHorizontal?.(),
          false,
          "Split pane horizontally",
          afterClick
        )
      : null,
    actions.onSplitVertical
      ? createActionButton(
          "split-vertical",
          "Stack",
          () => actions.onSplitVertical?.(),
          false,
          "Split pane vertically",
          afterClick
        )
      : null
  ];

  return items.some(Boolean) ? createActionGroup("mobile-panes", items) : null;
}

function renderMobileMediaActions(
  actions: SessionStatusBarActions,
  afterClick?: () => void
) {
  const items = [
    actions.onPreviewImage
      ? createActionButton(
          "preview-image",
          "Img",
          () => actions.onPreviewImage?.(),
          false,
          "Preview image paths",
          afterClick
        )
      : null,
    actions.onChooseImage
      ? createActionButton(
          "choose-image",
          "Pic",
          () => actions.onChooseImage?.(),
          false,
          "Choose image and insert saved path",
          afterClick
        )
      : null,
    actions.onCaptureImage
      ? createActionButton(
          "capture-image",
          "Cam",
          () => actions.onCaptureImage?.(),
          false,
          "Take photo and insert saved path",
          afterClick
        )
      : null
  ];

  return items.some(Boolean) ? createActionGroup("media", items) : null;
}

function renderLeftStatusActions(
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions,
  afterClick?: () => void
): HTMLElement[] {
  if (actions.uiTier && actions.uiTier !== "desktop") {
    return [];
  }

  const panesGroup = createActionGroup("panes", [
    createActionButton("split-horizontal", "Split", () => actions.onSplitHorizontal?.(), !actions.onSplitHorizontal, "Split pane horizontally", afterClick),
    createActionButton("split-vertical", "Stack", () => actions.onSplitVertical?.(), !actions.onSplitVertical, "Split pane vertically", afterClick)
  ]);

  panesGroup.classList.add("is-left");

  return [panesGroup];
}

function renderRightStatusActions(
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions,
  afterClick?: () => void
): HTMLElement[] {
  if (actions.uiTier && actions.uiTier !== "desktop") {
    return [];
  }

  return [
    createActionGroup("view", [
      createBrowserScrollButton(actions),
      createActionButton("scroll-history-forward", "Live", () => actions.onScrollHistoryForward?.(), !actions.onScrollHistoryForward, "Page forward toward live output", afterClick),
      createActionButton("scroll-history-back", "Hist", () => actions.onScrollHistoryBack?.(), !actions.onScrollHistoryBack, "Page back in tmux history", afterClick)
    ]),
    createActionGroup("routing", [
      createActionButton("send", "Send", () => actions.onSendCommand?.(), !actions.onSendCommand, "Send command", afterClick),
      createSwitchSessionButton(actions, afterClick)
    ]),
  ];
}

function renderSoftKeyActions(
  actions: SessionStatusBarActions,
  afterClick?: () => void,
  className?: string,
  keys = MOBILE_SOFT_KEYS,
  shiftState?: {
    get: () => boolean;
    toggle: () => boolean;
  }
) {
  const group = createActionGroup(
    "soft-keys",
    keys.map((key) => {
      if (key.id === MOBILE_SHIFT_TOGGLE_KEY.id && shiftState) {
        const button = createActionButton(
          `soft-key-${key.id}`,
          key.label,
          () => {
            const active = shiftState.toggle();
            button.setAttribute("aria-pressed", active ? "true" : "false");
            button.classList.toggle("is-active", active);
          },
          !actions.onSendSoftKey,
          key.title,
          afterClick
        );

        button.classList.add("terminal-status-soft-key");
        button.setAttribute("aria-pressed", shiftState.get() ? "true" : "false");
        button.classList.toggle("is-active", shiftState.get());
        keepCurrentInputFocusOnPress(button);

        return button;
      }

      const button = createActionButton(
        `soft-key-${key.id}`,
        key.label,
        () => actions.onSendSoftKey?.(key.sequence),
        !actions.onSendSoftKey,
        key.title,
        afterClick
      );

      button.classList.add("terminal-status-soft-key");
      keepCurrentInputFocusOnPress(button);

      return button;
    })
  );

  if (className) {
    group.classList.add(className);
  }

  return group;
}

function renderMobileCursorKeyActions(
  actions: SessionStatusBarActions,
  shiftState?: {
    get: () => boolean;
  }
) {
  if (!actions.onSendSoftKey) {
    return null;
  }

  const group = createActionGroup(
    "mobile-cursor-keys",
    MOBILE_EDITING_KEYS.map((key) => {
      const button = createActionButton(
        `soft-key-${key.id}`,
        key.label,
        () => {
          const shiftedKey = shiftState?.get()
            ? MOBILE_SHIFT_CURSOR_KEY_BY_ID.get(key.id)
            : undefined;
          actions.onSendSoftKey?.(shiftedKey?.sequence ?? key.sequence);
        },
        false,
        key.title
      );

      button.classList.add(
        "terminal-status-soft-key",
        "terminal-status-cursor-key"
      );
      keepCurrentInputFocusOnPress(button);

      return button;
    })
  );

  group.classList.add("terminal-status-mobile-cursor-keys");

  return group;
}

function renderConnectionStatus(
  state: TerminalConnectionState | undefined
) {
  if (!state || state === "connected") {
    return null;
  }

  const status = document.createElement("span");
  status.className = `terminal-status-connection is-${state}`;
  status.textContent = state === "reconnecting"
    ? "Reconnecting"
    : state === "disconnected"
      ? "Disconnected"
      : "Connecting";
  status.title = `Terminal connection: ${state}`;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  return status;
}

function renderGroupSwitcherActions(
  session: SessionSummary | null | undefined,
  actions: SessionStatusBarActions,
  afterClick?: () => void
) {
  const projects = (actions.kanbanProjects ?? []).filter((project) => !project.virtual);
  const currentProjectName = actions.kanbanProject?.name ?? null;
  const targetProjects = currentProjectName
    ? [
        ...projects,
        {
          name: "ungrouped",
          sessions: []
        }
      ]
    : projects;

  if (targetProjects.length === 0) {
    return createActionGroup("kanban-groups", [
      createActionButton(
        "open-kanban",
        "Kanban",
        () => actions.onOpenKanban?.(),
        !actions.onOpenKanban,
        "Open kanban board",
        afterClick
      )
    ]);
  }

  return createActionGroup(
    "kanban-groups",
    targetProjects.map((project) => {
      const isCurrent = project.name === currentProjectName;
      const button = createActionButton(
        "switch-group",
        project.name,
        () => {
          if (!isCurrent) {
            actions.onMoveKanbanSession?.(
              currentProjectName,
              project.name,
              session?.name ?? ""
            );
          }
        },
        !actions.onMoveKanbanSession,
        isCurrent
          ? `Current group: ${project.name}`
          : `Move current session to group: ${project.name}`,
        afterClick
      );

      if (isCurrent) {
        button.classList.add("is-active");
        button.setAttribute("aria-current", "true");
      }
      button.dataset.projectName = project.name;

      return button;
    })
  );
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

  const shouldRestoreMobileSheet = Boolean(
    statusBar.querySelector(".terminal-status-mobile-sheet")
  );
  let mobileShiftActive = statusBar.dataset.mobileShiftActive === "true";
  const mobileShiftState = {
    get: () => mobileShiftActive,
    toggle: () => {
      mobileShiftActive = !mobileShiftActive;
      statusBar.dataset.mobileShiftActive = mobileShiftActive ? "true" : "false";
      return mobileShiftActive;
    }
  };

  statusBar.removeAttribute("data-mode");
  statusBar.title = "Current tmux path";
  statusBar.onclick = null;
  mobileSheetCleanupByStatusBar.get(statusBar)?.();
  mobileSheetCleanupByStatusBar.delete(statusBar);
  statusBar.innerHTML = "";

  const items = session
    ? formatSessionStatusBar(session, actions.homeDirectory)
    : [];
  const main = document.createElement("div");
  main.className = "terminal-status-main";
  const connectionStatus = renderConnectionStatus(actions.connectionState);
  statusBar.classList.toggle("has-connection-status", Boolean(connectionStatus));

  if (items.length === 0) {
    const emptyItem = document.createElement("span");
    emptyItem.className = "terminal-status-item is-muted";
    emptyItem.textContent = "waiting for tmux status";
    main.append(emptyItem);
    const mobileToggle =
      actions.uiTier && actions.uiTier !== "desktop"
        ? createMobileActionToggle(statusBar, session, actions)
        : null;
    const mobileCursorKeys =
      actions.uiTier && actions.uiTier !== "desktop"
        ? renderMobileCursorKeyActions(actions, mobileShiftState)
        : null;
    const bottomProjectRail =
      actions.uiTier && actions.uiTier !== "desktop"
        ? renderBottomProjectRail(session, actions)
        : null;
    statusBar.classList.toggle("has-project-rail", Boolean(bottomProjectRail));
    const inlineSoftKeys =
      actions.uiTier && actions.uiTier !== "desktop" && actions.onSendSoftKey
        ? renderSoftKeyActions(
            actions,
            undefined,
            "terminal-status-inline-soft-keys",
            MOBILE_INLINE_SHIFT_SOFT_KEYS,
            mobileShiftState
          )
        : null;
    statusBar.append(
      ...renderLeftStatusActions(session, actions),
      main,
      ...(bottomProjectRail ? [bottomProjectRail] : []),
      ...(mobileCursorKeys ? [mobileCursorKeys] : []),
      ...(mobileToggle ? [mobileToggle] : []),
      ...(inlineSoftKeys ? [inlineSoftKeys] : []),
      ...renderRightStatusActions(session, actions),
      ...(connectionStatus ? [connectionStatus] : [])
    );
    if (shouldRestoreMobileSheet && mobileToggle) {
      setMobileSheetOpen(statusBar, true, mobileToggle);
      appendMobileActionSheet(statusBar, session, actions, mobileToggle);
    }
    return;
  }

  items.forEach((item) => {
    const statusItem = document.createElement("span");
    statusItem.className = "terminal-status-item";
    statusItem.textContent = item;
    statusItem.title = item;
    main.append(statusItem);
  });

  const mobileToggle =
    actions.uiTier && actions.uiTier !== "desktop"
      ? createMobileActionToggle(statusBar, session, actions)
      : null;
  const mobileCursorKeys =
    actions.uiTier && actions.uiTier !== "desktop"
      ? renderMobileCursorKeyActions(actions, mobileShiftState)
      : null;
  const bottomProjectRail =
    actions.uiTier && actions.uiTier !== "desktop"
      ? renderBottomProjectRail(session, actions)
      : null;
  statusBar.classList.toggle("has-project-rail", Boolean(bottomProjectRail));
  const inlineSoftKeys =
    actions.uiTier && actions.uiTier !== "desktop" && actions.onSendSoftKey
      ? renderSoftKeyActions(
          actions,
          undefined,
          "terminal-status-inline-soft-keys",
          MOBILE_INLINE_SHIFT_SOFT_KEYS,
          mobileShiftState
        )
      : null;
  const rightActions = renderRightStatusActions(session, actions);
  statusBar.append(
    ...renderLeftStatusActions(session, actions),
    main,
    ...(bottomProjectRail ? [bottomProjectRail] : []),
    ...(mobileCursorKeys ? [mobileCursorKeys] : []),
    ...(mobileToggle ? [mobileToggle] : []),
    ...(inlineSoftKeys ? [inlineSoftKeys] : []),
    ...rightActions,
    ...(connectionStatus ? [connectionStatus] : [])
  );
  if (shouldRestoreMobileSheet && mobileToggle) {
    setMobileSheetOpen(statusBar, true, mobileToggle);
    appendMobileActionSheet(statusBar, session, actions, mobileToggle);
  }
}
