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
import { createInactiveTerminalPruner } from "./terminal/inactiveTerminalPruner";
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
  reconnect: () => void;
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
let activeSendSessionName: string | null = null;
let draftSendTargetName = "";
let draftSendCommand = "";
const tabState = createTabState();
const sessionSettings = createSessionSettingsStore();
const store = createDashboardStore({
  api: createSessionApi(),
  pollMs: 10_000,
  pruneTabs: (validSessionNames) => tabState.pruneTabs(validSessionNames),
  shouldIncludePreview: () => tabState.getActiveTabId() === null,
  shouldIncludePanes: () => tabState.getActiveTabId() !== null,
  getActiveSessionName: () => {
    const activeTabId = tabState.getActiveTabId();

    return (
      tabState.getTabs().find((tab) => tab.id === activeTabId)?.sessionName ?? null
    );
  }
});
const mountedTerminals = new Map<string, MountedTerminal>();
const inactiveTerminalPruner = createInactiveTerminalPruner({
  delayMs: 5000
});
let lastRenderedTabListSignature = "";
let lastRenderedActiveTabId: string | null | undefined;
let visibleTerminalPanelId: string | null = null;
let lastDashboardActive = tabState.getActiveTabId() === null;

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
      const isDashboardActive = tabState.getActiveTabId() === null;

      void store.refresh({
        includePreview: isDashboardActive,
        includePanes: !isDashboardActive
      });
    }
  });

  const mountedTerminal: MountedTerminal = {
    destroy: mounted.destroy,
    sendInput: mounted.sendInput,
    clear: mounted.clear,
    redraw: mounted.redraw,
    reconnect: mounted.reconnect,
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

function promptViewSession(currentSessionName: string) {
  const sessionNames = getSessionNames();
  const targetSessionName = window.prompt(
    `View session: ${sessionNames.join(", ")}`,
    currentSessionName
  )?.trim();

  if (!targetSessionName || !sessionNames.includes(targetSessionName)) {
    return;
  }

  getOrOpenTab(targetSessionName);
  scheduleRender();
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

function splitPane(sessionName: string, direction: "horizontal" | "vertical") {
  void store.splitPane(sessionName, direction).then(() => {
    scheduleRender();
  });
}

function openSessionPane(sessionName: string, paneId: string) {
  void store.selectPane(sessionName, paneId).then(() => {
    getOrOpenTab(sessionName);
    scheduleRender();
  });
}

function selectPane(sessionName: string, paneId: string) {
  void store.selectPane(sessionName, paneId).then(() => {
    void store.refresh({ includePreview: false, includePanes: true });
    scheduleRender();
  });
}

function killPane(sessionName: string, paneId: string) {
  const confirmed = window.confirm(`Close pane ${paneId} in "${sessionName}"?`);

  if (!confirmed) {
    return;
  }

  void store.killPane(sessionName, paneId).then(() => {
    scheduleRender();
  });
}

function refreshDashboard(options: { includeServerStatus?: boolean } = {}) {
  void store
    .refresh({
      includePreview: true,
      includePanes: true,
      includeServerStatus: options.includeServerStatus ?? false
    })
    .then(() => {
      scheduleRender();
    });
}

function createSessionStatusActions(tab: BrowserTab, mounted: MountedTerminal) {
  return {
    onRefresh: () => {
      const isDashboardActive = tabState.getActiveTabId() === null;

      void store.refresh({
        includePreview: isDashboardActive,
        includePanes: !isDashboardActive
      });
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
    onConfig: () => {
      activeConfigSessionName = tab.sessionName;
      scheduleRender();
    },
    onRename: () => promptRenameSession(tab.sessionName),
    onSendCommand: () => openSendCommandPanel(tab.sessionName),
    onViewSession: () => promptViewSession(tab.sessionName),
    onSplitHorizontal: () => splitPane(tab.sessionName, "horizontal"),
    onSplitVertical: () => splitPane(tab.sessionName, "vertical"),
    onSelectPane: selectPane,
    onKillPane: killPane,
    onKill: () => killSession(tab.sessionName, { confirm: true })
  };
}

function render() {
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const isDashboardActive = activeTabId === null;
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

  if (isDashboardActive !== lastDashboardActive) {
    lastDashboardActive = isDashboardActive;

    if (isDashboardActive) {
      refreshDashboard();
    }
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
      onRefreshDashboard: () => refreshDashboard({ includeServerStatus: true })
    });
  }

  dashboardRoot.style.display = activeTabId === null ? "block" : "none";
  panelsRoot.style.display = activeTabId === null ? "none" : "block";
  syncPanels();
  panelsRoot.querySelector(".session-config-backdrop")?.remove();
  renderSendCommandPanel();

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

{
  const isDashboardActive = tabState.getActiveTabId() === null;

  void store
    .refresh({
      includePreview: isDashboardActive,
      includePanes: !isDashboardActive
    })
    .then(() => {
      scheduleRender();
      store.startPolling();
    });
}
