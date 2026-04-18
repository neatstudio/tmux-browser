export type BrowserTab = {
  id: string;
  sessionName: string;
  title: string;
};

const STORAGE_KEY = "browser-tmux-dashboard.tabs";

function loadTabs(): BrowserTab[] {
  const stored = sessionStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    return JSON.parse(stored) as BrowserTab[];
  } catch {
    return [];
  }
}

export function createTabState() {
  let tabs = loadTabs();
  let activeTabId: string | null = tabs[0]?.id ?? null;

  function persist() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }

  return {
    getTabs() {
      return tabs;
    },
    getActiveTabId() {
      return activeTabId;
    },
    openTab(sessionName: string) {
      const tab: BrowserTab = {
        id: `${sessionName}-${Date.now()}`,
        sessionName,
        title: sessionName
      };

      tabs = [...tabs, tab];
      activeTabId = tab.id;
      persist();

      return tab;
    },
    closeTab(tabId: string) {
      tabs = tabs.filter((tab) => tab.id !== tabId);
      activeTabId = tabs[0]?.id ?? null;
      persist();
    },
    setActiveTab(tabId: string | null) {
      activeTabId = tabId;
    },
    pruneTabs(validSessionNames: string[]) {
      const valid = new Set(validSessionNames);
      tabs = tabs.filter((tab) => valid.has(tab.sessionName));

      if (activeTabId && !tabs.some((tab) => tab.id === activeTabId)) {
        activeTabId = tabs[0]?.id ?? null;
      }

      persist();
    }
  };
}
