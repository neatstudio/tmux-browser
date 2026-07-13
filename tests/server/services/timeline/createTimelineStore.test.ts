import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createTimelineStore,
  TimelineCursorError,
  TimelineStoreConflictError
} from "../../../../src/server/services/timeline/createTimelineStore";
import type {
  BaseTimelineEvent,
  ConversationMessageTimelineEvent,
  HookEventTimelineEvent,
  LegacyHookEventTimelineEvent,
  TimelineEvent
} from "../../../../src/shared/timeline";

const message = (
  overrides: Partial<Parameters<ReturnType<typeof createTimelineStore>["upsertConversationMessage"]>[0]> = {}
) => ({
  type: "conversation-message" as const,
  messageId: "message-1",
  sessionName: "build",
  role: "assistant" as const,
  contentType: "text" as const,
  content: "working",
  summary: null,
  status: "streaming" as const,
  toolName: null,
  parentMessageId: null,
  metadata: { nested: "value", count: 1 },
  ...overrides
});

function expectConflict(
  operation: () => unknown,
  code:
    | "invalid_revision"
    | "revision_required"
    | "stale_revision"
    | "revision_gap"
    | "immutable_field"
    | "terminal_conflict"
) {
  try {
    operation();
    throw new Error("expected timeline conflict");
  } catch (error) {
    expect(error).toBeInstanceOf(TimelineStoreConflictError);
    expect((error as TimelineStoreConflictError).code).toBe(code);
  }
}

describe("createTimelineStore", () => {
  it("paginates in descending createdAt and id order without overlap", () => {
    const store = createTimelineStore({ maxEvents: 10 });
    const createdAt = "2026-07-14T01:00:00.000Z";
    vi.useFakeTimers();
    vi.setSystemTime(createdAt);
    for (let index = 1; index <= 5; index += 1) {
      store.addEvent({
        type: "command-sent",
        sessionName: "build",
        message: `event ${index}`
      });
    }

    const first = store.listEventPage({ limit: 2 });
    const second = store.listEventPage({ limit: 2, cursor: first.nextCursor! });
    const third = store.listEventPage({ limit: 2, cursor: second.nextCursor! });

    expect(first.events.map(({ id }) => id)).toEqual(["5", "4"]);
    expect(second.events.map(({ id }) => id)).toEqual(["3", "2"]);
    expect(third.events.map(({ id }) => id)).toEqual(["1"]);
    expect(third.nextCursor).toBeNull();
    vi.useRealTimers();
  });

  it("keeps an older page cursor stable when newer events arrive", () => {
    const store = createTimelineStore({ maxEvents: 10 });
    for (let index = 1; index <= 4; index += 1) {
      store.addEvent({ type: "command-sent", sessionName: "build", message: String(index) });
    }
    const cursor = store.listEventPage({ limit: 2 }).nextCursor!;
    const before = store.listEventPage({ limit: 2, cursor });

    store.addEvent({ type: "command-sent", sessionName: "build", message: "new" });

    expect(store.listEventPage({ limit: 2, cursor })).toEqual(before);
  });

  it("caps a page independently of the retention limit", () => {
    const store = createTimelineStore({ maxEvents: 250 });
    for (let index = 0; index < 250; index += 1) {
      store.addEvent({ type: "command-sent", sessionName: "build", message: String(index) });
    }

    expect(store.listEventPage({ limit: 1000 }).events).toHaveLength(200);
    expect(store.listEvents({ limit: 1000 })).toHaveLength(200);
  });

  it("distinguishes malformed and evicted cursor boundaries", () => {
    const store = createTimelineStore({ maxEvents: 3 });
    for (let index = 1; index <= 3; index += 1) {
      store.addEvent({ type: "command-sent", sessionName: "build", message: String(index) });
    }
    expect(() => store.listEventPage({ cursor: "not-a-cursor" })).toThrowError(
      expect.objectContaining<TimelineCursorError>({ code: "timeline_cursor_invalid" })
    );

    const cursor = store.listEventPage({ limit: 2 }).nextCursor!;
    store.addEvent({ type: "command-sent", sessionName: "build", message: "4" });
    store.addEvent({ type: "command-sent", sessionName: "build", message: "5" });

    expect(() => store.listEventPage({ cursor })).toThrowError(
      expect.objectContaining<TimelineCursorError>({ code: "timeline_cursor_expired" })
    );
  });
  it("keeps addEvent append-only for repeated legacy conversation drafts", () => {
    const store = createTimelineStore();

    const first = store.addEvent(message());
    const second = store.addEvent(message({ content: "later snapshot" }));

    expect(second.id).not.toBe(first.id);
    expect(first).toMatchObject({ summary: null, revision: 1 });
    expect(first.createdAt).toBe(first.updatedAt);
    expect(second).toMatchObject({ summary: null, revision: 1 });
    expect(second.createdAt).toBe(second.updatedAt);
    expect(store.listEvents()).toEqual([second, first]);
  });

  it("forgets conversation identities after their records are trimmed", () => {
    const store = createTimelineStore({ maxEvents: 1 });
    store.upsertConversationMessage(message());
    const retained = store.upsertConversationMessage(
      message({ messageId: "message-2" })
    );

    expect(store.listEvents()).toEqual([retained]);
    expectConflict(
      () =>
        store.upsertConversationMessage(
          message({ revision: 2, content: "evicted update" })
        ),
      "invalid_revision"
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid maxEvents %s",
    (maxEvents) => {
      expect(() => createTimelineStore({ maxEvents })).toThrowError(
        new RangeError("maxEvents must be a finite positive integer")
      );
    }
  );

  it("creates a canonical conversation record at revision one", () => {
    const store = createTimelineStore();

    const created = store.upsertConversationMessage(message());

    expect(created).toMatchObject({
      id: expect.any(String),
      revision: 1,
      summary: null
    });
    expect(created.createdAt).toBe(created.updatedAt);
    expect(store.listEvents()).toEqual([created]);
  });

  it("upserts by session and message while preserving record identity", () => {
    const store = createTimelineStore();
    const created = store.upsertConversationMessage(message());

    const updated = store.upsertConversationMessage(
      message({
        revision: 2,
        content: "done",
        summary: "Completed build",
        status: "complete"
      })
    );

    expect(updated).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      revision: 2,
      content: "done",
      summary: "Completed build",
      status: "complete"
    });
    expect(store.listEvents()).toEqual([updated]);
  });

  it("requires an explicit next revision for an existing message", () => {
    const store = createTimelineStore();
    store.upsertConversationMessage(message());

    expectConflict(
      () => store.upsertConversationMessage(message({ content: "changed" })),
      "revision_required"
    );
  });

  it.each([2, Number.NaN, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid initial revision %s",
    (revision) => {
      const store = createTimelineStore();

      expectConflict(
        () => store.upsertConversationMessage(message({ revision })),
        "invalid_revision"
      );
    }
  );

  it.each([Number.NaN, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid update revision %s",
    (revision) => {
      const store = createTimelineStore();
      store.upsertConversationMessage(message());

      expectConflict(
        () => store.upsertConversationMessage(message({ revision })),
        "invalid_revision"
      );
    }
  );

  it("rejects stale revisions and revision gaps", () => {
    const store = createTimelineStore();
    store.upsertConversationMessage(message());
    store.upsertConversationMessage(message({ revision: 2, content: "new" }));

    expectConflict(
      () => store.upsertConversationMessage(message({ revision: 1 })),
      "stale_revision"
    );
    expectConflict(
      () => store.upsertConversationMessage(message({ revision: 4 })),
      "revision_gap"
    );
  });

  it("rejects changes to immutable conversation fields", () => {
    const store = createTimelineStore();
    store.upsertConversationMessage(message());

    expectConflict(
      () =>
        store.upsertConversationMessage(
          message({ revision: 2, role: "tool" })
        ),
      "immutable_field"
    );
  });

  it("treats same-revision semantic retries as idempotent regardless of metadata key order", () => {
    const store = createTimelineStore();
    store.upsertConversationMessage(message());
    const updated = store.upsertConversationMessage(
      message({
        revision: 2,
        content: "still working",
        metadata: { alpha: true, beta: 2 }
      })
    );

    const retry = store.upsertConversationMessage(
      message({
        revision: 2,
        content: "still working",
        metadata: { beta: 2, alpha: true }
      })
    );

    expect(retry).toBe(updated);
    expectConflict(
      () =>
        store.upsertConversationMessage(
          message({ revision: 2, content: "different" })
        ),
      "stale_revision"
    );
  });

  it("does not allow terminal records to regress or be overwritten", () => {
    const store = createTimelineStore();
    const complete = store.upsertConversationMessage(
      message({ status: "complete", content: "done" })
    );

    expect(
      store.upsertConversationMessage(
        message({ status: "complete", content: "done", revision: 1 })
      )
    ).toBe(complete);
    expectConflict(
      () =>
        store.upsertConversationMessage(
          message({ revision: 2, status: "streaming", content: "again" })
        ),
      "terminal_conflict"
    );
    expectConflict(
      () =>
        store.upsertConversationMessage(
          message({ revision: 2, status: "failed", content: "failed" })
        ),
      "terminal_conflict"
    );
  });

  it("models conversation and both hook record shapes explicitly", () => {
    expectTypeOf<
      Extract<BaseTimelineEvent["type"], "conversation-message">
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<BaseTimelineEvent["type"], "hook-event">
    >().toEqualTypeOf<never>();
    expectTypeOf<ConversationMessageTimelineEvent>().toMatchTypeOf<TimelineEvent>();
    expectTypeOf<HookEventTimelineEvent>().toMatchTypeOf<TimelineEvent>();
    expectTypeOf<LegacyHookEventTimelineEvent>().toMatchTypeOf<TimelineEvent>();
  });
});
