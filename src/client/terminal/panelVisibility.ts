export type TerminalPanelRef = {
  panel: HTMLElement;
  redraw?: () => void;
};

export function syncTerminalPanelVisibility(
  mountedTerminals: Map<string, TerminalPanelRef>,
  previousActiveTabId: string | null,
  nextActiveTabId: string | null
) {
  if (previousActiveTabId === nextActiveTabId) {
    return previousActiveTabId;
  }

  if (previousActiveTabId) {
    mountedTerminals.get(previousActiveTabId)?.panel.classList.remove("is-active");
  }

  if (nextActiveTabId) {
    const nextTerminal = mountedTerminals.get(nextActiveTabId);
    nextTerminal?.panel.classList.add("is-active");
    nextTerminal?.redraw?.();
  }

  return nextActiveTabId;
}
