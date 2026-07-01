type TimerHandle = number;

export function createInactiveTerminalPruner(deps: {
  delayMs: number;
  setTimeout?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
}) {
  const setTimer =
    deps.setTimeout ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
  const clearTimer = deps.clearTimeout ?? ((handle) => window.clearTimeout(handle));
  const pendingDetachTimers = new Map<string, TimerHandle>();

  function cancel(tabId: string) {
    const timer = pendingDetachTimers.get(tabId);

    if (timer === undefined) {
      return;
    }

    clearTimer(timer);
    pendingDetachTimers.delete(tabId);
  }

  return {
    sync(
      activeTabId: string | null,
      mountedTabIds: string[],
      detachTerminal: (tabId: string) => void
    ) {
      const mounted = new Set(mountedTabIds);

      [...pendingDetachTimers.keys()].forEach((tabId) => {
        if (tabId === activeTabId || !mounted.has(tabId)) {
          cancel(tabId);
        }
      });

      mountedTabIds.forEach((tabId) => {
        if (tabId === activeTabId || pendingDetachTimers.has(tabId)) {
          return;
        }

        const timer = setTimer(() => {
          pendingDetachTimers.delete(tabId);
          detachTerminal(tabId);
        }, deps.delayMs);
        pendingDetachTimers.set(tabId, timer);
      });
    },
    cancel,
    destroy() {
      [...pendingDetachTimers.keys()].forEach(cancel);
    }
  };
}
