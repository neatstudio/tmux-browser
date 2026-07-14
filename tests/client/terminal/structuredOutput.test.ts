import { describe, expect, it } from "vitest";

import { deriveTerminalStructuredOutput } from "../../../src/client/terminal/structuredOutput";
import type { TimelineEvent } from "../../../src/shared/timeline";

function conversation(
  overrides: Partial<Extract<TimelineEvent, { type: "conversation-message" }>> = {}
) {
  return {
    id: "conversation-1",
    type: "conversation-message" as const,
    messageId: "message-1",
    sessionName: "project-codex",
    role: "assistant" as const,
    contentType: "text" as const,
    content: "Completed the focused test suite.\n\nFull implementation details.",
    summary: "Focused tests passed",
    status: "complete" as const,
    createdAt: "2026-07-14T08:00:00.000Z",
    updatedAt: "2026-07-14T08:00:00.000Z",
    revision: 1,
    toolName: null,
    parentMessageId: null,
    ...overrides
  } satisfies Extract<TimelineEvent, { type: "conversation-message" }>;
}

describe("deriveTerminalStructuredOutput", () => {
  it("keeps only assistant and tool records for the requested session", () => {
    const items = deriveTerminalStructuredOutput("project-codex", [
      conversation(),
      conversation({ id: "tool-1", role: "tool", toolName: "npm" }),
      conversation({ id: "user-1", role: "user" }),
      conversation({ id: "other-session", sessionName: "project-claude" }),
      {
        id: "session-event",
        type: "session-created" as const,
        sessionName: "project-codex",
        message: "created",
        createdAt: "2026-07-14T09:00:00.000Z"
      }
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.id)).toEqual(["conversation-1", "tool-1"]);
    expect(items.map((item) => item.role)).toEqual(["assistant", "tool"]);
  });

  it("keeps the latest revision once and orders items by updated time", () => {
    const items = deriveTerminalStructuredOutput("project-codex", [
      conversation({
        summary: "Old streaming summary",
        status: "streaming",
        revision: 1,
        updatedAt: "2026-07-14T08:00:00.000Z"
      }),
      conversation({
        summary: "Final summary",
        content: "Final complete content",
        revision: 2,
        updatedAt: "2026-07-14T08:02:00.000Z"
      }),
      conversation({
        id: "newer-message",
        messageId: "message-2",
        summary: "Newest summary",
        updatedAt: "2026-07-14T08:03:00.000Z"
      })
    ]);

    expect(items.map((item) => item.id)).toEqual([
      "newer-message",
      "conversation-1"
    ]);
    expect(items[1]).toMatchObject({
      summary: "Final summary",
      status: "complete"
    });
    expect(items[1]?.details[0]?.materialize()).toBe("Final complete content");
  });

  it("preserves an explicit failure reason in the compact item", () => {
    const [item] = deriveTerminalStructuredOutput("project-codex", [
      conversation({
        status: "failed",
        summary: "npm test failed: snapshot mismatch"
      })
    ]);

    expect(item).toMatchObject({
      status: "failed",
      severity: "error",
      summary: "npm test failed: snapshot mismatch"
    });
  });
});
