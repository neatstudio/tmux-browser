import type {
  SessionSummary
} from "../api/sessionApi";
import type { TimelineEvent } from "../../shared/timeline";
import type {
  KanbanStatusProject
} from "./sessionStatusBar";

const FLOATING_MENU_GLOBAL_CLEANUP_EVENT = "tmux-ui-floating-menu-cleanup";

export type SessionFloatingMenuState = {
  currentSessionName: string;
  sessions: string[];
  sessionSummaries?: SessionSummary[];
  homeDirectory?: string | null;
  kanbanProject?: KanbanStatusProject | null;
  boards?: KanbanStatusProject[];
  pinnedSessionNames?: Set<string>;
  mutedSessionNames?: Set<string>;
  timelineEvents?: TimelineEvent[];
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
  onOpenGroupTask?: () => void;
  onOpenGroupMessages?: () => void;
  onReconnect?: () => void;
  onPreviewImage?: () => void;
  onChooseImage?: () => void;
  onCaptureImage?: () => void;
  onKill?: () => void;
  onRefresh: () => void;
  onCreateSession: (sessionName: string) => void;
  onOpenKanbanProject?: (projectName: string) => void;
  onTogglePinned?: (sessionName: string) => void;
  onToggleMuted?: (sessionName: string) => void;
  onToggleActionCenter?: () => void;
  onRefreshMuted?: () => void;
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
  projectName?: string,
  options: { controls?: boolean } = {}
) {
  const summary = state.sessionSummaries?.find(
    (session) => session.name === sessionName
  );
  const isActive = sessionName === state.currentSessionName;
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
    button.append(name);
  }

  item.append(button);

  if (options.controls) {
    const controls = document.createElement("span");
    controls.className = "session-floating-menu-session-controls";

    if (state.onTogglePinned) {
      const pinned = state.pinnedSessionNames?.has(sessionName) ?? false;
      const pinButton = createMenuButton(
        "toggle-floating-session-pinned",
        pinned ? "★" : "☆",
        () => {
          closePanel();
          state.onTogglePinned?.(sessionName);
        },
        `${pinned ? "Unpin" : "Pin"} ${sessionName}`
      );
      pinButton.dataset.targetSession = sessionName;
      pinButton.setAttribute("aria-pressed", pinned ? "true" : "false");
      controls.append(pinButton);
    }

    if (state.onToggleMuted) {
      const muted = state.mutedSessionNames?.has(sessionName) ?? false;
      const muteButton = createMenuButton(
        "toggle-floating-session-muted",
        "M",
        () => {
          closePanel();
          state.onToggleMuted?.(sessionName);
        },
        `${muted ? "Unmute" : "Mute"} ${sessionName}`
      );
      muteButton.dataset.targetSession = sessionName;
      muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
      controls.append(muteButton);
    }

    if (controls.childElementCount > 0) {
      item.append(controls);
    }
  }

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
  closePanel: () => void
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
          board.name,
          { controls: true }
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
  options: { muted?: boolean; fieldset?: boolean } = {}
) {
  if (sessionNames.length === 0) {
    return null;
  }

  const section = createMenuSection(title);
  const container = options.fieldset
    ? document.createElement("fieldset")
    : section;

  if (options.muted && state.onRefreshMuted) {
    section.append(
      createMenuButton(
        "refresh-muted-sessions",
        "Refresh mute",
        () => {
          closePanel();
          state.onRefreshMuted?.();
        },
        "Refresh muted sessions"
      )
    );
  }

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
      renderSessionShortcut(sessionName, sessionName, state, closePanel, undefined, {
        controls: true
      })
    );
  });

  if (options.fieldset) {
    section.append(container);
  }

  return section;
}

function renderUngroupedSection(
  state: SessionFloatingMenuState,
  closePanel: () => void
) {
  return renderSessionGroup(
    "Ungrouped",
    getUngroupedSessionNames(state),
    state,
    closePanel,
    { fieldset: true }
  );
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

function renderTimelineSection(state: SessionFloatingMenuState) {
  const events = state.timelineEvents?.slice(0, 4) ?? [];

  if (events.length === 0) {
    return null;
  }

  const section = createMenuSection("Timeline");
  section.classList.add("session-floating-menu-timeline");

  events.forEach((event) => {
    const item = document.createElement("span");
    item.className = "session-floating-menu-timeline-item";
    item.title = `${event.sessionName ?? "system"} · ${event.message}`;

    const time = document.createElement("span");
    time.textContent = formatTimelineTime(event.createdAt);

    const text = document.createElement("span");
    text.textContent = `${event.sessionName ?? "system"} · ${event.message}`;

    item.append(time, text);
    section.append(item);
  });

  return section;
}

function renderPanel(
  root: HTMLElement,
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

  const quick = createMenuSection("Quick");
  quick.append(
    createMenuButton("open-kanban", "Kanban", () => {
      closePanel();
      state.onOpenKanban();
    }),
    createMenuButton("send-command", "Send", () => {
      closePanel();
      state.onSendCommand();
    })
  );
  if (state.kanbanProject && state.onOpenGroupTask) {
    quick.append(
      createMenuButton("open-group-task", "Task", () => {
        closePanel();
        state.onOpenGroupTask?.();
      }, "Send task/report to group sessions")
    );
  }
  if (state.kanbanProject && state.onOpenGroupMessages) {
    quick.append(
      createMenuButton("open-group-messages", "Messages", () => {
        closePanel();
        state.onOpenGroupMessages?.();
      }, "Open group message history")
    );
  }
  quick.append(
    createMenuButton("reconnect-session", "Recon", () => {
      closePanel();
      state.onReconnect?.();
    }, "Reconnect terminal websocket"),
    createMenuButton("preview-image", "Img", () => {
      closePanel();
      state.onPreviewImage?.();
    }, "Preview image file"),
    createMenuButton("choose-image", "Photo", () => {
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
  if (state.onRefreshMuted && (state.mutedSessionNames?.size ?? 0) > 0) {
    quick.append(
      createMenuButton(
        "refresh-muted-sessions",
        "Refresh mute",
        () => {
          closePanel();
          state.onRefreshMuted?.();
        },
        "Refresh muted sessions"
      )
    );
  }
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

  const ungrouped = renderUngroupedSection(state, closePanel);
  if (ungrouped) {
    panel.append(ungrouped);
  }

  const timeline = renderTimelineSection(state);
  if (timeline) {
    panel.append(timeline);
  }

  root.append(panel);

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
