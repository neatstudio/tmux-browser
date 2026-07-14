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

  it("applies canonical metadata privacy and collision rules", () => {
    const message = normalizeConversationMessage({
      sessionName: "build",
      content: "done",
      metadata: {
        "API Token": "raw-token",
        Cookie: "raw-cookie",
        Authorization: "raw-auth",
        "Build-ID": "first",
        build_id: "second",
        filesChanged: 2,
        note: "safe"
      }
    });

    expect(message.metadata).toEqual({
      apitoken: "[redacted]",
      authorization: "[redacted]",
      buildid: "first",
      cookie: "[redacted]",
      fileschanged: 2,
      note: "safe"
    });
    expect(JSON.stringify(message)).not.toMatch(/raw-token|raw-cookie|raw-auth|second/);
  });
});
