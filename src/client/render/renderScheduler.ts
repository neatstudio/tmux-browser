type FrameSchedulerDeps = {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
};

export function createAnimationFrameScheduler(
  callback: () => void,
  deps: FrameSchedulerDeps = {}
) {
  const requestFrame =
    deps.requestFrame ?? ((nextCallback) => window.requestAnimationFrame(nextCallback));
  const cancelFrame =
    deps.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
  let pendingFrame: number | null = null;

  function run() {
    pendingFrame = null;
    callback();
  }

  return {
    schedule() {
      if (pendingFrame !== null) {
        return;
      }

      pendingFrame = requestFrame(run);
    },
    flushNow() {
      if (pendingFrame !== null) {
        cancelFrame(pendingFrame);
        pendingFrame = null;
      }

      callback();
    },
    cancel() {
      if (pendingFrame === null) {
        return;
      }

      cancelFrame(pendingFrame);
      pendingFrame = null;
    }
  };
}
