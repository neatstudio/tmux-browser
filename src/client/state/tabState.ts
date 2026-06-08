export type BrowserTab = {
  id: string;
  sessionName: string;
  title: string;
  pinned?: boolean;
};

const STORAGE_KEY = "browser-tmux-dashboard.tabs";

function loadTabs(): BrowserTab[] {
  const stored =
    localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const tabs = JSON.parse(stored) as BrowserTab[];

    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    }

    return tabs;
  } catch {
    return [];
  }
}

export function createTabState(options: { initialActiveTabId?: string | null } = {}) {
  let tabs = loadTabs();
  let activeTabId: string | null =
    options.initialActiveTabId === undefined
      ? tabs[0]?.id ?? null
      : options.initialActiveTabId;

  if (activeTabId !== null && !tabs.some((tab) => tab.id === activeTabId)) {
    activeTabId = tabs[0]?.id ?? null;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }

  return {
    getTabs() {
      return tabs;
    },
    getActiveTabId() {
      return activeTabId;
    },
    openTab(sessionName: string) {
      const existing = tabs.find((tab) => tab.sessionName === sessionName);

      if (existing) {
        activeTabId = existing.id;
        return existing;
      }

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
      const target = tabs.find((tab) => tab.id === tabId);

      if (target?.pinned) {
        return;
      }

      const closedIndex = tabs.findIndex((tab) => tab.id === tabId);
      tabs = tabs.filter((tab) => tab.id !== tabId);

      if (activeTabId === tabId) {
        const fallbackIndex = Math.max(0, closedIndex - 1);
        activeTabId = tabs[fallbackIndex]?.id ?? null;
      }

      persist();
    },
    forceCloseTab(tabId: string) {
      const closedIndex = tabs.findIndex((tab) => tab.id === tabId);
      tabs = tabs.filter((tab) => tab.id !== tabId);

      if (activeTabId === tabId) {
        const fallbackIndex = Math.max(0, closedIndex - 1);
        activeTabId = tabs[fallbackIndex]?.id ?? null;
      }

      persist();
    },
    togglePinned(tabId: string) {
      tabs = tabs.map((tab) =>
        tab.id === tabId ? { ...tab, pinned: !tab.pinned } : tab
      );
      persist();
    },
    renameSession(fromName: string, toName: string) {
      tabs = tabs.map((tab) =>
        tab.sessionName === fromName
          ? {
              ...tab,
              sessionName: toName,
              title: toName
            }
          : tab
      );
      persist();
    },
    setActiveTab(tabId: string | null) {
      activeTabId = tabId;
    },
    pruneTabs(validSessionNames: string[]) {
      const valid = new Set(validSessionNames);
      tabs = tabs.filter((tab) => tab.pinned || valid.has(tab.sessionName));

      if (activeTabId && !tabs.some((tab) => tab.id === activeTabId)) {
        activeTabId = tabs[0]?.id ?? null;
      }

      persist();
    }
  };
}
