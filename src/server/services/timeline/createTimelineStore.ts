import type {
  AppendOnlyTimelineEvent,
  ConversationMessageTimelineEvent,
  ConversationMessageUpsertDraft,
  StoredTimelineEvent,
  TimelineEventDraft
} from "../../../shared/timeline.js";

export type TimelineStoreConflictCode =
  | "invalid_revision"
  | "revision_required"
  | "stale_revision"
  | "revision_gap"
  | "immutable_field"
  | "terminal_conflict";

export class TimelineStoreConflictError extends Error {
  constructor(
    public readonly code: TimelineStoreConflictCode,
    message: string
  ) {
    super(message);
    this.name = "TimelineStoreConflictError";
  }
}

export type TimelineStore = {
  addEvent: (event: TimelineEventDraft) => AppendOnlyTimelineEvent;
  upsertConversationMessage: (
    event: ConversationMessageUpsertDraft
  ) => ConversationMessageTimelineEvent;
  listEvents: (options?: { limit?: number }) => StoredTimelineEvent[];
};

const DEFAULT_MAX_EVENTS = 200;

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? NaN)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(limit ?? 50), 1), DEFAULT_MAX_EVENTS);
}

const IMMUTABLE_FIELDS = [
  "sessionName",
  "messageId",
  "role",
  "contentType",
  "toolName",
  "parentMessageId"
] as const;

function conversationKey(
  event: Pick<ConversationMessageUpsertDraft, "sessionName" | "messageId">
) {
  return JSON.stringify([event.sessionName, event.messageId]);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

function semanticPayload(
  event: ConversationMessageUpsertDraft | ConversationMessageTimelineEvent,
  revision: number
) {
  return JSON.stringify(
    stableValue({
      type: event.type,
      sessionName: event.sessionName,
      messageId: event.messageId,
      role: event.role,
      contentType: event.contentType,
      content: event.content,
      summary: event.summary ?? null,
      metadata: event.metadata,
      status: event.status,
      toolName: event.toolName,
      parentMessageId: event.parentMessageId,
      revision
    })
  );
}

function isValidRevision(revision: number) {
  return Number.isFinite(revision) && Number.isInteger(revision);
}

export function createTimelineStore(options: { maxEvents?: number } = {}): TimelineStore {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const events: StoredTimelineEvent[] = [];
  const conversations = new Map<string, ConversationMessageTimelineEvent>();
  let nextId = 1;

  function trimEvents() {
    while (events.length > maxEvents) {
      events.pop();
    }
  }

  function upsertConversationMessage(
    event: ConversationMessageUpsertDraft
  ): ConversationMessageTimelineEvent {
    const key = conversationKey(event);
    const current = conversations.get(key);

    if (!current) {
      if (
        event.revision !== undefined &&
        (!isValidRevision(event.revision) || event.revision !== 1)
      ) {
        throw new TimelineStoreConflictError(
          "invalid_revision",
          "A new conversation message must start at revision 1"
        );
      }
      const now = new Date().toISOString();
      const recordedEvent: ConversationMessageTimelineEvent = {
        ...event,
        summary: event.summary ?? null,
        id: String(nextId),
        createdAt: now,
        updatedAt: now,
        revision: 1
      };
      nextId += 1;
      events.unshift(recordedEvent);
      conversations.set(key, recordedEvent);
      trimEvents();
      return recordedEvent;
    }

    if (event.revision === undefined) {
      throw new TimelineStoreConflictError(
        "revision_required",
        "An update revision is required"
      );
    }

    if (!isValidRevision(event.revision)) {
      throw new TimelineStoreConflictError(
        "invalid_revision",
        "The conversation message revision must be a finite integer"
      );
    }

    if (event.revision <= current.revision) {
      if (
        event.revision === current.revision &&
        semanticPayload(event, event.revision) ===
          semanticPayload(current, current.revision)
      ) {
        return current;
      }
      throw new TimelineStoreConflictError(
        "stale_revision",
        "The conversation message revision is stale"
      );
    }

    if (event.revision > current.revision + 1) {
      throw new TimelineStoreConflictError(
        "revision_gap",
        "The conversation message revision is not consecutive"
      );
    }

    for (const field of IMMUTABLE_FIELDS) {
      if (event[field] !== current[field]) {
        throw new TimelineStoreConflictError(
          "immutable_field",
          `Conversation message field ${field} is immutable`
        );
      }
    }

    if (current.status === "complete" || current.status === "failed") {
      throw new TimelineStoreConflictError(
        "terminal_conflict",
        "A terminal conversation message cannot be changed"
      );
    }

    const updated: ConversationMessageTimelineEvent = {
      ...current,
      content: event.content,
      summary: event.summary ?? null,
      metadata: event.metadata,
      status: event.status,
      revision: event.revision,
      updatedAt: new Date().toISOString()
    };
    const index = events.indexOf(current);
    if (index >= 0) {
      events[index] = updated;
    } else {
      events.unshift(updated);
      trimEvents();
    }
    conversations.set(key, updated);
    return updated;
  }

  return {
    addEvent(event) {
      const recordedEvent: AppendOnlyTimelineEvent = {
        ...event,
        id: String(nextId),
        createdAt: new Date().toISOString()
      } as AppendOnlyTimelineEvent;
      nextId += 1;
      events.unshift(recordedEvent);
      trimEvents();

      return recordedEvent;
    },
    upsertConversationMessage,
    listEvents(options = {}) {
      return events.slice(0, normalizeLimit(options.limit));
    }
  };
}
