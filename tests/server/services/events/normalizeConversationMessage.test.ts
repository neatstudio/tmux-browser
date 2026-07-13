import { describe, expect, it } from "vitest";

import {
  CONVERSATION_SUMMARY_LIMIT,
  normalizeConversationMessage
} from "../../../../src/server/services/events/normalizeConversationMessage";

describe("normalizeConversationMessage", () => {
  it("normalizes a trimmed summary with an independent length limit", () => {
    const message = normalizeConversationMessage({
      sessionName: " build ",
      content: "x".repeat(20_000),
      summary: `  ${"s".repeat(CONVERSATION_SUMMARY_LIMIT + 20)}  `,
      revision: 2
    });

    expect(message.sessionName).toBe("build");
    expect(message.content).toHaveLength(20_000);
    expect(message.summary).toBe("s".repeat(CONVERSATION_SUMMARY_LIMIT));
    expect(message.revision).toBe(2);
  });

  it("normalizes missing and invalid optional summaries to null", () => {
    expect(
      normalizeConversationMessage({ sessionName: "build", content: "done" }).summary
    ).toBeNull();
    expect(
      normalizeConversationMessage({
        sessionName: "build",
        content: "done",
        summary: "   "
      }).summary
    ).toBeNull();
    expect(
      normalizeConversationMessage({
        sessionName: "build",
        content: "done",
        summary: 42
      }).summary
    ).toBeNull();
  });
});
