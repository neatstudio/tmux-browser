import type { ResponsiveUiTier } from "../responsiveUiTier";

export type SessionGroupMenuState = {
  currentSessionName: string;
  projectNames: string[];
  currentProjectName?: string | null;
  onOpenKanban: () => void;
  onMoveKanbanSession?: (
    fromProjectName: string | null,
    toProjectName: string,
    sessionName: string
  ) => void;
  onKillSession?: (sessionName: string) => void;
  uiTier?: ResponsiveUiTier;
};

const SESSION_GROUP_MENU_CLEANUP_EVENT =
  "tmux-ui-session-group-menu-cleanup";

function createMenuButton(
  action: string,
  label: string,
  onClick: () => void,
  title = label
) {
  const link = document.createElement("a");
  link.href = "#";
  link.dataset.action = action;
  link.textContent = label;
  link.title = title;
  link.setAttribute("role", "menuitem");
  link.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  return link;
}

export function getSortedKanbanProjectNames(state: SessionGroupMenuState) {
  const projectNames = [
    ...new Set(state.projectNames.map((name) => name.trim()).filter(Boolean))
  ];
  const currentProjectName = state.currentProjectName?.trim() || null;
  const targetProjectNames = currentProjectName
    ? [...projectNames, "ungrouped"]
    : projectNames;

  return [...targetProjectNames].sort((left, right) => {
    if (left === "ungrouped") {
      return 1;
    }

    if (right === "ungrouped") {
      return -1;
    }

    if (left === currentProjectName) {
      return -1;
    }

    if (right === currentProjectName) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

export function createSessionGroupMenu(
  state: SessionGroupMenuState,
  closePanel: () => void,
  sessionName: string
) {
  const menu = document.createElement("div");
  menu.className = "session-floating-menu-session-actions";
  menu.dataset.sessionName = sessionName;
  menu.setAttribute("role", "menu");

  const header = document.createElement("div");
  header.className = "session-floating-menu-session-actions-header";
  header.textContent = sessionName;
  menu.append(header);

  getSortedKanbanProjectNames(state).forEach((projectName) => {
    const button = createMenuButton(
      "add-session-to-project",
      `To ${projectName}`,
      () => {
        closePanel();
        state.onMoveKanbanSession?.(state.currentProjectName?.trim() || null, projectName, sessionName);
      }
    );
    button.dataset.projectName = projectName;
    menu.append(button);
  });

  if (getSortedKanbanProjectNames(state).length > 0 && state.onKillSession) {
    const separator = document.createElement("div");
    separator.className = "session-floating-menu-session-actions-separator";
    menu.append(separator);
  }

  if (state.onKillSession) {
    const killButton = createMenuButton(
      "kill-session",
      "Kill",
      () => {
        closePanel();
        const confirmKill = window.confirm(`Kill ${sessionName}?`);

        if (confirmKill) {
          state.onKillSession?.(sessionName);
        }
      },
      `Kill ${sessionName}`
    );
    menu.append(killButton);
  }

  return menu;
}

export function openSessionGroupMenu(
  root: HTMLElement,
  anchor: HTMLElement,
  state: SessionGroupMenuState,
  sessionName: string
) {
  const existingCleanupEvent = root.dataset.cleanupSessionGroupMenu;

  if (existingCleanupEvent) {
    document.dispatchEvent(new CustomEvent(existingCleanupEvent));
  }

  root.querySelector(".session-floating-menu-session-actions")?.remove();

  const cleanupEvent = `${SESSION_GROUP_MENU_CLEANUP_EVENT}-${Math.random()
    .toString(36)
    .slice(2)}`;
  root.dataset.cleanupSessionGroupMenu = cleanupEvent;

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("keydown", handleDocumentKeyDown);
    document.removeEventListener(cleanupEvent, cleanup);
    document.removeEventListener(SESSION_GROUP_MENU_CLEANUP_EVENT, cleanup);
    delete root.dataset.cleanupSessionGroupMenu;
    root.querySelector(".session-floating-menu-session-actions")?.remove();
  };

  const handleDocumentPointerDown = (event: Event) => {
    if (!(event.target instanceof Node)) {
      return;
    }

    if (anchor.contains(event.target)) {
      return;
    }

    if (root.querySelector(".session-floating-menu-session-actions")?.contains(event.target)) {
      return;
    }

    cleanup();
  };

  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      cleanup();
    }
  };

  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeyDown);
  document.addEventListener(cleanupEvent, cleanup);
  document.addEventListener(SESSION_GROUP_MENU_CLEANUP_EVENT, cleanup);

  const menu = createSessionGroupMenu(state, cleanup, sessionName);
  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.visibility = "hidden";
  root.append(menu);

  const menuRect = menu.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - menuRect.width - 8);
  const maxTop = Math.max(0, window.innerHeight - menuRect.height - 8);
  menu.style.left = `${Math.max(8, Math.min(rect.left, maxLeft))}px`;
  menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, maxTop))}px`;
  menu.style.visibility = "";

  return cleanup;
}
