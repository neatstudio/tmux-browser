import type {
  ConversationMessageTimelineEvent,
  ConversationMessageUpsertDraft,
  HookEventTimelineEvent,
  TimelineEvent,
  TimelineEventDraft
} from "../../../shared/timeline.js";

export type TimelineStoreConflictCode =
  | "invalid_revision"
  | "revision_required"
  | "stale_revision"
  | "revision_gap"
  | "immutable_field"
  | "terminal_conflict";

export type TimelineCursorErrorCode =
  | "timeline_cursor_invalid"
  | "timeline_cursor_expired";

export class TimelineCursorError extends Error {
  constructor(
    public readonly code: TimelineCursorErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TimelineCursorError";
  }
}

export type TimelinePage = {
  events: TimelineEvent[];
  nextCursor: string | null;
};

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
  addEvent: {
    (event: Omit<HookEventTimelineEvent, "id" | "createdAt">): HookEventTimelineEvent;
    (event: TimelineEventDraft): TimelineEvent;
  };
  upsertConversationMessage: (
    event: ConversationMessageUpsertDraft
  ) => ConversationMessageTimelineEvent;
  listEventPage: (options?: { limit?: number; cursor?: string }) => TimelinePage;
  listEvents: (options?: { limit?: number }) => TimelineEvent[];
};

export const DEFAULT_MAX_EVENTS = 1000;
export const MAX_PAGE_SIZE = 200;

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(limit ?? NaN)) {
    return 50;
  }

  return Math.min(Math.max(Math.trunc(limit ?? 50), 1), MAX_PAGE_SIZE);
}

function compareIdsDescending(left: string, right: string) {
  const numericIdPattern = /^\d+$/;
  const leftIsNumeric = numericIdPattern.test(left);
  const rightIsNumeric = numericIdPattern.test(right);
  if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1;
  if (leftIsNumeric && rightIsNumeric) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    if (leftNumber !== rightNumber) return leftNumber > rightNumber ? -1 : 1;
  }
  return left === right ? 0 : left > right ? -1 : 1;
}

function compareEventsDescending(left: TimelineEvent, right: TimelineEvent) {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt > right.createdAt ? -1 : 1;
  }
  return compareIdsDescending(left.id, right.id);
}

type CursorBoundary = { version: 1; id: string; createdAt: string };

function encodeCursor(event: Pick<TimelineEvent, "id" | "createdAt">) {
  const boundary: CursorBoundary = {
    version: 1,
    id: event.id,
    createdAt: event.createdAt
  };
  return Buffer.from(JSON.stringify(boundary)).toString("base64url");
}

function decodeCursor(cursor: string): CursorBoundary {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<CursorBoundary>;
    if (
      parsed.version !== 1 ||
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.createdAt !== "string" ||
      !parsed.createdAt ||
      encodeCursor(parsed as CursorBoundary) !== cursor
    ) {
      throw new Error("invalid cursor payload");
    }
    return parsed as CursorBoundary;
  } catch {
    throw new TimelineCursorError(
      "timeline_cursor_invalid",
      "The timeline cursor is invalid"
    );
  }
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
  if (
    !Number.isFinite(maxEvents) ||
    !Number.isInteger(maxEvents) ||
    maxEvents <= 0
  ) {
    throw new RangeError("maxEvents must be a finite positive integer");
  }

  const events: TimelineEvent[] = [];
  const conversations = new Map<string, ConversationMessageTimelineEvent>();
  let nextId = 1;

  function trimEvents() {
    while (events.length > maxEvents) {
      const removed = events.pop();
      if (removed?.type === "conversation-message") {
        const key = conversationKey(removed);
        if (conversations.get(key)?.id === removed.id) {
          conversations.delete(key);
        }
      }
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
    }
    conversations.set(key, updated);
    return updated;
  }

  return {
    addEvent: ((event: TimelineEventDraft) => {
      const createdAt = new Date().toISOString();
      const recordedEvent: TimelineEvent =
        event.type === "conversation-message"
          ? {
              ...event,
              summary: event.summary ?? null,
              revision: event.revision ?? 1,
              id: String(nextId),
              createdAt,
              updatedAt: createdAt
            }
          : {
              ...event,
              id: String(nextId),
              createdAt
            };
      nextId += 1;
      events.unshift(recordedEvent);
      trimEvents();

      return recordedEvent;
    }) as TimelineStore["addEvent"],
    upsertConversationMessage,
    listEventPage(options = {}) {
      const sortedEvents = [...events].sort(compareEventsDescending);
      let startIndex = 0;
      if (options.cursor !== undefined) {
        const boundary = decodeCursor(options.cursor);
        const boundaryIndex = sortedEvents.findIndex(
          (event) => event.id === boundary.id && event.createdAt === boundary.createdAt
        );
        if (boundaryIndex < 0) {
          throw new TimelineCursorError(
            "timeline_cursor_expired",
            "The timeline cursor boundary is no longer retained"
          );
        }
        startIndex = boundaryIndex + 1;
      }
      const limit = normalizeLimit(options.limit);
      const pageEvents = sortedEvents.slice(startIndex, startIndex + limit);
      const lastEvent = pageEvents.at(-1);
      return {
        events: pageEvents,
        nextCursor:
          lastEvent && startIndex + pageEvents.length < sortedEvents.length
            ? encodeCursor(lastEvent)
            : null
      };
    },
    listEvents(options = {}) {
      return this.listEventPage(options).events;
    }
  };
}
