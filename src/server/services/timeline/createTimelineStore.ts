import type {
  TimelineEvent,
  TimelineEventDraft
} from "../../../shared/timeline.js";

export type TimelineStore = {
  addEvent: (event: TimelineEventDraft) => TimelineEvent;
  listEvents: (options?: { limit?: number }) => TimelineEvent[];
};

const DEFAULT_MAX_EVENTS = 200;

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? NaN)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(limit ?? 50), 1), DEFAULT_MAX_EVENTS);
}

export function createTimelineStore(options: { maxEvents?: number } = {}): TimelineStore {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const events: TimelineEvent[] = [];
  let nextId = 1;

  return {
    addEvent(event) {
      const recordedEvent: TimelineEvent = {
        ...event,
        id: String(nextId),
        createdAt: new Date().toISOString()
      };
      nextId += 1;
      events.unshift(recordedEvent);

      if (events.length > maxEvents) {
        events.length = maxEvents;
      }

      return recordedEvent;
    },
    listEvents(options = {}) {
      return events.slice(0, normalizeLimit(options.limit));
    }
  };
}
