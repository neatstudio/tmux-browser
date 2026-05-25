import { isPageVisible } from "../pageVisibility";

type DocumentActivityTarget = {
  visibilityState: DocumentVisibilityState;
  addEventListener: Document["addEventListener"];
  removeEventListener: Document["removeEventListener"];
};

type PageActivityControllerDeps = {
  document: DocumentActivityTarget;
  polling: {
    start: () => void;
    stop: () => void;
  };
  events: {
    connect: () => void;
    close: () => void;
  };
  refresh: () => void;
};

export function createPageActivityController(
  deps: PageActivityControllerDeps
) {
  let started = false;
  let visible = false;

  function activate(shouldRefresh: boolean) {
    if (visible) {
      return;
    }

    visible = true;
    deps.polling.start();
    deps.events.connect();

    if (shouldRefresh) {
      deps.refresh();
    }
  }

  function deactivate() {
    if (!visible) {
      deps.polling.stop();
      deps.events.close();
      return;
    }

    visible = false;
    deps.polling.stop();
    deps.events.close();
  }

  function syncVisibility(shouldRefresh: boolean) {
    if (!isPageVisible(deps.document)) {
      deactivate();
      return;
    }

    activate(shouldRefresh);
  }

  function handleVisibilityChange() {
    syncVisibility(true);
  }

  return {
    start() {
      if (started) {
        return;
      }

      started = true;
      deps.document.addEventListener("visibilitychange", handleVisibilityChange);
      syncVisibility(false);
    },
    dispose() {
      if (!started) {
        return;
      }

      started = false;
      deps.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      deactivate();
    }
  };
}
