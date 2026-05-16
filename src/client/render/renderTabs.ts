import type { BrowserTab } from "../state/tabState";

const DASHBOARD_TAB_ID = "__dashboard__";

function closeContextMenu(root: HTMLElement) {
  root.querySelector(".tab-context-menu")?.remove();
}

export function updateActiveTabItem(root: HTMLElement, activeTabId: string | null) {
  const nextActiveTabId = activeTabId ?? DASHBOARD_TAB_ID;

  root.querySelectorAll<HTMLElement>(".tab-item[data-tab-id]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.tabId === nextActiveTabId);
  });
}

export function renderTabs(
  root: HTMLElement,
  tabs: BrowserTab[],
  activeTabId: string | null,
  actions: {
    onSelectTab: (tabId: string) => void;
    onCloseTab: (tabId: string) => void;
    onTogglePin: (tabId: string) => void;
  }
) {
  root.innerHTML = "";

  const strip = document.createElement("div");
  strip.className = "tab-strip";

  const dashboardItem = document.createElement("div");
  dashboardItem.dataset.tabId = DASHBOARD_TAB_ID;
  dashboardItem.className = `tab-item tab-item--dashboard${
    activeTabId === null ? " is-active" : ""
  }`;

  const dashboardButton = document.createElement("button");
  dashboardButton.type = "button";
  dashboardButton.textContent = "Dashboard";
  dashboardButton.addEventListener("click", () => actions.onSelectTab("__dashboard__"));

  dashboardItem.append(dashboardButton);
  strip.append(dashboardItem);

  tabs.forEach((tab) => {
    const item = document.createElement("div");
    item.dataset.tabId = tab.id;
    item.className = `tab-item${tab.id === activeTabId ? " is-active" : ""}${
      tab.pinned ? " is-pinned" : ""
    }`;

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "tab-label";
    selectButton.textContent = tab.title;
    selectButton.addEventListener("click", () => actions.onSelectTab(tab.id));

    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      closeContextMenu(root);

      const menu = document.createElement("div");
      menu.className = "tab-context-menu";
      menu.setAttribute("role", "menu");
      menu.style.left = `${event.clientX}px`;
      menu.style.top = `${event.clientY}px`;

      const pinButton = document.createElement("button");
      pinButton.type = "button";
      pinButton.dataset.action = `pin-${tab.id}`;
      pinButton.textContent = tab.pinned ? "Unpin" : "Pin";
      pinButton.addEventListener("click", () => {
        actions.onTogglePin(tab.id);
        closeContextMenu(root);
      });
      menu.append(pinButton);

      if (!tab.pinned) {
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.dataset.action = `close-${tab.id}`;
        closeButton.textContent = "Close";
        closeButton.addEventListener("click", () => {
          actions.onCloseTab(tab.id);
          closeContextMenu(root);
        });
        menu.append(closeButton);
      }

      root.append(menu);
    });

    item.append(selectButton);

    strip.append(item);
  });

  root.addEventListener("click", () => closeContextMenu(root));
  root.append(strip);
}
