export function createAppEventRefreshScheduler(
  refresh: () => void,
  options: { delayMs?: number } = {}
) {
  const delayMs = options.delayMs ?? 120;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer === null) {
      return;
    }

    clearTimeout(timer);
    timer = null;
  }

  return {
    schedule() {
      if (timer !== null) {
        return;
      }

      timer = setTimeout(() => {
        timer = null;
        refresh();
      }, delayMs);
    },
    cancel: clearTimer
  };
}
