import "xterm/css/xterm.css";

import { createSessionApi } from "./api/sessionApi";
import { renderDashboard } from "./render/renderDashboard";
import { renderTabs } from "./render/renderTabs";
import { createDashboardStore } from "./state/dashboardStore";
import { createTabState, type BrowserTab } from "./state/tabState";
import { createTerminalTab } from "./terminal/createTerminalTab";
import "./styles.css";

type MountedTerminal = {
  destroy: () => void;
  panel: HTMLElement;
};

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <div class="app-shell">
    <div class="tabs-root"></div>
    <div class="workspace">
      <div class="dashboard-root"></div>
      <div class="panels-root"></div>
    </div>
  </div>
`;

const tabsRoot = app.querySelector<HTMLElement>(".tabs-root")!;
const dashboardRoot = app.querySelector<HTMLElement>(".dashboard-root")!;
const panelsRoot = app.querySelector<HTMLElement>(".panels-root")!;

const tabState = createTabState();
const store = createDashboardStore({
  api: createSessionApi(),
  pollMs: 3000,
  pruneTabs: (validSessionNames) => tabState.pruneTabs(validSessionNames)
});
const mountedTerminals = new Map<string, MountedTerminal>();

function getOrOpenTab(sessionName: string) {
  const existing = tabState
    .getTabs()
    .find((tab) => tab.sessionName === sessionName);

  if (existing) {
    tabState.setActiveTab(existing.id);
    render();
    return existing;
  }

  return tabState.openTab(sessionName);
}

function closeTab(tabId: string) {
  mountedTerminals.get(tabId)?.destroy();
  mountedTerminals.get(tabId)?.panel.remove();
  mountedTerminals.delete(tabId);
  tabState.closeTab(tabId);
  render();
}

function ensureTerminal(tab: BrowserTab) {
  if (mountedTerminals.has(tab.id)) {
    return;
  }

  const panel = document.createElement("div");
  panel.className = "terminal-panel";
  panelsRoot.append(panel);

  const mounted = createTerminalTab({
    container: panel,
    tabId: tab.id,
    sessionName: tab.sessionName,
    onClosed: () => {
      closeTab(tab.id);
      void store.refresh();
    }
  });

  mountedTerminals.set(tab.id, {
    destroy: mounted.destroy,
    panel
  });
}

function syncPanels() {
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const validIds = new Set(tabs.map((tab) => tab.id));

  tabs.forEach((tab) => {
    ensureTerminal(tab);
    const mounted = mountedTerminals.get(tab.id)!;
    mounted.panel.style.display = tab.id === activeTabId ? "block" : "none";
  });

  [...mountedTerminals.keys()].forEach((tabId) => {
    if (!validIds.has(tabId)) {
      mountedTerminals.get(tabId)?.destroy();
      mountedTerminals.get(tabId)?.panel.remove();
      mountedTerminals.delete(tabId);
    }
  });
}

function render() {
  renderTabs(tabsRoot, tabState.getTabs(), tabState.getActiveTabId(), {
    onSelectTab: (tabId) => {
      tabState.setActiveTab(tabId);
      render();
    },
    onCloseTab: (tabId) => closeTab(tabId)
  });

  renderDashboard(dashboardRoot, store.getState(), {
    onCreateSession: (name) => {
      void store.createSession(name).then(() => {
        getOrOpenTab(name);
        render();
      });
    },
    onOpenSession: (name) => {
      getOrOpenTab(name);
      render();
    },
    onKillSession: (name) => {
      void store.killSession(name);
    }
  });

  syncPanels();
}

store.subscribe(() => {
  render();
});

void store.refresh().then(() => {
  render();
  store.startPolling();
});
