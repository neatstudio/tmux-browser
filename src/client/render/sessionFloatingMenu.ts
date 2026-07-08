import type {
  SessionSummary
} from "../api/sessionApi";
import type {
  KanbanDraft
} from "./renderKanban";
import type {
  KanbanStatusProject
} from "./sessionStatusBar";
import type { ResponsiveUiTier } from "../responsiveUiTier";
import {
  renderKanbanCreatePanelContent
} from "./kanbanCreatePanel";
import {
  openSessionGroupMenu
} from "./sessionGroupMenu";
import { MOBILE_SOFT_KEYS } from "../terminal/softKeys";

const FLOATING_MENU_GLOBAL_CLEANUP_EVENT = "tmux-ui-floating-menu-cleanup";

export type SessionFloatingMenuState = {
  currentSessionName: string;
  currentProjectName?: string | null;
  sessions: string[];
  sessionSummaries?: SessionSummary[];
  homeDirectory?: string | null;
  kanbanProject?: KanbanStatusProject | null;
  boards?: KanbanStatusProject[];
  actionCount?: number;
  actionCenterOpen?: boolean;
  kanbanDraft?: KanbanDraft;
  onOpenDashboard: () => void;
  onOpenKanban: () => void;
  onOpenSession: (sessionName: string) => void;
  onConfig: () => void;
  onRename: () => void;
  onSendCommand: () => void;
  onOpenGroupTask?: () => void;
  onOpenGroupMessages?: () => void;
  onReconnect?: () => void;
  onPreviewImage?: () => void;
  onChooseImage?: () => void;
  onCaptureImage?: () => void;
  onKill?: () => void;
  onSendSoftKey?: (sequence: string) => void;
  onRefresh: () => void;
  onCreateSession: (sessionName: string) => void;
  onKanbanDraftChange?: (
    draft: KanbanDraft,
    options?: { render?: boolean }
  ) => void;
  onCreateKanbanProject?: () => void;
  onCreateKanbanProjectFromSession?: (
    project: {
      name: string;
      path: string;
      server: string | null;
    },
    sessionName: string
  ) => void;
  onAddKanbanSession?: (projectName: string, sessionName: string) => void;
  onMoveKanbanSession?: (
    fromProjectName: string | null,
    toProjectName: string,
    sessionName: string
  ) => void;
  onOpenKanbanProject?: (projectName: string) => void;
  onToggleActionCenter?: () => void;
  onKillSession?: (sessionName: string) => void;
  uiTier?: ResponsiveUiTier;
};

type SessionActionMenuState = {
  sessionName: string;
  close: () => void;
};

function createMenuButton(
  action: string,
  label: string,
  onClick: () => void,
  title = label
) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.title = title;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
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

function createMenuSection(titleText: string) {
  const section = document.createElement("section");
  section.className = "session-floating-menu-section";

  const title = document.createElement("div");
  title.className = "session-floating-menu-title";
  title.textContent = titleText;

  section.append(title);

  return section;
}

function renderCreateSessionForm(
  state: SessionFloatingMenuState,
  closePanel: () => void
) {
  const form = document.createElement("form");
  form.className = "session-floating-menu-create";

  const input = document.createElement("input");
  input.type = "text";
  input.name = "session-name";
  input.placeholder = "new session";
  input.autocomplete = "off";

  const button = document.createElement("button");
  button.type = "submit";
  button.dataset.action = "create-session";
  button.textContent = "New";
  button.title = "Create session";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const sessionName = input.value.trim();

    if (!sessionName) {
      return;
    }

    closePanel();
    state.onCreateSession(sessionName);
  });

  form.append(input, button);

  return form;
}

function renderProjectManagementSection(
  state: SessionFloatingMenuState,
  closePanel: () => void
) {
  if (!state.kanbanDraft || !state.onKanbanDraftChange) {
    return null;
  }

  const section = createMenuSection("Project");
  section.classList.add("session-floating-menu-projects");

  const createPanel = renderKanbanCreatePanelContent({
    uiTier: state.uiTier,
    draft: state.kanbanDraft,
    loading: false,
    onDraftChange: (draft, options) => {
      state.onKanbanDraftChange?.(draft, options);
    },
    onCreateProject: (draft) => {
      const name = draft.name.trim();
      if (!name) {
        return;
      }

      closePanel();
    state.onCreateKanbanProjectFromSession?.(
      {
        name,
        path: draft.path.trim() || "~",
        server: draft.server.trim() || null,
        selectedAgentNames:
          draft.selectedAgentNames.length > 0
            ? draft.selectedAgentNames
            : [state.currentSessionName]
      },
        state.currentSessionName
      );
    }
  });
  section.append(createPanel);

  const boards = state.boards?.filter((board) => !board.virtual) ?? [];
  const ungroupedSessionNames = getUngroupedSessionNames(state);

  if (
    boards.length > 0 &&
    ungroupedSessionNames.length > 0 &&
    state.onAddKanbanSession
  ) {
    const moveForm = document.createElement("form");
    moveForm.className = "session-floating-menu-project-move";

    const sessionSelect = document.createElement("select");
    sessionSelect.name = "floating-session-name";
    sessionSelect.setAttribute("aria-label", "Session to move");

    const orderedSessionNames = [
      state.currentSessionName,
      ...ungroupedSessionNames.filter(
        (sessionName) => sessionName !== state.currentSessionName
      )
    ].filter((sessionName) => ungroupedSessionNames.includes(sessionName));

    orderedSessionNames.forEach((sessionName) => {
      const option = document.createElement("option");
      option.value = sessionName;
      option.textContent = sessionName;
      sessionSelect.append(option);
    });

    const projectSelect = document.createElement("select");
    projectSelect.name = "floating-target-project";
    projectSelect.setAttribute("aria-label", "Target project");

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "to group";
    projectSelect.append(placeholder);

    boards.forEach((board) => {
      const option = document.createElement("option");
      option.value = board.name;
      option.textContent = board.name;
      projectSelect.append(option);
    });

    const moveButton = document.createElement("button");
    moveButton.type = "submit";
    moveButton.dataset.action = "move-session-to-project";
    moveButton.textContent = "Move";
    moveButton.title = "Move session to project group";

    moveForm.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!sessionSelect.value || !projectSelect.value) {
        return;
      }

      closePanel();
      state.onMoveKanbanSession?.(
        state.kanbanProject?.name ?? null,
        projectSelect.value,
        sessionSelect.value
      );
    });

    moveForm.append(sessionSelect, projectSelect, moveButton);
    section.append(moveForm);
  }

  return section;
}

function renderCurrentSessionSection(
  state: SessionFloatingMenuState,
  closePanel: () => void
) {
  const actionCount = state.actionCount ?? 0;
  const hasActionCenter =
    Boolean(state.onToggleActionCenter) ||
    actionCount > 0 ||
    Boolean(state.actionCenterOpen);
  if (state.uiTier && state.uiTier !== "desktop") {
    const current = createMenuSection("Current");
    const currentProjectName = state.kanbanProject?.name ?? null;

    if (currentProjectName) {
      current.append(
        createMenuButton(
        "switch-groups",
        "Groups",
      () => {
        closePanel();
        if (currentProjectName) {
          state.onMoveKanbanSession?.(currentProjectName, currentProjectName, state.currentSessionName);
        }
      },
      "Switch groups"
      )
      );
    }

    if (state.onToggleActionCenter && (actionCount > 0 || state.actionCenterOpen)) {
      const actionButton = createMenuButton(
        "toggle-action-center",
        `!${actionCount}`,
        () => {
          closePanel();
          state.onToggleActionCenter?.();
        },
        `${actionCount} pending actions`
      );
      actionButton.classList.toggle("is-attention", actionCount > 0);
      current.append(actionButton);
    }

    return current.childElementCount > 1 ? current : null;
  }

  if (!hasActionCenter) {
    return null;
  }

  const current = createMenuSection("Current");

  if (state.onToggleActionCenter && (actionCount > 0 || state.actionCenterOpen)) {
    const actionButton = createMenuButton(
      "toggle-action-center",
      `!${actionCount}`,
      () => {
        closePanel();
        state.onToggleActionCenter?.();
      },
      `${actionCount} pending actions`
    );
    actionButton.classList.toggle("is-attention", actionCount > 0);
    current.append(actionButton);
  }

  return current.childElementCount > 1 ? current : null;
}

function renderSoftKeysSection(state: SessionFloatingMenuState) {
  if (!state.onSendSoftKey || (state.uiTier && state.uiTier !== "desktop")) {
    return null;
  }

  const section = createMenuSection("Keys");
  section.classList.add("session-floating-menu-soft-keys");

  MOBILE_SOFT_KEYS.forEach((key) => {
    const button = createMenuButton(
      `soft-key-${key.id}`,
      key.label,
      () => {
        state.onSendSoftKey?.(key.sequence);
      },
      key.title
    );
    button.classList.add("session-floating-menu-soft-key");
    keepCurrentInputFocusOnPress(button);
    section.append(button);
  });

  return section;
}

function renderSessionShortcut(
  sessionName: string,
  label: string,
  state: SessionFloatingMenuState,
  closePanel: () => void,
  openSessionActionMenu: (
    sessionName: string,
    anchor: HTMLElement,
    projectName?: string | null
  ) => void,
  projectName?: string | null
) {
  const summary = state.sessionSummaries?.find(
    (session) => session.name === sessionName
  );
  const boardSession = state.boards
    ?.flatMap((board) => board.sessions)
    .find((session) => session.name === sessionName);
  const isActive = sessionName === state.currentSessionName;
  const isOffline =
    boardSession?.live === false ||
    (projectName !== undefined && state.sessionSummaries !== undefined && !summary);
  const item = document.createElement("span");
  item.className = "session-floating-menu-session-item";
  if (projectName) {
    item.dataset.projectName = projectName;
  }

  const button = createMenuButton(
    "open-session",
    "",
    () => {
      closePanel();
      if (!isActive && !isOffline) {
        state.onOpenSession(sessionName);
      }
    },
    isActive
      ? `Current session: ${sessionName}`
      : isOffline
        ? `Offline saved session: ${sessionName}`
        : `Open ${sessionName}`
  );
  button.dataset.sessionName = sessionName;
  if (projectName) {
    button.dataset.projectName = projectName;
  }
  button.className = `session-floating-menu-session${
    isActive ? " is-active" : ""
  }${isOffline ? " is-offline" : ""}`;
  button.disabled = isOffline;

  const openMenu = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    openSessionActionMenu(sessionName, button, projectName);
  };

  button.addEventListener("contextmenu", openMenu);
  let longPressTimer: number | null = null;
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") {
      return;
    }

    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      openSessionActionMenu(sessionName, button, projectName);
    }, 600);
  });
  button.addEventListener("pointerup", () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });
  button.addEventListener("pointercancel", () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });
  button.addEventListener("pointermove", () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  if (isActive) {
    button.setAttribute("aria-current", "true");
  }

  const name = document.createElement("span");
  name.className = "session-floating-menu-session-name";
  name.textContent = label;

  if (summary) {
    const meta = document.createElement("span");
    meta.className = "session-floating-menu-session-meta";
    meta.textContent = [
      summary.status,
      `${summary.windows}w ${summary.paneCount}p`,
      summary.currentCommand
    ]
      .filter(Boolean)
      .join(" · ");
    meta.title = meta.textContent;
    button.append(name, meta);
  } else {
    button.classList.add("is-name-only");
    button.append(name);
  }

  item.append(button);

  return item;
}

function getSortedBoards(state: SessionFloatingMenuState) {
  const boards = state.boards?.filter((board) => board.sessions.length > 0) ?? [];
  const currentBoardName =
    state.kanbanProject?.name ??
    boards.find((board) =>
      board.sessions.some((session) => session.name === state.currentSessionName)
    )?.name;

  return [...boards].sort((left, right) => {
    if (left.name === currentBoardName) {
      return -1;
    }

    if (right.name === currentBoardName) {
      return 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function renderBoardsSection(
  state: SessionFloatingMenuState,
  closePanel: () => void,
  openSessionActionMenu: (
    sessionName: string,
    anchor: HTMLElement,
    projectName?: string
  ) => void
) {
  const boards = getSortedBoards(state);

  if (boards.length === 0) {
    return null;
  }

  const section = createMenuSection("Boards");
  boards.forEach((board) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "session-floating-menu-board";
    fieldset.dataset.projectName = board.name;

    const label = document.createElement("legend");
    label.className = "session-floating-menu-board-label";
    label.dataset.projectName = board.name;
    label.textContent = `${board.name} · ${board.sessions.length}`;
    label.title = `Kanban project: ${board.name}`;
    fieldset.append(label);

    board.sessions.forEach((session) => {
      fieldset.append(
        renderSessionShortcut(
          session.name,
          session.label,
          state,
          closePanel,
          openSessionActionMenu,
          board.name
        )
      );
    });

    section.append(fieldset);
  });

  return section;
}

function getBoardSessionNameSet(state: SessionFloatingMenuState) {
  return new Set(
    (state.boards ?? []).flatMap((board) =>
      board.sessions.map((session) => session.name)
    )
  );
}

function getUngroupedSessionNames(state: SessionFloatingMenuState) {
  const boardSessionNames = getBoardSessionNameSet(state);

  return state.sessions.filter((name) => !boardSessionNames.has(name));
}

function renderSessionGroup(
  title: string,
  sessionNames: string[],
  state: SessionFloatingMenuState,
  closePanel: () => void,
  openSessionActionMenu: (
    sessionName: string,
    anchor: HTMLElement,
    projectName?: string | null
  ) => void,
  options: { fieldset?: boolean } = {}
) {
  if (sessionNames.length === 0) {
    return null;
  }

  const section = createMenuSection(title);
  const container = options.fieldset
    ? document.createElement("fieldset")
    : section;

  if (options.fieldset && container instanceof HTMLFieldSetElement) {
    container.className = "session-floating-menu-board";
    container.dataset.projectName = title.toLowerCase();

    const label = document.createElement("legend");
    label.className = "session-floating-menu-board-label";
    label.dataset.projectName = title.toLowerCase();
    label.textContent = `${title} · ${sessionNames.length}`;
    container.append(label);
  }

  sessionNames.forEach((sessionName) => {
    container.append(
      renderSessionShortcut(
        sessionName,
        sessionName,
        state,
        closePanel,
        openSessionActionMenu,
        options.fieldset ? null : undefined
      )
    );
  });

  if (options.fieldset) {
    section.append(container);
  }

  return section;
}

function renderUngroupedSection(
  state: SessionFloatingMenuState,
  closePanel: () => void,
  openSessionActionMenu: (
    sessionName: string,
    anchor: HTMLElement,
    projectName?: string | null
  ) => void
) {
  return renderSessionGroup(
    "Ungrouped",
    getUngroupedSessionNames(state),
    state,
    closePanel,
    openSessionActionMenu,
    { fieldset: true }
  );
}

function renderPanel(
  container: HTMLElement,
  toggle: HTMLButtonElement,
  state: SessionFloatingMenuState,
  closePanel: () => void,
  restore?: {
    createSessionDraft?: string;
    focusSelector?: string;
  }
  ) {
  const panel = document.createElement("div");
  panel.className = "session-floating-menu-panel";
  panel.setAttribute("role", "menu");
  let activeSessionActionMenu: SessionActionMenuState | null = null;
  const clearActiveSessionActionMenu = () => {
    activeSessionActionMenu?.close();
    activeSessionActionMenu = null;
  };

  const closeSessionActionMenu = () => {
    clearActiveSessionActionMenu();
  };

  const openSessionActionMenu = (
    sessionName: string,
    anchor: HTMLElement,
    projectName?: string | null
  ) => {
    closeSessionActionMenu();

    const cleanup = openSessionGroupMenu(
      container,
      anchor,
      {
        currentSessionName: sessionName,
        currentProjectName:
          projectName === null
            ? null
            : projectName?.trim() ??
              state.currentProjectName?.trim() ??
              (state.kanbanProject?.virtual ? null : state.kanbanProject?.name ?? null),
        projectNames: (state.boards ?? [])
          .filter((board) => !board.virtual)
          .map((board) => board.name),
        onOpenKanban: state.onOpenKanban,
        onMoveKanbanSession: state.onMoveKanbanSession,
        onKillSession: state.onKillSession,
        uiTier: state.uiTier
      },
      sessionName
    );
    activeSessionActionMenu = { sessionName, close: cleanup };
  };

  const actionsPane = document.createElement("div");
  actionsPane.className = "session-floating-menu-actions-pane";
  const sessionsPane = document.createElement("div");
  sessionsPane.className = "session-floating-menu-sessions-pane";

  const actions = createMenuSection("Actions");
  actions.classList.add("session-floating-menu-actions");
  actions.append(
    createMenuButton("open-current-session-groups", "Groups", () => {
      const anchor = panel.querySelector<HTMLElement>(
        "[data-action='open-current-session-groups']"
      );

      if (anchor) {
        openSessionActionMenu(state.currentSessionName, anchor);
      }
    }, "Move current session to another group"),
    createMenuButton("open-kanban", "Grp", () => {
      closePanel();
      state.onOpenKanban();
    }, "Open group manager"),
    createMenuButton(
      "open-create-group",
      "New group",
      () => {
        const template = panel.querySelector<HTMLElement>(
          ".session-floating-menu-projects .kanban-template"
        );

        template?.scrollIntoView?.({ block: "nearest" });
        template
          ?.querySelector<HTMLInputElement>("input[type='checkbox']")
          ?.focus();
      },
      "Focus create group form"
    ),
    createMenuButton("send-command", "Cmd", () => {
      closePanel();
      state.onSendCommand();
    })
  );
  if (state.kanbanProject && state.onOpenGroupTask) {
    actions.append(
      createMenuButton("open-group-task", "Tsk", () => {
        closePanel();
        state.onOpenGroupTask?.();
      }, "Send task/report to group sessions")
    );
  }
  if (state.kanbanProject && state.onOpenGroupMessages) {
    actions.append(
      createMenuButton("open-group-messages", "Msg", () => {
        closePanel();
        state.onOpenGroupMessages?.();
      }, "Open group message history")
    );
  }
  actions.append(
    createMenuButton("reconnect-session", "Rec", () => {
      closePanel();
      state.onReconnect?.();
    }, "Reconnect terminal websocket"),
    createMenuButton("preview-image", "Img", () => {
      closePanel();
      state.onPreviewImage?.();
    }, "Preview image file"),
    createMenuButton("choose-image", "Pic", () => {
      closePanel();
      state.onChooseImage?.();
    }, "Choose image and insert saved path"),
    createMenuButton("capture-image", "Cam", () => {
      closePanel();
      state.onCaptureImage?.();
    }, "Take photo and insert saved path"),
    createMenuButton("kill-session", "Kill", () => {
      closePanel();
      state.onKill?.();
    }, "Kill session"),
    createMenuButton("refresh-sessions", "Sync", () => {
      closePanel();
      state.onRefresh();
    }, "Sync live sessions and group status"),
    createMenuButton("config-session", "Cfg", () => {
      closePanel();
      state.onConfig();
    }),
    createMenuButton("rename-session", "Ren", () => {
      closePanel();
      state.onRename();
    })
  );
  actionsPane.append(actions);
  const softKeys = renderSoftKeysSection(state);
  if (softKeys) {
    actionsPane.append(softKeys);
  }
  actionsPane.append(renderCreateSessionForm(state, closePanel));
  const projectManagement = renderProjectManagementSection(state, closePanel);
  if (projectManagement) {
    actionsPane.append(projectManagement);
  }

  const boards = renderBoardsSection(state, closePanel, openSessionActionMenu);
  if (boards) {
    sessionsPane.append(boards);
  }

  const ungrouped = renderUngroupedSection(
    state,
    closePanel,
    openSessionActionMenu
  );
  if (ungrouped) {
    sessionsPane.append(ungrouped);
  }

  container.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement) {
      const sessionButton = event.target.closest<HTMLElement>(
        "[data-session-name]"
      );

      if (sessionButton && event.target === sessionButton) {
        closeSessionActionMenu();
      }
    }
  });

  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSessionActionMenu();
    }
  });

  const current = renderCurrentSessionSection(state, closePanel);
  if (current) {
    actionsPane.append(current);
  }

  panel.append(actionsPane);
  panel.append(sessionsPane);

  container.append(panel);

  const createSessionInput = panel.querySelector<HTMLInputElement>(
    "input[name='session-name']"
  );
  if (createSessionInput && restore?.createSessionDraft !== undefined) {
    createSessionInput.value = restore.createSessionDraft;
  }

  if (restore?.focusSelector) {
    const restored = panel.querySelector<HTMLElement>(restore.focusSelector);
    if (restored) {
      restored.focus();
      return;
    }
  }

  panel.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
}

function getFocusedElementSelector(root: HTMLElement) {
  const active = document.activeElement;

  if (!(active instanceof HTMLElement) || !root.contains(active)) {
    return null;
  }

  if (active instanceof HTMLInputElement && active.name) {
    return `input[name='${active.name}']`;
  }

  const action = active.dataset.action;
  if (action) {
    const targetSession = active.dataset.targetSession;
    const sessionName = active.dataset.sessionName;
    const projectName = active.dataset.projectName;
    const parts = [`[data-action='${action}']`];

    if (targetSession) {
      parts.push(`[data-target-session='${targetSession}']`);
    }
    if (sessionName) {
      parts.push(`[data-session-name='${sessionName}']`);
    }
    if (projectName) {
      parts.push(`[data-project-name='${projectName}']`);
    }

    return parts.join("");
  }

  return null;
}

function getMenuFocusableElements(panel: Element | null) {
  if (!panel) {
    return [];
  }

  return [
    ...panel.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled)"
    )
  ].filter((element) => element.offsetParent !== null || element.isConnected);
}

export function renderSessionFloatingMenu(
  root: HTMLElement,
  state: SessionFloatingMenuState
) {
  const existingMenu = root.querySelector(".session-floating-menu") as
    | HTMLElement
    | null;
  const existingPanel = existingMenu?.querySelector(".session-floating-menu-panel");
  const createSessionDraft =
    existingPanel?.querySelector<HTMLInputElement>("input[name='session-name']")
      ?.value;
  const focusSelector = existingMenu ? getFocusedElementSelector(existingMenu) : null;
  const existingCleanup = (
    existingMenu
  )?.dataset.cleanupFloatingMenu;
  const wasOpen =
    root
      .querySelector<HTMLButtonElement>(
        ".session-floating-menu-toggle[aria-expanded='true']"
      )
      ?.getAttribute("aria-expanded") === "true";

  if (existingCleanup) {
    document.dispatchEvent(new CustomEvent(existingCleanup));
  }

  root.querySelector(".session-floating-menu")?.remove();

  const container = document.createElement("div");
  container.className = "session-floating-menu";
  const cleanupEvent = `tmux-ui-floating-menu-cleanup-${Math.random()
    .toString(36)
    .slice(2)}`;
  container.dataset.cleanupFloatingMenu = cleanupEvent;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "session-floating-menu-toggle";
  toggle.dataset.action = "toggle-session-floating-menu";
  toggle.textContent = "Menu";
  toggle.title = "Open session menu";
  toggle.setAttribute("aria-label", "Open session menu");
  toggle.setAttribute("aria-expanded", wasOpen ? "true" : "false");
  let cleanupOpenListeners: (() => void) | null = null;

  const closePanel = (options: { focusToggle?: boolean } = {}) => {
    const submenuCleanupEvent = container.dataset.cleanupSessionGroupMenu;
    if (submenuCleanupEvent) {
      document.dispatchEvent(new CustomEvent(submenuCleanupEvent));
    }
    container.querySelector(".session-floating-menu-panel")?.remove();
    toggle.setAttribute("aria-expanded", "false");
    cleanupOpenListeners?.();
    cleanupOpenListeners = null;
    if (options.focusToggle) {
      toggle.focus();
    }
  };

  const handleDocumentPointerDown = (event: Event) => {
    if (!container.querySelector(".session-floating-menu-panel")) {
      return;
    }

    if (event.target instanceof Node && container.contains(event.target)) {
      return;
    }

    closePanel({ focusToggle: true });
  };

  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closePanel({ focusToggle: true });
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const panel = container.querySelector(".session-floating-menu-panel");
    if (!panel || !(document.activeElement instanceof HTMLElement)) {
      return;
    }

    if (!panel.contains(document.activeElement)) {
      return;
    }

    const focusable = getMenuFocusableElements(panel);
    const first = focusable[0];
    const last = focusable.at(-1);
    const activeIndex = focusable.indexOf(document.activeElement);

    if (!first || !last || activeIndex === -1) {
      return;
    }

    if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      last.focus();
    }
  };

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    cleanupOpenListeners?.();
    cleanupOpenListeners = null;
  };

  const openPanel = (restore?: {
    createSessionDraft?: string;
    focusSelector?: string;
  }) => {
    document.dispatchEvent(new CustomEvent(FLOATING_MENU_GLOBAL_CLEANUP_EVENT));
    cleanedUp = false;
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    document.addEventListener(cleanupEvent, cleanup);
    document.addEventListener(FLOATING_MENU_GLOBAL_CLEANUP_EVENT, cleanup);
    cleanupOpenListeners = () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.removeEventListener(cleanupEvent, cleanup);
      document.removeEventListener(FLOATING_MENU_GLOBAL_CLEANUP_EVENT, cleanup);
    };

    toggle.setAttribute("aria-expanded", "true");
    renderPanel(container, toggle, state, closePanel, restore);
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();

    const existing = container.querySelector(".session-floating-menu-panel");
    if (existing) {
      closePanel({ focusToggle: true });
      return;
    }

    openPanel();
  });

  container.append(toggle);
  root.append(container);

  if (wasOpen) {
    openPanel({
      createSessionDraft,
      focusSelector: focusSelector ?? undefined
    });
  }
}
