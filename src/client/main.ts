import { createSessionApi } from "./api/sessionApi";
import { deriveActionCenterItems } from "./actionCenter";
import type { ActionCenterHookEventItem } from "./actionCenter";
import { renderActionCenterPanel } from "./render/actionCenter";
import { renderHookEventToast } from "./render/hookEventToast";
import { renderInputPromptToast } from "./render/inputPromptToast";
import { renderDashboard } from "./render/renderDashboard";
import {
  getKanbanAgentSessionName,
  renderKanban,
  type KanbanDraft
} from "./render/renderKanban";
import { createAnimationFrameScheduler } from "./render/renderScheduler";
import { renderGroupMessagePanel } from "./render/groupMessagePanel";
import { renderSessionConfigModal } from "./render/sessionConfigModal";
import { renderSessionFloatingMenu } from "./render/sessionFloatingMenu";
import { renderSessionGroupRail } from "./render/sessionGroupRail";
import { renderSessionStatusBar } from "./render/sessionStatusBar";
import { createDashboardStore } from "./state/dashboardStore";
import { createInputPromptRegistry } from "./state/inputPromptRegistry";
import { createMutedSessionsStore } from "./state/mutedSessions";
import { createSessionListCache } from "./state/sessionListCache";
import { createSidebarFavoritesStore } from "./state/sidebarFavorites";
import { createSessionSettingsStore } from "./state/sessionSettings";
import { createTabState, type BrowserTab } from "./state/tabState";
import { createInactiveTerminalPruner } from "./terminal/inactiveTerminalPruner";
import { findPaneAtTerminalPoint } from "./terminal/paneHitTest";
import {
  detectTerminalInputPrompt,
  type TerminalInputPrompt
} from "./terminal/inputPromptDetector";
import { syncTerminalPanelVisibility } from "./terminal/panelVisibility";
import { getVisibleImagePaths } from "./imagePreviewPaths";
import {
  applyImagePreviewOpenFocus,
  focusImagePreviewPathInput
} from "./imagePreviewFocus";
import { getCompactPageTitle } from "./pageTitle";
import { getResponsiveSessionDefaults } from "./responsiveSessionSettings";
import { createAppEventRefreshScheduler } from "./events/appEventRefreshScheduler";
import { createAppEventSocket } from "./events/appEventSocket";
import { createPageActivityController } from "./events/pageActivityController";
import { fetchAppHealth, isServerVersionNewer } from "./appVersion";
import {
  applyTheme,
  getTheme,
  loadThemeId,
  saveThemeId,
  THEMES,
  type AppTheme
} from "./theme/themeState";
import {
  getImageFileFromFiles,
  uploadImageForSession
} from "./imageUpload";
import { getResponsiveUiTier } from "./responsiveUiTier";
import {
  buildViewUrl,
  getAppShellClasses,
  getInitialAppView,
  getRequestedAppView,
  shouldPromoteActiveTabToTerminal,
  type AppView
} from "./layoutMode";
import { isPageVisible } from "./pageVisibility";
import {
  createKanbanStatusProjectsCache,
  getKanbanStatusProject as resolveKanbanStatusProject,
  getKanbanStatusProjects as resolveKanbanStatusProjects
} from "./kanbanStatusProjects";
import {
  getDefaultKanbanSelectedSessionNames
} from "../shared/kanbanTemplates";
import type { GroupMessage } from "../shared/groupMessages";
import { installMobileKeyboardViewportController } from "./mobileKeyboardViewport";
import "./styles.css";

declare const __TMUX_UI_CLIENT_VERSION__: string;

type MountedTerminal = {
  destroy: () => void;
  sendInput: (data: string) => void;
  getVisibleText: () => string;
  clear: () => void;
  redraw: () => void;
  reconnect: () => void;
  focus: () => void;
  chooseImage: () => void;
  captureImage: () => void;
  scrollPage: (direction: "back" | "forward") => void;
  toggleBrowserScroll: () => boolean;
  isBrowserScrollEnabled: () => boolean;
  setTheme: (theme: AppTheme["terminalTheme"]) => void;
  setFontSize: (fontSize: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setLineHeight: (lineHeight: number) => void;
  panel: HTMLElement;
  statusBar: HTMLElement;
};

type MountedTerminalCore = Omit<MountedTerminal, "panel" | "statusBar">;

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

const appRoot = app;
const requestedAppView = getRequestedAppView();
const tabState = createTabState({
  initialActiveTabId: requestedAppView === "kanban" ? null : undefined
});
let appView: AppView = getInitialAppView(requestedAppView, tabState.getActiveTabId());
const shellLayoutMode = "none";

appRoot.innerHTML = `
  <div class="${getAppShellClasses(shellLayoutMode, appView)}">
    <div class="content-root">
      <div class="dashboard-root"></div>
      <div class="panels-root"></div>
    </div>
  </div>
`;

const dashboardRoot = appRoot.querySelector<HTMLElement>(".dashboard-root")!;
const panelsRoot = appRoot.querySelector<HTMLElement>(".panels-root")!;
appRoot.querySelector<HTMLElement>(".app-shell")?.style.setProperty("grid-template-rows", "1fr");

document.title = getCompactPageTitle(
  window.location.hostname,
  __TMUX_UI_CLIENT_VERSION__
);
installMobileKeyboardViewportController();

let activeTheme = getTheme(loadThemeId());
let draftSessionName = "";
let kanbanDraft: KanbanDraft = {
  name: "",
  path: "~",
  server: "",
  selectedAgentNames: getDefaultKanbanSelectedSessionNames()
};
let activeConfigSessionName: string | null = null;
let activeSendSessionName: string | null = null;
let activeSwitchSessionName: string | null = null;
let draftSendTargetName = "";
let draftSendCommand = "";
let activeKanbanProjectName: string | null =
  requestedAppView === "kanban"
    ? new URLSearchParams(window.location.search).get("project")
    : null;
let activeGroupMessagePanel: {
  projectName: string;
  sessionName: string;
  messages: GroupMessage[];
  loading: boolean;
  error: string | null;
} | null = null;
let currentActionCount = 0;
const api = createSessionApi();
const inputPrompts = createInputPromptRegistry();
const sessionSettings = createSessionSettingsStore(
  window.localStorage,
  api,
  getResponsiveSessionDefaults(window.innerWidth)
);
const mutedSessions = createMutedSessionsStore(window.localStorage, api);
const sessionListCache = createSessionListCache(window.localStorage);
const sidebarFavorites = createSidebarFavoritesStore(api);
const store = createDashboardStore({
  api,
  pollMs: 10_000,
  pruneTabs: (validSessionNames) => tabState.pruneTabs(validSessionNames),
  shouldIncludePreview: () => tabState.getActiveTabId() === null && appView !== "kanban",
  shouldIncludePanes: () => tabState.getActiveTabId() !== null,
  getDashboardPollOptions: () => null,
  preferActiveSessionStatus: true,
  sessionListCache,
  isActiveSessionBusy: () => {
    const activeTabId = tabState.getActiveTabId();

    return activeTabId !== null && busyTerminalTabIds.has(activeTabId);
  },
  getActiveSessionName: () => {
    const activeTabId = tabState.getActiveTabId();

    return (
      tabState.getTabs().find((tab) => tab.id === activeTabId)?.sessionName ?? null
    );
  },
  getMutedSessionNames: () => mutedSessions.getMutedSessionNames()
});
const kanbanStatusProjectsCache = createKanbanStatusProjectsCache(
  window.localStorage
);
let cachedKanbanStatusProjects = kanbanStatusProjectsCache.read();
let hasResolvedKanbanStatusProjectsCache = cachedKanbanStatusProjects.length > 0;
let lastKanbanStatusProjectsCacheSignature = "";
const mountedTerminals = new Map<string, MountedTerminal>();
const pendingTerminalMounts = new Set<string>();
const inactiveTerminalPruner = createInactiveTerminalPruner({
  delayMs: 5000
});
const activeOutputTimers = new Map<string, ReturnType<typeof setTimeout>>();
const busyTerminalTabIds = new Set<string>();
const terminalPromptSignatures = new Map<string, string>();
let versionReloadCheckInFlight = false;
function refreshCurrentViewState(options: { includeTimeline?: boolean } = {}) {
  const refreshPromise =
    appView === "kanban"
      ? store.refreshSessionList()
      : store
          .refresh({
            includePreview: false,
            includePanes: true,
            includeServerStatus: false,
            preferActiveSessionStatus: false
          })
          .then(() =>
            options.includeTimeline === false
              ? Promise.resolve()
              : store.refreshTimeline()
          );

  return refreshPromise.then(() => {
    scheduleRender();
  });
}

const appEventRefreshScheduler = createAppEventRefreshScheduler(() => {
  void store.syncSessionAndKanbanState().then(() => scheduleRender());
});

function shouldOpenActionCenterForHookEvent(event: {
  status?: string;
  eventType?: string;
}) {
  return (
    event.status === "waiting" ||
    event.status === "blocked" ||
    event.status === "need-input" ||
    event.status === "failed" ||
    event.eventType === "approval-required"
  );
}

async function reloadIfServerVersionIsNewerAfterReconnect() {
  if (versionReloadCheckInFlight) {
    return;
  }

  versionReloadCheckInFlight = true;

  try {
    const health = await fetchAppHealth();

    if (isServerVersionNewer(health.version, __TMUX_UI_CLIENT_VERSION__)) {
      window.location.reload();
    }
  } catch {
    // A reconnect should not break the current terminal if health is transient.
  } finally {
    versionReloadCheckInFlight = false;
  }
}

const appEventSocket = createAppEventSocket({
  onReconnect: () => {
    void reloadIfServerVersionIsNewerAfterReconnect();
  },
  onEvent: (event) => {
    if (event.type === "sessions-invalidated") {
      appEventRefreshScheduler.schedule();
      return;
    }

    if (event.type === "hook-event") {
      if (shouldOpenActionCenterForHookEvent(event)) {
        dismissedHookEventToastIds.delete(`hook:${event.id}`);
      }

      void store.refreshTimeline().then(() => scheduleRender());
    }
  }
});
const pageActivityController = createPageActivityController({
  document,
  polling: {
    start: () => store.startPolling(),
    stop: () => store.stopPolling()
  },
  events: {
    connect: () => appEventSocket.connect(),
    close: () => appEventSocket.close()
  },
  refresh: refreshCurrentViewState
});
let activeImageSessionName: string | null = null;
let isActionCenterOpen = false;
const dismissedHookEventToastIds = new Set<string>();
let imagePreviewScanToken = 0;
let visibleTerminalPanelId: string | null = null;
let lastDashboardActive = tabState.getActiveTabId() === null;

applyTheme(activeTheme);

const renderScheduler = createAnimationFrameScheduler(render);

function scheduleRender() {
  renderScheduler.schedule();
}

function setAppView(view: AppView, options: { projectName?: string | null } = {}) {
  appView = view;
  activeKanbanProjectName = view === "kanban" ? options.projectName ?? null : null;

  const nextUrl = buildViewUrl(window.location.href, {
    view,
    projectName: activeKanbanProjectName
  });
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.history.pushState({}, "", nextUrl);
  }
}

function openDashboardView() {
  tabState.setActiveTab(null);
  setAppView("kanban");
  scheduleRender();
}

function openKanbanView(projectName?: string | null) {
  tabState.setActiveTab(null);
  setAppView("kanban", { projectName });
  scheduleRender();
}

function scrollTargetKanbanProjectIntoView() {
  if (!activeKanbanProjectName) {
    return;
  }

  const target = [
    ...dashboardRoot.querySelectorAll<HTMLElement>(".kanban-project-card")
  ].find((card) => card.dataset.projectName === activeKanbanProjectName);
  target?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function syncAppViewFromUrl() {
  const requestedView = getRequestedAppView();

  if (requestedView === "kanban") {
    tabState.setActiveTab(null);
  }

  appView = getInitialAppView(requestedView, tabState.getActiveTabId());
  activeKanbanProjectName =
    requestedView === "kanban"
      ? new URLSearchParams(window.location.search).get("project")
      : null;
  scheduleRender();
}

window.addEventListener("popstate", syncAppViewFromUrl);

function setActionCenterOpen(open: boolean) {
  isActionCenterOpen = open;
  scheduleRender();
}

function createKanbanProject() {
  const name = kanbanDraft.name.trim();
  const path = "~";

  if (!name) {
    return;
  }

  void store
    .createKanbanProject({
      name,
      path,
      server: kanbanDraft.server.trim() || null,
      selectedAgentNames: kanbanDraft.selectedAgentNames
    })
    .then(() => {
      kanbanDraft = {
        name: "",
        path: "~",
        server: "",
        selectedAgentNames: getDefaultKanbanSelectedSessionNames()
      };
      scheduleRender();
    });
}

function createKanbanProjectFromSession(
  project: { name: string; path: string; server: string | null },
  sessionName: string
) {
  void store
    .createKanbanProject({
      ...project,
      selectedAgentNames: []
    })
    .then(() => store.addKanbanSession(project.name, sessionName))
    .then(() => {
      openKanbanView(project.name);
      scheduleRender();
    });
}

function moveKanbanSession(
  fromProjectName: string | null,
  toProjectName: string,
  sessionName: string
) {
  void store
    .moveKanbanSession(fromProjectName, toProjectName, sessionName)
    .then(() => {
      scheduleRender();
    });
}

function toggleActionCenter() {
  setActionCenterOpen(!isActionCenterOpen);
}

function getOrOpenTab(sessionName: string) {
  const existing = tabState
    .getTabs()
    .find((tab) => tab.sessionName === sessionName);

  if (existing) {
    activateTab(existing.id);
    scheduleRender();
    return existing;
  }

  const tab = tabState.openTab(sessionName);
  setAppView("terminal");
  scheduleRender();

  return tab;
}

function activateTab(tabId: string) {
  tabState.setActiveTab(tabId);
  setAppView("terminal");
}

function getTabForSession(sessionName: string) {
  return tabState
    .getTabs()
    .find((tab) => tab.sessionName === sessionName) ?? null;
}

function getPinnedSessionNames() {
  return new Set(sidebarFavorites.getPinnedSessionNames());
}

function getKanbanSessionNames() {
  return new Set(
    store.getState().kanbanProjects.flatMap((project) =>
      project.agents.map((agent) => getKanbanConfiguredSessionName(project.name, agent))
    )
    .filter(Boolean)
  );
}

function getKanbanConfiguredSessionName(
  projectName: string,
  agent: { name: string; sessionName?: string }
) {
  if (agent.sessionName) {
    return agent.sessionName;
  }

  const sessionName = getKanbanAgentSessionName(projectName, agent.name);

  if (sessionName.startsWith("-") || sessionName.endsWith("-")) {
    return "";
  }

  return sessionName;
}

function getLiveKanbanStatusProject(sessionName: string) {
  return resolveKanbanStatusProject(
    sessionName,
    store.getState().sessions,
    store.getState().kanbanProjects
  );
}

function getLiveKanbanStatusProjects() {
  return resolveKanbanStatusProjects(
    store.getState().sessions,
    store.getState().kanbanProjects
  );
}

function refreshKanbanStatusProjectsCache() {
  const state = store.getState();
  const signature = JSON.stringify({
    sessions: state.sessions.map((session) => session.name),
    kanbanProjects: state.kanbanProjects
  });

  if (signature === lastKanbanStatusProjectsCacheSignature) {
    return cachedKanbanStatusProjects;
  }

  lastKanbanStatusProjectsCacheSignature = signature;
  const projects = resolveKanbanStatusProjects(
    state.sessions,
    state.kanbanProjects
  );

  cachedKanbanStatusProjects = projects;
  hasResolvedKanbanStatusProjectsCache = true;
  kanbanStatusProjectsCache.write(projects);

  return projects;
}

function getDisplayKanbanStatusProjects() {
  if (hasResolvedKanbanStatusProjectsCache) {
    return cachedKanbanStatusProjects;
  }

  return refreshKanbanStatusProjectsCache();
}

function getDisplayKanbanStatusProject(sessionName: string) {
  return (
    getDisplayKanbanStatusProjects().find((project) =>
      project.sessions.some((session) => session.name === sessionName)
    ) ?? null
  );
}

function getAvailableKanbanSessionNames() {
  const kanbanSessionNames = getKanbanSessionNames();

  return store
    .getState()
    .sessions.map((session) => session.name)
    .filter((sessionName) => !kanbanSessionNames.has(sessionName));
}

function togglePinnedSession(sessionName: string) {
  void sidebarFavorites.togglePinned(sessionName).then(() => scheduleRender());
  scheduleRender();
}

function toggleMutedSession(sessionName: string) {
  mutedSessions.toggleMuted(sessionName);
  void store
    .refresh({
      includePreview: false,
      includePanes: true,
      includeServerStatus: false,
      preferActiveSessionStatus: false
    })
    .then(() => scheduleRender());
}

function closeTab(tabId: string, options: { force?: boolean } = {}) {
  clearInputPromptForTab(tabId);
  inactiveTerminalPruner.cancel(tabId);
  mountedTerminals.get(tabId)?.destroy();
  mountedTerminals.get(tabId)?.panel.remove();
  mountedTerminals.delete(tabId);

  if (options.force) {
    tabState.forceCloseTab(tabId);
  } else {
    tabState.closeTab(tabId);
  }

  scheduleRender();
}

function detachTerminal(tabId: string) {
  const mounted = mountedTerminals.get(tabId);
  const outputTimer = activeOutputTimers.get(tabId);

  if (outputTimer) {
    clearTimeout(outputTimer);
    activeOutputTimers.delete(tabId);
  }

  busyTerminalTabIds.delete(tabId);
  pendingTerminalMounts.delete(tabId);

  if (!mounted) {
    return;
  }

  mounted.destroy();
  mounted.panel.remove();
  mountedTerminals.delete(tabId);

  if (visibleTerminalPanelId === tabId) {
    visibleTerminalPanelId = null;
  }
}

function clearInputPromptForTab(tabId: string) {
  terminalPromptSignatures.delete(tabId);
  inputPrompts.clearTabPrompt(tabId);
}

function rememberTerminalOutput(tabId: string, visibleText: string) {
  const prompt = detectTerminalInputPrompt(visibleText);

  if (!prompt) {
    return;
  }

  const tab = tabState.getTabs().find((item) => item.id === tabId);

  if (!tab) {
    return;
  }

  const signature = `${tab.sessionName}:${prompt.snippet}:${prompt.actions
    .map((action) => action.label)
    .join(",")}`;

  if (terminalPromptSignatures.get(tabId) === signature) {
    return;
  }

  terminalPromptSignatures.set(tabId, signature);
  inputPrompts.setPrompt({
    tabId,
    sessionName: tab.sessionName,
    prompt
  });
  scheduleRender();
}

function rememberSessionInputPrompt(sessionName: string, prompt: TerminalInputPrompt | null) {
  const tab = getTabForSession(sessionName);
  const signatureKey = tab?.id ?? `session:${sessionName}`;

  if (!prompt) {
    terminalPromptSignatures.delete(signatureKey);
    inputPrompts.setPrompt({
      tabId: tab?.id ?? null,
      sessionName,
      prompt: null
    });
    return;
  }

  const signature = `${sessionName}:${prompt.snippet}:${prompt.actions
    .map((action) => action.label)
    .join(",")}`;

  if (terminalPromptSignatures.get(signatureKey) === signature) {
    return;
  }

  terminalPromptSignatures.set(signatureKey, signature);
  inputPrompts.setPrompt({
    tabId: tab?.id ?? null,
    sessionName,
    prompt
  });
}

function rememberSessionInputPrompts() {
  store.getState().sessions.forEach((session) => {
    rememberSessionInputPrompt(session.name, session.inputPrompt ?? null);
  });
}

function handleTerminalOutput(tabId: string, _data: string, visibleText: string) {
  if (!isPageVisible()) {
    return;
  }

  rememberTerminalOutput(tabId, visibleText);
  busyTerminalTabIds.add(tabId);
  const existingTimer = activeOutputTimers.get(tabId);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  activeOutputTimers.set(
    tabId,
    setTimeout(() => {
      activeOutputTimers.delete(tabId);
      busyTerminalTabIds.delete(tabId);

      if (!isPageVisible() || tabState.getActiveTabId() !== tabId) {
        return;
      }

      refreshCurrentViewState();
    }, 1500)
  );
}

function ensureTerminal(tab: BrowserTab) {
  if (mountedTerminals.has(tab.id) || pendingTerminalMounts.has(tab.id)) {
    return;
  }

  pendingTerminalMounts.add(tab.id);
  const panel = document.createElement("div");
  panel.className = "terminal-panel";
  const frame = document.createElement("div");
  frame.className = "terminal-frame";
  panel.append(frame);
  panelsRoot.append(panel);

  const loadingTerminal: MountedTerminal = {
    destroy: () => {
      pendingTerminalMounts.delete(tab.id);
    },
    sendInput: () => {},
    getVisibleText: () => "",
    clear: () => {},
    redraw: () => {},
    reconnect: () => {},
    focus: () => {},
    chooseImage: () => {},
    captureImage: () => {},
    scrollPage: () => {},
    toggleBrowserScroll: () => false,
    isBrowserScrollEnabled: () => false,
    setTheme: () => {},
    setFontSize: () => {},
    setFontFamily: () => {},
    setLineHeight: () => {},
    panel,
    statusBar: panel
  };
  mountedTerminals.set(tab.id, loadingTerminal);
  renderSessionStatusBar(
    panel,
    store.getState().sessions.find((session) => session.name === tab.sessionName),
    createSessionStatusActions(tab, loadingTerminal)
  );
  renderSessionTopRail(panel, tab);
  renderSessionMenu(panel, tab, loadingTerminal);
  panel.style.background = getTheme(
    sessionSettings.get(tab.sessionName).themeId
  ).terminalTheme.background;

  void import("./terminal/createTerminalTab").then(({ createTerminalTab }) => {
    if (!pendingTerminalMounts.has(tab.id)) {
      return;
    }

    const settings = sessionSettings.get(tab.sessionName);
    const mounted = createTerminalTab({
      container: frame,
      rendererStatusElement: panel,
      tabId: tab.id,
      sessionName: tab.sessionName,
      fontSize: settings.fontSize,
      fontFamily: settings.fontFamily,
      lineHeight: settings.lineHeight,
      terminalTheme: getTheme(settings.themeId).terminalTheme,
      onOutput: (data, visibleText) => handleTerminalOutput(tab.id, data, visibleText),
      onPaneClick: (event) => selectPaneAtTerminalPoint(tab.sessionName, event),
      getPaneSummaries: () =>
        store.getState().sessions.find((session) => session.name === tab.sessionName)?.panes ?? [],
      onClosed: () => {
        closeTab(tab.id, { force: true });
        refreshCurrentViewState();
      }
    });
    const mountedTerminal: MountedTerminal = {
      ...(mounted satisfies MountedTerminalCore),
      panel,
      statusBar: panel
    };

    pendingTerminalMounts.delete(tab.id);
    mountedTerminals.set(tab.id, mountedTerminal);

    if (tabState.getActiveTabId() === tab.id) {
      panel.classList.add("is-active");
      mountedTerminal.redraw();
    }

    renderSessionStatusBar(
      panel,
      store
        .getState()
        .sessions.find((session) => session.name === tab.sessionName),
      createSessionStatusActions(tab, mountedTerminal)
    );
    renderSessionTopRail(panel, tab);
    renderSessionMenu(panel, tab, mountedTerminal);
  });
}

function renderSessionTopRail(panel: HTMLElement, tab: BrowserTab) {
  renderSessionGroupRail(
    panel,
    tab.sessionName,
    getDisplayKanbanStatusProject(tab.sessionName),
    {
      uiTier: getResponsiveUiTier(window.innerWidth),
      onOpenSession: (sessionName) => {
        getOrOpenTab(sessionName);
        scheduleRender();
      },
      onOpenGroupTask: () => openGroupMessagePanel(tab.sessionName)
    }
  );
}

function renderSessionMenu(
  panel: HTMLElement,
  tab: BrowserTab,
  mountedTerminal: MountedTerminal
) {
  const dashboardState = store.getState();
  renderSessionFloatingMenu(panel, {
    currentSessionName: tab.sessionName,
    sessions: getSessionNames(),
    sessionSummaries: dashboardState.sessions,
    homeDirectory: dashboardState.serverStatus?.homeDirectory ?? null,
    kanbanProject: getDisplayKanbanStatusProject(tab.sessionName),
    boards: getDisplayKanbanStatusProjects(),
    actionCount: currentActionCount,
    actionCenterOpen: isActionCenterOpen,
    onOpenDashboard: openDashboardView,
    onOpenKanban: () => openKanbanView(),
    onOpenKanbanProject: (projectName) => openKanbanView(projectName),
    onOpenSession: (sessionName) => {
      getOrOpenTab(sessionName);
      scheduleRender();
    },
    onConfig: () => {
      activeConfigSessionName = tab.sessionName;
      scheduleRender();
    },
    onRename: () => promptRenameSession(tab.sessionName),
    onSendCommand: () => openSendCommandPanel(tab.sessionName),
    onOpenGroupTask: () => openGroupMessagePanel(tab.sessionName),
    onOpenGroupMessages: () => openGroupMessagePanel(tab.sessionName),
    onReconnect: () => mountedTerminal.reconnect(),
    onPreviewImage: () => openImagePreviewPanel(tab.sessionName),
    onChooseImage: () => mountedTerminal.chooseImage(),
    onCaptureImage: () => mountedTerminal.captureImage(),
    onKill: () => killSession(tab.sessionName, { confirm: true }),
    onKillSession: (sessionName) => killSession(sessionName, { confirm: true }),
    onSendSoftKey: (sequence) => mountedTerminal.sendInput(sequence),
    onToggleActionCenter: toggleActionCenter,
    onRefresh: () => {
      void store
        .syncSessionAndKanbanState()
        .then(() => scheduleRender());
    },
    kanbanDraft,
    onKanbanDraftChange: (draft, options) => {
      kanbanDraft = draft;
      if (options?.render !== false) {
        scheduleRender();
      }
    },
    onCreateKanbanProject: createKanbanProject,
    onCreateKanbanProjectFromSession: createKanbanProjectFromSession,
    onAddKanbanSession: (projectName, sessionName) => {
      void store.addKanbanSession(projectName, sessionName).then(() => {
        scheduleRender();
      });
    },
    onMoveKanbanSession: moveKanbanSession,
    onCreateSession: (sessionName) => {
      void store.createSession(sessionName).then(() => {
        draftSessionName = "";
        getOrOpenTab(sessionName);
        scheduleRender();
      });
    }
  });
}

function syncTerminalStatusBars() {
  const sessionsByName = new Map(
    store.getState().sessions.map((session) => [session.name, session])
  );

  tabState.getTabs().forEach((tab) => {
    const mounted = mountedTerminals.get(tab.id);

    if (!mounted) {
      return;
    }

    renderSessionStatusBar(
      mounted.panel,
      sessionsByName.get(tab.sessionName),
      createSessionStatusActions(tab, mounted)
    );
    renderSessionTopRail(mounted.panel, tab);
    renderSessionMenu(mounted.panel, tab, mounted);
  });
}

function syncPanels() {
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const validIds = new Set(tabs.map((tab) => tab.id));

  [...mountedTerminals.keys()].forEach((tabId) => {
    if (!validIds.has(tabId)) {
      inactiveTerminalPruner.cancel(tabId);
      detachTerminal(tabId);
    }
  });

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const nextVisiblePanelId = activeTab?.id ?? null;

  if (activeTab) {
    ensureTerminal(activeTab);
  }

  visibleTerminalPanelId = syncTerminalPanelVisibility(
    mountedTerminals,
    visibleTerminalPanelId,
    nextVisiblePanelId
  );
  inactiveTerminalPruner.sync(
    activeTabId,
    [...mountedTerminals.keys()],
    detachTerminal
  );
  syncTerminalStatusBars();
}

function setActiveTheme(themeId: string) {
  activeTheme = getTheme(themeId);
  applyTheme(activeTheme);
  saveThemeId(activeTheme.id);

  scheduleRender();
}

function setSessionFontSize(sessionName: string, fontSize: number) {
  const nextSettings = sessionSettings.setFontSize(sessionName, fontSize);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      mountedTerminals.get(tab.id)?.setFontSize(nextSettings.fontSize);
    });

  scheduleRender();
}

function setSessionFontFamily(sessionName: string, fontFamily: string) {
  const nextSettings = sessionSettings.setFontFamily(sessionName, fontFamily);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      mountedTerminals.get(tab.id)?.setFontFamily(nextSettings.fontFamily);
    });

  scheduleRender();
}

function setSessionLineHeight(sessionName: string, lineHeight: number) {
  const nextSettings = sessionSettings.setLineHeight(sessionName, lineHeight);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      mountedTerminals.get(tab.id)?.setLineHeight(nextSettings.lineHeight);
    });

  scheduleRender();
}

function setSessionTheme(sessionName: string, themeId: string) {
  const nextSettings = sessionSettings.setThemeId(sessionName, themeId);
  const theme = getTheme(nextSettings.themeId);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      const mounted = mountedTerminals.get(tab.id);
      mounted?.setTheme(theme.terminalTheme);

      if (mounted) {
        mounted.panel.style.background = theme.terminalTheme.background;
      }
    });

  scheduleRender();
}

async function renameSession(fromName: string, toName: string) {
  tabState.renameSession(fromName, toName);
  sessionSettings.renameSession(fromName, toName);
  mutedSessions.renameSession(fromName, toName);

  if (activeConfigSessionName === fromName) {
    activeConfigSessionName = toName;
  }

  await store.renameSession(fromName, toName);
  scheduleRender();
}

function promptRenameSession(sessionName: string) {
  const nextName = window.prompt("Rename session", sessionName)?.trim();

  if (!nextName || nextName === sessionName) {
    return;
  }

  void renameSession(sessionName, nextName);
}

function closeTabsForSession(sessionName: string) {
  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => closeTab(tab.id, { force: true }));
}

function killSession(sessionName: string, options: { confirm?: boolean } = {}) {
  if (options.confirm) {
    const confirmed = window.confirm(`Kill tmux session "${sessionName}"?`);

    if (!confirmed) {
      return;
    }
  }

  if (activeConfigSessionName === sessionName) {
    activeConfigSessionName = null;
  }

  closeTabsForSession(sessionName);
  void store.killSession(sessionName).then(() => {
    scheduleRender();
  });
}

function getSessionNames() {
  return store.getState().sessions.map((session) => session.name);
}

function switchToSession(sessionName: string) {
  getOrOpenTab(sessionName);
  activeSwitchSessionName = null;
  scheduleRender();
}

function openSwitchSessionPanel(currentSessionName: string) {
  activeSwitchSessionName = currentSessionName;
  scheduleRender();
}

function closeSwitchSessionPanel() {
  activeSwitchSessionName = null;
  scheduleRender();
}

function getSessionCurrentPath(sessionName: string) {
  return (
    store
      .getState()
      .sessions.find((session) => session.name === sessionName)?.currentPath ?? ""
  );
}

function getImagePreviewUrl(imagePath: string, basePath: string) {
  const params = new URLSearchParams({ path: imagePath });

  if (basePath) {
    params.set("basePath", basePath);
  }

  return `/api/image-preview?${params.toString()}`;
}

function getImagePreviewInfoUrl(imagePath: string, basePath: string) {
  const params = new URLSearchParams({ path: imagePath });

  if (basePath) {
    params.set("basePath", basePath);
  }

  return `/api/image-preview-info?${params.toString()}`;
}

function openImagePreviewPanel(sessionName: string) {
  applyImagePreviewOpenFocus(getResponsiveUiTier(window.innerWidth));
  activeImageSessionName = sessionName;
  scheduleRender();
}

function closeImagePreviewPanel() {
  activeImageSessionName = null;
  imagePreviewScanToken += 1;
  scheduleRender();
}

async function verifyImagePath(imagePath: string, basePath: string) {
  try {
    const response = await fetch(getImagePreviewInfoUrl(imagePath, basePath));

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as {
      ok: true;
      path: string;
      contentType: string;
      size: number;
    };
  } catch {
    return null;
  }
}

function formatImageSize(size: number) {
  if (size < 1024) {
    return `${size}B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function resetPreviewImage(
  panel: HTMLElement,
  image: HTMLImageElement,
  error: HTMLElement
) {
  panel.classList.add("is-compact");
  panel.classList.remove("has-image");
  image.removeAttribute("src");
  image.alt = "";
  error.hidden = true;
}

function setPreviewImage(
  panel: HTMLElement,
  image: HTMLImageElement,
  error: HTMLElement,
  sessionName: string,
  imagePath: string
) {
  const basePath = getSessionCurrentPath(sessionName);
  const imageUrl = getImagePreviewUrl(imagePath, basePath);

  panel.classList.remove("is-compact");
  panel.classList.add("has-image");
  error.hidden = true;
  image.src = imageUrl;
  image.alt = imagePath;
}

async function loadPreviewImage(
  panel: HTMLElement,
  image: HTMLImageElement,
  error: HTMLElement,
  status: HTMLElement,
  input: HTMLInputElement,
  sessionName: string,
  imagePath: string
) {
  const basePath = getSessionCurrentPath(sessionName);
  status.hidden = false;
  status.textContent = "Checking image";

  const info = await verifyImagePath(imagePath, basePath);

  if (!info) {
    resetPreviewImage(panel, image, error);
    status.textContent = "Image not found or not allowed";
    return null;
  }

  input.value = info.path;
  status.hidden = true;
  setPreviewImage(panel, image, error, sessionName, info.path);

  return info;
}

function renderImagePreviewPanel() {
  panelsRoot.querySelector(".image-preview-backdrop")?.remove();

  if (!activeImageSessionName) {
    return;
  }

  const tab = tabState
    .getTabs()
    .find((item) => item.sessionName === activeImageSessionName);
  const mounted = tab ? mountedTerminals.get(tab.id) : null;

  if (!tab || !mounted) {
    activeImageSessionName = null;
    return;
  }

  const detectedPaths = getVisibleImagePaths(mounted.getVisibleText());
  const defaultPath = detectedPaths[0] ?? "";

  const backdrop = document.createElement("div");
  backdrop.className = "image-preview-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeImagePreviewPanel();
    }
  });

  const panel = document.createElement("section");
  panel.className = "image-preview-panel is-compact";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Image preview");

  const header = document.createElement("div");
  header.className = "image-preview-header";

  const form = document.createElement("form");
  form.className = "image-preview-form";

  const input = document.createElement("input");
  input.name = "image-path";
  input.value = defaultPath;
  input.placeholder = "image path";

  const viewButton = document.createElement("button");
  viewButton.type = "submit";
  viewButton.textContent = "View";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeImagePreviewPanel);

  form.append(input, viewButton);

  const uploadRoot = document.createElement("div");
  uploadRoot.className = "image-preview-upload";

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "image-preview-upload-button";
  uploadLabel.textContent = "Upload image";

  const fileInput = document.createElement("input");
  fileInput.className = "image-preview-file-input";
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.setAttribute("aria-label", "Upload image from this device");
  uploadLabel.append(fileInput);

  const uploadStatus = document.createElement("span");
  uploadStatus.className = "image-preview-upload-status";
  uploadStatus.textContent = "Paste, drag, or choose an image";
  uploadRoot.append(uploadLabel, uploadStatus);

  const actions = document.createElement("div");
  actions.className = "image-preview-actions";
  actions.append(closeButton);
  header.append(form, actions);

  const candidateList = document.createElement("div");
  candidateList.className = "image-preview-candidates";
  candidateList.setAttribute("aria-label", "Detected image paths");

  const scanToken = (imagePreviewScanToken += 1);
  const basePath = getSessionCurrentPath(tab.sessionName);
  let autoPreviewed = false;

  const loading = document.createElement("span");
  loading.textContent = detectedPaths.length > 0
    ? `Checking ${detectedPaths.length} image path${detectedPaths.length === 1 ? "" : "s"}`
    : "No image paths in visible terminal output";
  candidateList.append(loading);

  const manualStatus = document.createElement("span");
  manualStatus.className = "image-preview-status";
  manualStatus.hidden = true;
  candidateList.append(manualStatus);

  detectedPaths.forEach((imagePath) => {
    void verifyImagePath(imagePath, basePath).then((info) => {
      if (scanToken !== imagePreviewScanToken || !info) {
        return;
      }

      if (loading.isConnected) {
        loading.remove();
      }

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${info.path} · ${formatImageSize(info.size)}`;
      button.title = info.path;
      button.addEventListener("click", () => {
        input.value = info.path;
        setPreviewImage(panel, image, error, tab.sessionName, info.path);
      });
      candidateList.append(button);

      if (!autoPreviewed) {
        autoPreviewed = true;
        input.value = info.path;
        setPreviewImage(panel, image, error, tab.sessionName, info.path);
      }
    });
  });

  if (detectedPaths.length > 0) {
    queueMicrotask(() => {
      window.setTimeout(() => {
        if (
          scanToken === imagePreviewScanToken &&
          candidateList.querySelectorAll("button").length === 0
        ) {
          loading.textContent = `Found 0 real image files from ${detectedPaths.length} candidate${detectedPaths.length === 1 ? "" : "s"}`;
        }
      }, 800);
    });
  }
  const body = document.createElement("div");
  body.className = "image-preview-body";

  const error = document.createElement("div");
  error.className = "image-preview-error";
  error.textContent = "Image failed to load";
  error.hidden = true;

  const image = document.createElement("img");
  image.className = "image-preview-image";
  image.addEventListener("error", () => {
    error.hidden = false;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const imagePath = input.value.trim();

    if (imagePath) {
      void loadPreviewImage(
        panel,
        image,
        error,
        manualStatus,
        input,
        tab.sessionName,
        imagePath
      );
    }
  });

  fileInput.addEventListener("change", () => {
    const file = getImageFileFromFiles(fileInput.files ?? undefined);

    if (!file) {
      uploadStatus.textContent = "No image selected";
      return;
    }

    uploadStatus.textContent = "Uploading image";
    void uploadImageForSession(tab.sessionName, file)
      .then((upload) => {
        input.value = upload.absolutePath;
        uploadStatus.textContent = `Inserted ${formatImageSize(upload.size)}`;
        void loadPreviewImage(
          panel,
          image,
          error,
          manualStatus,
          input,
          tab.sessionName,
          upload.absolutePath
        );
      })
      .catch((reason) => {
        uploadStatus.textContent =
          reason instanceof Error ? reason.message : "Upload failed";
      })
      .finally(() => {
        fileInput.value = "";
      });
  });

  body.append(image, error);
  panel.append(header, uploadRoot, candidateList, body);
  backdrop.append(panel);
  mounted.panel.append(backdrop);

  focusImagePreviewPathInput(input, getResponsiveUiTier(window.innerWidth));
}

function openSendCommandPanel(currentSessionName: string) {
  const sessionNames = getSessionNames();

  activeSendSessionName = currentSessionName;
  draftSendTargetName =
    sessionNames.find((name) => name !== currentSessionName) ?? currentSessionName;
  draftSendCommand = "";
  scheduleRender();
}

function closeSendCommandPanel() {
  activeSendSessionName = null;
  draftSendTargetName = "";
  draftSendCommand = "";
  scheduleRender();
}

function openGroupMessagePanel(sessionName: string) {
  const project = getLiveKanbanStatusProject(sessionName);

  if (!project) {
    return;
  }

  activeGroupMessagePanel = {
    projectName: project.name,
    sessionName,
    messages: [],
    loading: true,
    error: null
  };
  scheduleRender();
  void refreshGroupMessages(project.name);
}

function closeGroupMessagePanel() {
  activeGroupMessagePanel = null;
  scheduleRender();
}

async function refreshGroupMessages(projectName: string) {
  if (!activeGroupMessagePanel || activeGroupMessagePanel.projectName !== projectName) {
    return;
  }

  activeGroupMessagePanel = {
    ...activeGroupMessagePanel,
    loading: true,
    error: null
  };
  scheduleRender();

  try {
    const messages = await api.listGroupMessages(projectName);

    if (activeGroupMessagePanel?.projectName === projectName) {
      activeGroupMessagePanel = {
        ...activeGroupMessagePanel,
        messages,
        loading: false,
        error: null
      };
      scheduleRender();
    }
  } catch (error) {
    if (activeGroupMessagePanel?.projectName === projectName) {
      activeGroupMessagePanel = {
        ...activeGroupMessagePanel,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load messages"
      };
      scheduleRender();
    }
  }
}

function sendGroupMessage(
  projectName: string,
  request: Parameters<typeof api.sendGroupMessage>[1]
) {
  void api
    .sendGroupMessage(projectName, request)
    .then(() => refreshGroupMessages(projectName))
    .catch((error) => {
      if (activeGroupMessagePanel?.projectName === projectName) {
        activeGroupMessagePanel = {
          ...activeGroupMessagePanel,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to send message"
        };
        scheduleRender();
      }
    });
}

function scanGroupMessage(projectName: string, messageId: string) {
  void api
    .scanGroupMessage(projectName, messageId)
    .then(() => refreshGroupMessages(projectName))
    .catch((error) => {
      if (activeGroupMessagePanel?.projectName === projectName) {
        activeGroupMessagePanel = {
          ...activeGroupMessagePanel,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to scan replies"
        };
        scheduleRender();
      }
    });
}

function renderSendCommandPanel() {
  panelsRoot.querySelector(".send-command-backdrop")?.remove();

  if (!activeSendSessionName) {
    return;
  }

  const sessionNames = getSessionNames();

  if (!sessionNames.includes(draftSendTargetName)) {
    draftSendTargetName =
      sessionNames.find((name) => name !== activeSendSessionName) ??
      activeSendSessionName;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "send-command-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeSendCommandPanel();
    }
  });

  const panel = document.createElement("section");
  panel.className = "send-command-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "send-command-header";

  const title = document.createElement("h2");
  title.textContent = "Send command";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeSendCommandPanel);

  header.append(title, closeButton);

  const targetList = document.createElement("div");
  targetList.className = "send-command-targets";
  targetList.setAttribute("aria-label", "Target session");

  sessionNames.forEach((sessionName) => {
    const targetButton = document.createElement("button");
    targetButton.type = "button";
    targetButton.textContent = sessionName;
    targetButton.className =
      sessionName === draftSendTargetName ? "is-selected" : "";
    targetButton.addEventListener("click", () => {
      draftSendTargetName = sessionName;
      scheduleRender();
    });
    targetList.append(targetButton);
  });

  const form = document.createElement("form");
  form.className = "send-command-form";

  const input = document.createElement("input");
  input.name = "send-command";
  input.placeholder = "command";
  input.value = draftSendCommand;
  input.addEventListener("input", () => {
    draftSendCommand = input.value;
  });

  const sendButton = document.createElement("button");
  sendButton.type = "submit";
  sendButton.textContent = "Send";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = draftSendCommand.trim();

    if (!draftSendTargetName || !command) {
      return;
    }

    void store.sendCommand(draftSendTargetName, command);
    closeSendCommandPanel();
  });

  form.append(input, sendButton);
  panel.append(header, targetList, form);
  backdrop.append(panel);
  panelsRoot.append(backdrop);
  input.focus();
}

function renderGroupMessageOverlay() {
  panelsRoot.querySelector(".group-message-backdrop")?.remove();

  if (!activeGroupMessagePanel) {
    return;
  }

  const project = getLiveKanbanStatusProjects().find(
    (candidate) => candidate.name === activeGroupMessagePanel?.projectName
  ) ?? getLiveKanbanStatusProject(activeGroupMessagePanel.sessionName);

  if (!project) {
    closeGroupMessagePanel();
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "send-command-backdrop group-message-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeGroupMessagePanel();
    }
  });

  const host = document.createElement("div");
  host.className = "group-message-host";

  if (activeGroupMessagePanel.loading || activeGroupMessagePanel.error) {
    const status = document.createElement("div");
    status.className = "group-message-panel-status";
    status.textContent = activeGroupMessagePanel.error
      ?? "Loading group messages...";
    host.append(status);
  }

  renderGroupMessagePanel(host, {
    project,
    currentSessionName: activeGroupMessagePanel.sessionName,
    messages: activeGroupMessagePanel.messages,
    onSubmit: (request) => sendGroupMessage(project.name, request),
    onScan: (messageId) => scanGroupMessage(project.name, messageId),
    onClose: closeGroupMessagePanel
  });

  backdrop.append(host);
  panelsRoot.append(backdrop);
}

function renderSwitchSessionPanel() {
  panelsRoot.querySelector(".switch-session-backdrop")?.remove();

  if (!activeSwitchSessionName) {
    return;
  }

  const sessions = store.getState().sessions;
  const backdrop = document.createElement("div");
  backdrop.className = "send-command-backdrop switch-session-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeSwitchSessionPanel();
    }
  });

  const panel = document.createElement("section");
  panel.className = "send-command-panel switch-session-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Switch session");

  const header = document.createElement("div");
  header.className = "send-command-header";

  const title = document.createElement("h2");
  title.textContent = "Switch session";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeSwitchSessionPanel);

  header.append(title, closeButton);

  const sessionList = document.createElement("div");
  sessionList.className = "send-command-targets switch-session-targets";
  sessionList.setAttribute("aria-label", "Sessions");

  sessions.forEach((session) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      session.name === activeSwitchSessionName ? "is-selected" : "";
    button.textContent = session.name;
    button.title = [
      session.name,
      session.currentPath,
      session.currentCommand
    ].filter(Boolean).join(" · ");
    button.addEventListener("click", () => switchToSession(session.name));
    sessionList.append(button);
  });

  panel.append(header, sessionList);
  backdrop.append(panel);
  panelsRoot.append(backdrop);
  sessionList.querySelector<HTMLButtonElement>("button")?.focus();
}

function closeInputPrompt(key: string) {
  inputPrompts.clearPrompt(key);
  scheduleRender();
}

async function sendInputPromptAction(key: string, input: string) {
  const prompt = inputPrompts.getPrompt(key);

  if (!prompt) {
    return;
  }

  const tab = tabState
    .getTabs()
    .find((item) =>
      prompt.tabId
        ? item.id === prompt.tabId
        : item.sessionName === prompt.sessionName
    ) ?? getOrOpenTab(prompt.sessionName);

  activateTab(tab.id);
  ensureTerminal(tab);
  scheduleRender();

  try {
    await api.sendInput(prompt.sessionName, input);
    closeInputPrompt(key);
    void store
      .refresh({
        includePreview: false,
        includePanes: true,
        includeServerStatus: false
      })
      .then(() => scheduleRender());
  } catch (error) {
    console.warn("Failed to send prompt input", error);
  }
}

function openInputPromptTab(key: string) {
  const prompt = inputPrompts.getPrompt(key);

  if (!prompt) {
    return;
  }

  const tab =
    prompt.tabId
      ? tabState.getTabs().find((item) => item.id === prompt.tabId)
      : getOrOpenTab(prompt.sessionName);

  if (tab) {
    activateTab(tab.id);
  }

  scheduleRender();
}

function getHookEventToastItem(id: string) {
  return deriveActionCenterItems({
    prompts: inputPrompts.getPrompts(),
    sessions: store.getState().sessions,
    timelineEvents: store.getState().timelineEvents
  }).find(
    (item): item is ActionCenterHookEventItem =>
      item.type === "hook-event" && item.id === id
  );
}

function dismissHookEventToast(id: string) {
  dismissedHookEventToastIds.add(id);
  scheduleRender();
}

function openHookEventSession(id: string) {
  const item = getHookEventToastItem(id);

  if (!item || !item.sessionName) {
    return;
  }

  dismissHookEventToast(id);
  openActionCenterSession(item.sessionName);
}

function openHookEventActions(id: string) {
  dismissedHookEventToastIds.add(id);
  setActionCenterOpen(true);
}

async function sendHookEventEnter(id: string) {
  const item = getHookEventToastItem(id);

  if (!item || !item.sessionName) {
    return;
  }

  try {
    await api.sendInput(item.sessionName, "\r");
    dismissHookEventToast(id);
  } catch (error) {
    console.warn("Failed to send hook event Enter", error);
  }
}

function openActionCenterSession(sessionName: string) {
  getOrOpenTab(sessionName);
  scheduleRender();
}

function splitPane(sessionName: string, direction: "horizontal" | "vertical") {
  void store.splitPane(sessionName, direction).then(() => {
    scheduleRender();
  });
}

function selectPaneAtTerminalPoint(
  sessionName: string,
  event: {
    clientX: number;
    clientY: number;
    rect: Pick<DOMRect, "left" | "top" | "width" | "height">;
    cols: number;
    rows: number;
  }
) {
  const session = store
    .getState()
    .sessions.find((candidate) => candidate.name === sessionName);
  const paneId = findPaneAtTerminalPoint({
    panes: session?.panes ?? [],
    clientX: event.clientX,
    clientY: event.clientY,
    rect: event.rect,
    cols: event.cols,
    rows: event.rows
  });

  if (!paneId) {
    return;
  }

  void store.selectPane(sessionName, paneId).then(() => {
    scheduleRender();
  });
}

function openSessionPane(sessionName: string, paneId: string) {
  void store.selectPane(sessionName, paneId).then(() => {
    getOrOpenTab(sessionName);
    scheduleRender();
  });
}

function refreshDashboard(options: { includeServerStatus?: boolean } = {}) {
  const isKanbanView = appView === "kanban";
  const refreshPromise = isKanbanView
    ? store.refreshSessionList()
    : store.refresh({
        includePreview: true,
        includePanes: true,
        includeServerStatus: options.includeServerStatus ?? false
      });

  void refreshPromise.then(() => {
    scheduleRender();
  });
}

function createSessionStatusActions(tab: BrowserTab, mounted: MountedTerminal) {
  return {
    onRestoreFocus: () => mounted.focus(),
    onRefresh: () => {
      refreshCurrentViewState();
    },
    onClear: () => {
      mounted.clear();
    },
    onRedraw: () => {
      mounted.redraw();
    },
    onReconnect: () => {
      mounted.reconnect();
    },
    onScrollHistoryBack: () => {
      mounted.scrollPage("back");
    },
    onScrollHistoryForward: () => {
      mounted.scrollPage("forward");
    },
    onSendSoftKey: (sequence: string) => {
      mounted.sendInput(sequence);
    },
    onToggleBrowserScroll: () => {
      mounted.toggleBrowserScroll();
      syncTerminalStatusBars();
    },
    browserScrollEnabled: mounted.isBrowserScrollEnabled(),
    onConfig: () => {
      activeConfigSessionName = tab.sessionName;
      scheduleRender();
    },
    onRename: () => promptRenameSession(tab.sessionName),
    onSendCommand: () => openSendCommandPanel(tab.sessionName),
    onSwitchSession: () => openSwitchSessionPanel(tab.sessionName),
    onPreviewImage: () => openImagePreviewPanel(tab.sessionName),
    onChooseImage: () => mounted.chooseImage(),
    onCaptureImage: () => mounted.captureImage(),
    onSplitHorizontal: () => splitPane(tab.sessionName, "horizontal"),
    onSplitVertical: () => splitPane(tab.sessionName, "vertical"),
    onKill: () => killSession(tab.sessionName, { confirm: true }),
    onKillSession: (sessionName) => killSession(sessionName, { confirm: true }),
    uiTier: getResponsiveUiTier(window.innerWidth),
    kanbanProject: getDisplayKanbanStatusProject(tab.sessionName),
    kanbanProjects: getDisplayKanbanStatusProjects(),
    onOpenKanbanProject: (projectName: string) => openKanbanView(projectName),
    onMoveKanbanSession: moveKanbanSession,
    onOpenKanban: () => openKanbanView()
  };
}

function render() {
  rememberSessionInputPrompts();
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const uiTier = getResponsiveUiTier(window.innerWidth);
  if (shouldPromoteActiveTabToTerminal(appView, activeTabId, requestedAppView)) {
    setAppView("terminal");
  }
  const isDashboardActive = activeTabId === null;
  const actionCenterItems = deriveActionCenterItems({
    prompts: inputPrompts.getPrompts(),
    sessions: store.getState().sessions,
    timelineEvents: store.getState().timelineEvents
  });
  const hookEventToastItems = actionCenterItems.filter(
    (item): item is ActionCenterHookEventItem =>
      item.type === "hook-event" && !dismissedHookEventToastIds.has(item.id)
  );
  currentActionCount = actionCenterItems.length;
  const appShell = appRoot.querySelector(".app-shell");
  if (appShell instanceof HTMLElement) {
    appShell.dataset.uiTier = uiTier;
  }
  appShell?.classList.toggle("app-shell--kanban-view", appView === "kanban");

  if (isDashboardActive !== lastDashboardActive) {
    lastDashboardActive = isDashboardActive;

    if (isDashboardActive) {
      refreshDashboard();
    }
  }

  if (activeTabId === null) {
    if (appView === "kanban") {
      renderKanban(dashboardRoot, {
        projects: store.getState().kanbanProjects,
        sessions: store.getState().sessions,
        targetProjectName: activeKanbanProjectName,
        draft: kanbanDraft,
        uiTier,
        availableSessions: getAvailableKanbanSessionNames(),
        loading: store.getState().loading,
        error: store.getState().error,
        onDraftChange: (draft, options) => {
          kanbanDraft = draft;
          if (options?.render !== false) {
            scheduleRender();
          }
        },
        onCreateProject: createKanbanProject,
        onOpenSession: (name) => {
          getOrOpenTab(name);
        },
        onRemoveSession: (projectName, agentName) => {
          void store
            .removeKanbanSession(projectName, agentName, { kill: false })
            .then(() => scheduleRender());
        },
        onKillSession: (projectName, agentName) => {
          void store
            .removeKanbanSession(projectName, agentName, { kill: true })
            .then(() => scheduleRender());
        },
        onAddSession: (projectName, sessionName) => {
          void store
            .addKanbanSession(projectName, sessionName)
            .then(() => scheduleRender());
        },
        onDeleteProject: (projectName) => {
          void store.deleteKanbanProject(projectName).then(() => scheduleRender());
        }
      });
      scrollTargetKanbanProjectIntoView();
    } else {
      renderDashboard(dashboardRoot, store.getState(), {
      onCreateSession: (name) => {
        void store.createSession(name).then(() => {
          getOrOpenTab(name);
          scheduleRender();
        });
      },
      onOpenSession: (name) => {
        getOrOpenTab(name);
        scheduleRender();
      },
      onOpenSessionPane: openSessionPane,
      onKillSession: (name) => {
        killSession(name);
      },
    onRenameSession: (fromName, toName) => {
      void renameSession(fromName, toName);
    },
    getSessionSettings: (name) => sessionSettings.get(name),
    onSessionFontSizeChange: setSessionFontSize,
      onSessionFontFamilyChange: setSessionFontFamily,
      onSessionLineHeightChange: setSessionLineHeight,
      onSessionThemeChange: setSessionTheme,
      activeConfigSessionName,
    onOpenSessionConfig: (name) => {
      activeConfigSessionName = name;
      scheduleRender();
    },
      onCloseSessionConfig: () => {
        activeConfigSessionName = null;
        scheduleRender();
      },
      draftSessionName,
    onDraftChange: (value) => {
      draftSessionName = value;
    },
    themes: THEMES,
      activeThemeId: activeTheme.id,
      onThemeChange: setActiveTheme,
      onRefreshDashboard: () => refreshDashboard({ includeServerStatus: true }),
      onMoveKanbanSession: moveKanbanSession,
      uiTier,
      browserTabs: tabs.map((tab) => ({
        sessionName: tab.sessionName,
        active: tab.id === activeTabId
      }))
      });
    }
  }

  appShell?.classList.remove("is-sidebar-collapsed", "is-mobile-sidebar-open");
  appRoot
    .querySelectorAll(
      [
        ".session-sidebar-root",
        ".session-sidebar",
        ".mobile-sidebar-launcher",
        ".terminal-status-action-group[data-group='kanban-sessions']",
        ".terminal-status-kanban-label",
        "[data-action='switch-kanban-session']"
      ].join(",")
    )
    .forEach((node) => node.remove());
  dashboardRoot.style.display = activeTabId === null ? "block" : "none";
  panelsRoot.style.display = activeTabId === null ? "none" : "block";
  syncPanels();
  panelsRoot.querySelector(".session-config-backdrop")?.remove();
  renderImagePreviewPanel();
  renderSendCommandPanel();
  renderGroupMessageOverlay();
  renderSwitchSessionPanel();
  renderActionCenterPanel(appRoot, {
    open: isActionCenterOpen,
    items: actionCenterItems,
    onClose: () => setActionCenterOpen(false),
    onOpenSession: openActionCenterSession,
    onDismissPrompt: closeInputPrompt,
    onSendPrompt: sendInputPromptAction
  });
  renderInputPromptToast(appRoot, inputPrompts.getPrompts(), {
    onDismiss: closeInputPrompt,
    onOpen: openInputPromptTab,
    onSend: sendInputPromptAction
  });
  renderHookEventToast(appRoot, hookEventToastItems, {
    onDismiss: dismissHookEventToast,
    onOpenSession: openHookEventSession,
    onOpenActions: openHookEventActions,
    onSendEnter: (id) => {
      void sendHookEventEnter(id);
    }
  });

  if (activeTabId !== null && activeConfigSessionName) {
    const activeSession = store
      .getState()
      .sessions.find((session) => session.name === activeConfigSessionName);

    if (activeSession) {
      panelsRoot.append(
        renderSessionConfigModal(activeSession.name, {
          getSessionSettings: (name) => sessionSettings.get(name),
          onSessionFontSizeChange: setSessionFontSize,
          onSessionFontFamilyChange: setSessionFontFamily,
          onSessionLineHeightChange: setSessionLineHeight,
          onSessionThemeChange: setSessionTheme,
          onCloseSessionConfig: () => {
            activeConfigSessionName = null;
            scheduleRender();
          },
          themes: THEMES
        })
      );
    }
  }
}

store.subscribe(() => {
  refreshKanbanStatusProjectsCache();
  scheduleRender();
});

window.addEventListener("resize", scheduleRender);

{
  const initialViewRefresh = refreshCurrentViewState({ includeTimeline: false });

  void Promise.all([
    sidebarFavorites.load(),
    mutedSessions.load(),
    sessionSettings.load(),
    initialViewRefresh,
    store.refreshKanbanProjects(),
    store.refreshTimeline()
  ])
    .then(() => {
      refreshKanbanStatusProjectsCache();
      scheduleRender();
      pageActivityController.start();
    });
}
