import { describe, expect, it } from "vitest";

import { createGroupMessageStore } from "../../../../src/server/services/groupMessages/createGroupMessageStore";

describe("createGroupMessageStore", () => {
  it("creates pending messages with per-target delivery state", () => {
    const store = createGroupMessageStore({
      now: () => new Date("2026-06-20T00:00:00.000Z")
    });
    const message = store.createMessage({
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSessions: ["xxvisa-review", "xxvisa-codex"],
      kind: "task",
      body: "Please review checkout.",
      warnings: []
    });

    expect(message).toMatchObject({
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSessions: ["xxvisa-review", "xxvisa-codex"],
      kind: "task",
      status: "pending",
      body: "Please review checkout.",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      replies: []
    });
    expect(message.id).toMatch(/^gm-/);
    expect(message.deliveries).toEqual([
      { sessionName: "xxvisa-review", status: "pending" },
      { sessionName: "xxvisa-codex", status: "pending" }
    ]);
  });

  it("tracks partial delivery failures without losing successful targets", () => {
    const store = createGroupMessageStore({
      now: () => new Date("2026-06-20T00:00:00.000Z")
    });
    const message = store.createMessage({
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSessions: ["xxvisa-review", "xxvisa-codex"],
      kind: "task",
      body: "Please review checkout.",
      warnings: []
    });

    store.markDelivery(message.id, "xxvisa-review", { status: "sent" });
    const updated = store.markDelivery(message.id, "xxvisa-codex", {
      status: "failed",
      error: "session not found"
    });

    expect(updated.status).toBe("partial");
    expect(updated.deliveries).toEqual([
      { sessionName: "xxvisa-review", status: "sent" },
      { sessionName: "xxvisa-codex", status: "failed", error: "session not found" }
    ]);
  });

  it("updates message status from replies and dedupes repeated reply content", () => {
    const store = createGroupMessageStore({
      now: () => new Date("2026-06-20T00:00:00.000Z")
    });
    const message = store.createMessage({
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSessions: ["xxvisa-review", "xxvisa-codex"],
      kind: "task",
      body: "Please review checkout.",
      warnings: []
    });

    store.markDelivery(message.id, "xxvisa-review", { status: "sent" });
    store.markDelivery(message.id, "xxvisa-codex", { status: "sent" });
    expect(
      store.addReplies(message.id, [
        {
          messageId: message.id,
          fromSession: "xxvisa-review",
          status: "done",
          body: "Looks good.",
          capturedAt: "2026-06-20T00:01:00.000Z"
        },
        {
          messageId: message.id,
          fromSession: "xxvisa-review",
          status: "done",
          body: "Looks good.",
          capturedAt: "2026-06-20T00:02:00.000Z"
        }
      ]).status
    ).toBe("partial");

    const replied = store.addReplies(message.id, [
      {
        messageId: message.id,
        fromSession: "xxvisa-codex",
        status: "ack",
        body: "Queued.",
        capturedAt: "2026-06-20T00:03:00.000Z"
      }
    ]);

    expect(replied.status).toBe("replied");
    expect(replied.replies).toHaveLength(2);
    expect(store.listProjectMessages("xxvisa")).toEqual([replied]);
  });

  it("deletes all messages for a project", () => {
    const store = createGroupMessageStore({
      now: () => new Date("2026-06-20T00:00:00.000Z")
    });

    store.createMessage({
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSessions: ["xxvisa-review"],
      kind: "task",
      body: "Review",
      warnings: []
    });
    store.createMessage({
      projectName: "local",
      fromSession: "local-pm",
      toSessions: ["local-worker"],
      kind: "task",
      body: "Review",
      warnings: []
    });

    store.deleteProjectMessages("xxvisa");

    expect(store.listProjectMessages("xxvisa")).toEqual([]);
    expect(store.listProjectMessages("local")).toHaveLength(1);
  });
});
