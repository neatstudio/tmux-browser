type TimerHandle = ReturnType<typeof setTimeout>;

type PromptSnapshotSchedulerDeps = {
  intervalMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  readSnapshot: () => string;
  onSnapshot: (rawData: string, snapshot: string) => void;
};

export function createPromptSnapshotScheduler(
  deps: PromptSnapshotSchedulerDeps
) {
  const intervalMs = deps.intervalMs ?? 150;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let generation = 0;
  let latestWriteId = 0;
  let completedWriteId = 0;
  let pendingRawData = "";
  let timer: TimerHandle | null = null;
  let lastSnapshotAt: number | null = null;
  let forcePending = false;
  let finalCallback: (() => void) | null = null;

  function clearPendingTimer() {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  }

  function runSnapshot() {
    if (completedWriteId < latestWriteId) return;
    clearPendingTimer();
    const rawData = pendingRawData;
    pendingRawData = "";
    forcePending = false;
    lastSnapshotAt = now();
    deps.onSnapshot(rawData, deps.readSnapshot());
    const callback = finalCallback;
    finalCallback = null;
    callback?.();
  }

  function requestSnapshot(force: boolean) {
    forcePending ||= force;
    if (completedWriteId < latestWriteId) return;
    if (forcePending || lastSnapshotAt === null) {
      runSnapshot();
      return;
    }
    if (timer !== null) return;
    const delayMs = Math.max(0, intervalMs - (now() - lastSnapshotAt));
    timer = setTimer(() => {
      timer = null;
      forcePending = true;
      runSnapshot();
    }, delayMs);
  }

  return {
    trackWrite(rawData: string) {
      const writeGeneration = generation;
      const writeId = (latestWriteId += 1);
      pendingRawData += rawData;
      return () => {
        if (writeGeneration !== generation) return;
        completedWriteId = Math.max(completedWriteId, writeId);
        if (writeId === latestWriteId) requestSnapshot(false);
      };
    },
    flush() {
      if (!pendingRawData && finalCallback === null) return;
      requestSnapshot(true);
    },
    finalize(callback: () => void) {
      finalCallback = callback;
      requestSnapshot(true);
    },
    cancel() {
      generation += 1;
      clearPendingTimer();
      latestWriteId = 0;
      completedWriteId = 0;
      pendingRawData = "";
      lastSnapshotAt = null;
      forcePending = false;
      finalCallback = null;
    }
  };
}
