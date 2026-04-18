import type { BrowserTab } from "../state/tabState";

export function renderTabs(
  root: HTMLElement,
  tabs: BrowserTab[],
  activeTabId: string | null,
  actions: {
    onSelectTab: (tabId: string) => void;
    onCloseTab: (tabId: string) => void;
  }
) {
  root.innerHTML = "";

  const strip = document.createElement("div");
  strip.className = "tab-strip";

  tabs.forEach((tab) => {
    const item = document.createElement("div");
    item.className = `tab-item${tab.id === activeTabId ? " is-active" : ""}`;

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.textContent = tab.title;
    selectButton.addEventListener("click", () => actions.onSelectTab(tab.id));

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => actions.onCloseTab(tab.id));

    item.append(selectButton, closeButton);
    strip.append(item);
  });

  root.append(strip);
}
