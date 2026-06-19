import type {
  SessionSummary
} from "../api/sessionApi";
import {
  formatDisplayPath
} from "./renderDashboard";
import type {
  KanbanStatusProject
} from "./sessionStatusBar";

export type SessionFloatingMenuState = {
  currentSessionName: string;
  sessions: string[];
  sessionSummaries?: SessionSummary[];
  homeDirectory?: string | null;
  kanbanProject?: KanbanStatusProject | null;
  boards?: KanbanStatusProject[];
  actionCount?: number;
  actionCenterOpen?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  onOpenDashboard: () => void;
  onOpenKanban: () => void;
  onOpenSession: (sessionName: string) => void;
  onConfig: () => void;
  onRename: () => void;
  onSendCommand: () => void;
  onRefresh: () => void;
  onCreateSession: (sessionName: string) => void;
  onOpenKanbanProject?: (projectName: string) => void;
  onTogglePinned?: (sessionName: string) => void;
  onToggleMuted?: (sessionName: string) => void;
  onToggleActionCenter?: () => void;
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

function renderCurrentSessionSection(
  state: SessionFloatingMenuState,
  closePanel: () => void
) {
  const hasCurrentActions =
    Boolean(state.onTogglePinned) ||
    Boolean(state.onToggleMuted) ||
    Boolean(state.onToggleActionCenter) ||
    (state.actionCount ?? 0) > 0 ||
    Boolean(state.actionCenterOpen);

  if (!hasCurrentActions) {
    return null;
  }

  const current = createMenuSection("Current");

  if (state.onTogglePinned) {
    current.append(
      createMenuButton(
        "toggle-session-pinned",
        state.isPinned ? "Unpin" : "Pin",
        () => {
          closePanel();
          state.onTogglePinned?.(state.currentSessionName);
        },
        state.isPinned
          ? `Unpin ${state.currentSessionName}`
          : `Pin ${state.currentSessionName}`
      )
    );
  }

  if (state.onToggleMuted) {
    current.append(
      createMenuButton(
        "toggle-session-muted",
        state.isMuted ? "Unmute" : "Mute",
        () => {
          closePanel();
          state.onToggleMuted?.(state.currentSessionName);
        },
        state.isMuted
          ? `Unmute ${state.currentSessionName}`
          : `Mute ${state.currentSessionName}`
      )
    );
  }

  if (state.onToggleActionCenter && ((state.actionCount ?? 0) > 0 || state.actionCenterOpen)) {
    current.append(
      createMenuButton(
        "toggle-action-center",
        `!${state.actionCount ?? 0}`,
        () => {
          closePanel();
          state.onToggleActionCenter?.();
        },
        `${state.actionCount ?? 0} pending actions`
      )
    );
  }

  return current.childElementCount > 1 ? current : null;
}

function renderSessionShortcut(
  sessionName: string,
  label: string,
  state: SessionFloatingMenuState,
  closePanel: () => void,
  projectName?: string
) {
  const summary = state.sessionSummaries?.find(
    (session) => session.name === sessionName
  );
  const isActive = sessionName === state.currentSessionName;
  const button = createMenuButton(
    "open-session",
    "",
    () => {
      closePanel();
      if (!isActive) {
        state.onOpenSession(sessionName);
      }
    },
    isActive ? `Current session: ${sessionName}` : `Open ${sessionName}`
  );
  button.dataset.sessionName = sessionName;
  if (projectName) {
    button.dataset.projectName = projectName;
  }
  button.className = `session-floating-menu-session${
    isActive ? " is-active" : ""
  }`;

  if (isActive) {
    button.setAttribute("aria-current", "true");
  }

  const name = document.createElement("span");
  name.className = "session-floating-menu-session-name";
  name.textContent = label;

  if (summary) {
    const path = formatDisplayPath(summary.currentPath, state.homeDirectory);
    const meta = document.createElement("span");
    meta.className = "session-floating-menu-session-meta";
    meta.textContent = [
      summary.status,
      `${summary.windows}w ${summary.paneCount}p`,
      summary.currentCommand,
      path
    ]
      .filter(Boolean)
      .join(" · ");
    meta.title = meta.textContent;
    button.append(name, meta);
  } else {
    button.append(name);
  }

  return button;
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
  closePanel: () => void
) {
  const boards = getSortedBoards(state);

  if (boards.length === 0) {
    return null;
  }

  const section = createMenuSection("Boards");
  boards.forEach((board) => {
    const projectButton = createMenuButton(
      "open-kanban-project",
      `${board.name} ${board.sessions.length}`,
      () => {
        closePanel();
        state.onOpenKanbanProject?.(board.name);
      },
      `Open Kanban project ${board.name}`
    );
    projectButton.className = "session-floating-menu-board";
    projectButton.dataset.projectName = board.name;
    section.append(projectButton);

    board.sessions.forEach((session) => {
      section.append(
        renderSessionShortcut(
          session.name,
          session.label,
          state,
          closePanel,
          board.name
        )
      );
    });
  });

  return section;
}

function getGroupedSessionNames(state: SessionFloatingMenuState) {
  const boardSessionNames = new Set(
    getSortedBoards(state).flatMap((board) =>
      board.sessions.map((session) => session.name)
    )
  );

  return state.sessions.filter((sessionName) => !boardSessionNames.has(sessionName));
}

function renderPanel(
  root: HTMLElement,
  toggle: HTMLButtonElement,
  state: SessionFloatingMenuState
) {
  const closePanel = () => {
    root.querySelector(".session-floating-menu-panel")?.remove();
    toggle.setAttribute("aria-expanded", "false");
  };

  const panel = document.createElement("div");
  panel.className = "session-floating-menu-panel";
  panel.setAttribute("role", "menu");

  const quick = createMenuSection("Quick");
  quick.append(
    createMenuButton("open-kanban", "Kanban", () => {
      closePanel();
      state.onOpenKanban();
    }),
    createMenuButton("send-command", "Send", () => {
      closePanel();
      state.onSendCommand();
    }),
    createMenuButton("refresh-sessions", "Refresh", () => {
      closePanel();
      state.onRefresh();
    }),
    createMenuButton("config-session", "Config", () => {
      closePanel();
      state.onConfig();
    }),
    createMenuButton("rename-session", "Rename", () => {
      closePanel();
      state.onRename();
    })
  );
  quick.append(renderCreateSessionForm(state, closePanel));
  panel.append(quick);

  const current = renderCurrentSessionSection(state, closePanel);
  if (current) {
    panel.append(current);
  }

  const boards = renderBoardsSection(state, closePanel);
  if (boards) {
    panel.append(boards);
  }

  const sessions = createMenuSection("Sessions");
  getGroupedSessionNames(state).forEach((sessionName) => {
    sessions.append(
      renderSessionShortcut(sessionName, sessionName, state, closePanel)
    );
  });
  if (sessions.childElementCount > 1) {
    panel.append(sessions);
  }

  root.append(panel);
}

export function renderSessionFloatingMenu(
  root: HTMLElement,
  state: SessionFloatingMenuState
) {
  root.querySelector(".session-floating-menu")?.remove();

  const container = document.createElement("div");
  container.className = "session-floating-menu";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "session-floating-menu-toggle";
  toggle.dataset.action = "toggle-session-floating-menu";
  toggle.textContent = "Menu";
  toggle.title = "Open session menu";
  toggle.setAttribute("aria-label", "Open session menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();

    const existing = container.querySelector(".session-floating-menu-panel");
    if (existing) {
      existing.remove();
      toggle.setAttribute("aria-expanded", "false");
      return;
    }

    toggle.setAttribute("aria-expanded", "true");
    renderPanel(container, toggle, state);
  });

  container.append(toggle);
  root.append(container);
}
