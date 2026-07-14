import type { AppEvent, AppEventDraft } from "../../../shared/appEvents.js";

export type AppEventHub = {
  publish: (event: AppEventDraft) => AppEvent;
  subscribe: (listener: (event: AppEvent) => void) => () => void;
};

export function createAppEventHub(): AppEventHub {
  const listeners = new Set<(event: AppEvent) => void>();
  let nextId = 0;

  return {
    publish(draft) {
      nextId += 1;
      const event: AppEvent =
        "id" in draft && "createdAt" in draft
          ? draft
          : {
              ...draft,
              id: `evt-${nextId}`,
              createdAt: new Date().toISOString()
            };

      listeners.forEach((listener) => listener(event));

      return event;
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }
  };
}
