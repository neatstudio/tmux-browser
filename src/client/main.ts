import "@xterm/xterm/css/xterm.css";

import { createSessionApi } from "./api/sessionApi";
import { renderDashboard } from "./render/renderDashboard";
import { createAnimationFrameScheduler } from "./render/renderScheduler";
import { renderSessionConfigModal } from "./render/sessionConfigModal";
import { renderSessionStatusBar } from "./render/sessionStatusBar";
import { renderTabs, updateActiveTabItem } from "./render/renderTabs";
import { createDashboardStore } from "./state/dashboardStore";
import { createSessionSettingsStore } from "./state/sessionSettings";
import { createTabState, type BrowserTab } from "./state/tabState";
import { createTerminalTab } from "./terminal/createTerminalTab";
import { syncTerminalPanelVisibility } from "./terminal/panelVisibility";
import {
  applyTheme,
  getTheme,
  loadThemeId,
  saveThemeId,
  THEMES,
  type AppTheme
} from "./theme/themeState";
import "./styles.css";

type MountedTerminal = {
  destroy: () => void;
  sendInput: (data: string) => void;
  clear: () => void;
  redraw: () => void;
  setTheme: (theme: AppTheme["terminalTheme"]) => void;
  setFontSize: (fontSize: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setLineHeight: (lineHeight: number) => void;
  panel: HTMLElement;
  statusBar: HTMLElement;
};

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <div class="app-shell">
    <div class="tabs-root"></div>
    <div class="content-root">
      <div class="dashboard-root"></div>
      <div class="panels-root"></div>
    </div>
  </div>
`;

const tabsRoot = app.querySelector<HTMLElement>(".tabs-root")!;
const dashboardRoot = app.querySelector<HTMLElement>(".dashboard-root")!;
const panelsRoot = app.querySelector<HTMLElement>(".panels-root")!;

let activeTheme = getTheme(loadThemeId());
let draftSessionName = "";
let activeConfigSessionName: string | null = null;
const tabState = createTabState();
const sessionSettings = createSessionSettingsStore();
const store = createDashboardStore({
  api: createSessionApi(),
  pollMs: 3000,
  pruneTabs: (validSessionNames) => tabState.pruneTabs(validSessionNames)
});
const mountedTerminals = new Map<string, MountedTerminal>();
let lastRenderedTabListSignature = "";
let lastRenderedActiveTabId: string | null | undefined;
let visibleTerminalPanelId: string | null = null;

applyTheme(activeTheme);

const renderScheduler = createAnimationFrameScheduler(render);

function scheduleRender() {
  renderScheduler.schedule();
}

function getOrOpenTab(sessionName: string) {
  const existing = tabState
    .getTabs()
    .find((tab) => tab.sessionName === sessionName);

  if (existing) {
    tabState.setActiveTab(existing.id);
    scheduleRender();
    return existing;
  }

  return tabState.openTab(sessionName);
}

function closeTab(tabId: string, options: { force?: boolean } = {}) {
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

function ensureTerminal(tab: BrowserTab) {
  if (mountedTerminals.has(tab.id)) {
    return;
  }

  const panel = document.createElement("div");
  panel.className = "terminal-panel";
  const frame = document.createElement("div");
  frame.className = "terminal-frame";
  panel.append(frame);
  panelsRoot.append(panel);

  const mounted = createTerminalTab({
    container: frame,
    rendererStatusElement: panel,
    tabId: tab.id,
    sessionName: tab.sessionName,
    fontSize: sessionSettings.get(tab.sessionName).fontSize,
    fontFamily: sessionSettings.get(tab.sessionName).fontFamily,
    lineHeight: sessionSettings.get(tab.sessionName).lineHeight,
    terminalTheme: getTheme(sessionSettings.get(tab.sessionName).themeId).terminalTheme,
    onClosed: () => {
      closeTab(tab.id, { force: true });
      void store.refresh();
    }
  });

  const mountedTerminal: MountedTerminal = {
    destroy: mounted.destroy,
    sendInput: mounted.sendInput,
    clear: mounted.clear,
    redraw: mounted.redraw,
    setTheme: mounted.setTheme,
    setFontSize: mounted.setFontSize,
    setFontFamily: mounted.setFontFamily,
    setLineHeight: mounted.setLineHeight,
    panel,
    statusBar: panel
  };
  mountedTerminals.set(tab.id, mountedTerminal);
  renderSessionStatusBar(
    panel,
    store.getState().sessions.find((session) => session.name === tab.sessionName),
    createSessionStatusActions(tab, mountedTerminal)
  );
  panel.style.background = getTheme(
    sessionSettings.get(tab.sessionName).themeId
  ).terminalTheme.background;
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
  });
}

function syncPanels() {
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const validIds = new Set(tabs.map((tab) => tab.id));

  [...mountedTerminals.keys()].forEach((tabId) => {
    if (!validIds.has(tabId)) {
      mountedTerminals.get(tabId)?.destroy();
      mountedTerminals.get(tabId)?.panel.remove();
      mountedTerminals.delete(tabId);
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

function createSessionStatusActions(tab: BrowserTab, mounted: MountedTerminal) {
  return {
    onRefresh: () => {
      void store.refresh();
    },
    onClear: () => {
      mounted.clear();
    },
    onRedraw: () => {
      mounted.redraw();
    },
    onConfig: () => {
      activeConfigSessionName = tab.sessionName;
      scheduleRender();
    },
    onRename: () => promptRenameSession(tab.sessionName),
    onKill: () => killSession(tab.sessionName, { confirm: true })
  };
}

function render() {
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const tabListSignature = tabs
    .map((tab) => `${tab.id}:${tab.title}:${tab.pinned ? "pinned" : "free"}`)
    .join("|");

  if (tabListSignature !== lastRenderedTabListSignature) {
    renderTabs(tabsRoot, tabs, activeTabId, {
      onSelectTab: (tabId) => {
        tabState.setActiveTab(tabId === "__dashboard__" ? null : tabId);
        scheduleRender();
      },
      onCloseTab: (tabId) => closeTab(tabId),
      onTogglePin: (tabId) => {
        tabState.togglePinned(tabId);
        scheduleRender();
      }
    });
    lastRenderedTabListSignature = tabListSignature;
    lastRenderedActiveTabId = activeTabId;
  } else if (activeTabId !== lastRenderedActiveTabId) {
    updateActiveTabItem(tabsRoot, activeTabId);
    lastRenderedActiveTabId = activeTabId;
  }

  if (activeTabId === null) {
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
      onThemeChange: setActiveTheme
    });
  }

  dashboardRoot.style.display = activeTabId === null ? "block" : "none";
  panelsRoot.style.display = activeTabId === null ? "none" : "block";
  syncPanels();
  panelsRoot.querySelector(".session-config-backdrop")?.remove();

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
  scheduleRender();
});

void store.refresh().then(() => {
  scheduleRender();
  store.startPolling();
});
