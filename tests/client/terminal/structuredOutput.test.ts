import { describe, expect, it } from "vitest";

import {
  deriveTerminalAgentTranscript,
  deriveTerminalOutputPresentation,
  deriveTerminalStructuredOutput,
  shouldRenderTerminalOutputPresentation
} from "../../../src/client/terminal/structuredOutput";
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
  it("keeps ordinary terminal output in the raw terminal view", () => {
    const output = deriveTerminalOutputPresentation(
      "shell",
      [],
      "npm test\nTest Files 3 passed\n$ "
    );

    expect(output).toEqual({ items: [], transcript: null });
  });

  it("does not treat repetitive terminal output as Agent output", () => {
    const output = [
      "64 bytes from 47.91.99.137: icmp_seq=1 ttl=78 time=161.1 ms",
      "64 bytes from 47.91.99.137: icmp_seq=2 ttl=78 time=162.3 ms",
      "64 bytes from 47.91.99.137: icmp_seq=3 ttl=78 time=160.8 ms"
    ].join("\n");

    const presentation = deriveTerminalOutputPresentation("hermes", [], output);

    expect(presentation).toEqual({ items: [], transcript: null });
  });

  it("skips the structured renderer for ordinary output with no existing overlay", () => {
    const presentation = deriveTerminalOutputPresentation(
      "shell",
      [],
      "64 bytes from host: icmp_seq=1\n64 bytes from host: icmp_seq=2"
    );
    expect(shouldRenderTerminalOutputPresentation(presentation, false)).toBe(false);
    expect(shouldRenderTerminalOutputPresentation(presentation, true)).toBe(true);
  });

  it("keeps agent narration visible while collapsing process records", () => {
    const transcript = deriveTerminalAgentTranscript([
      "• 已确认 Ctrl+C 映射恢复正常。",
      "",
      "• Ran npm test -- tests/client/terminal/structuredOutput.test.ts",
      "  ✓ 65 tests passed",
      "",
      "• Explored",
      "  └ Read structuredOutput.ts, terminalStructuredOutput.ts",
      "",
      "• Edited src/client/terminal/structuredOutput.ts (+1 -1)",
      "    115    timelineEvents: TimelineEvent[]",
      "    116 +  visibleText = \"\"",
      "",
      "• 我再补一项普通 shell 回归。",
      "",
      "• Viewed Image",
      "  └ /tmp/preview.png",
      "[tmux-ui:codex*                                      \"Mac\" 15:43 15-Jul-26"
    ].join("\n"));

    expect(transcript).toMatchObject({
      blocks: [
        { kind: "narrative", text: "• 已确认 Ctrl+C 映射恢复正常。\n" },
        {
          kind: "activity",
          title: "Ran",
          text: "Ran npm test -- tests/client/terminal/structuredOutput.test.ts\n✓ 65 tests passed"
        },
        { kind: "narrative", blankLineCount: 1 },
        {
          kind: "activity",
          title: "Explored",
          text: "Explored\n└ Read structuredOutput.ts, terminalStructuredOutput.ts"
        },
        { kind: "narrative", blankLineCount: 1 },
        {
          kind: "activity",
          title: "Edited",
          text: "Edited src/client/terminal/structuredOutput.ts (+1 -1)\n115    timelineEvents: TimelineEvent[]\n116 +  visibleText = \"\""
        },
        { kind: "narrative", text: "\n• 我再补一项普通 shell 回归。\n" },
        { kind: "activity", title: "Viewed Image", text: "Viewed Image\n└ /tmp/preview.png" }
      ]
    });
  });

  it("attaches styled xterm lines to their transcript blocks by absolute line", () => {
    const styledLines = [
      { absoluteLine: 50, spans: [{ text: "• Visible conclusion", style: { color: "#8bb8ff" } }] },
      { absoluteLine: 51, spans: [{ text: "• Ran npm test", style: { color: "#92d192", bold: true as const } }] },
      { absoluteLine: 52, spans: [{ text: "  ✓ passed", style: { color: "#92d192" } }] },
      { absoluteLine: 53, spans: [{ text: "• Explored", style: { italic: true as const } }] },
      { absoluteLine: 54, spans: [{ text: "  └ Read file", style: { dim: true as const } }] }
    ];
    const transcript = deriveTerminalAgentTranscript([
      "• Visible conclusion",
      "• Ran npm test",
      "  ✓ passed",
      "• Explored",
      "  └ Read file"
    ].join("\n"), 50, styledLines);

    expect(transcript?.blocks[0]).toMatchObject({
      kind: "narrative",
      styledLines: [{ absoluteLine: 50 }]
    });
    expect(transcript?.blocks[1]).toMatchObject({
      kind: "activity",
      styledLines: [{ absoluteLine: 51 }, { absoluteLine: 52 }]
    });
  });

  it("keeps physical blank lines when narration also has xterm styles", () => {
    const styledLines = [
      { absoluteLine: 60, spans: [{ text: "First conclusion", style: { color: "#8bb8ff" } }] },
      { absoluteLine: 61, spans: [] },
      { absoluteLine: 62, spans: [] },
      { absoluteLine: 63, spans: [{ text: "Second conclusion", style: { color: "#92d192" } }] },
      { absoluteLine: 64, spans: [{ text: "• Ran npm test", style: { color: "#e6c384" } }] },
      { absoluteLine: 65, spans: [{ text: "• Explored", style: { color: "#8bb8ff" } }] }
    ];
    const transcript = deriveTerminalAgentTranscript([
      "First conclusion",
      "",
      "",
      "Second conclusion",
      "• Ran npm test",
      "• Explored"
    ].join("\n"), 60, styledLines);

    expect(transcript?.blocks[0]).toMatchObject({
      kind: "narrative",
      text: "First conclusion\n\n\nSecond conclusion",
      styledLines: [
        { absoluteLine: 60 },
        { absoluteLine: 61, spans: [] },
        { absoluteLine: 62, spans: [] },
        { absoluteLine: 63 }
      ]
    });
  });

  it("keeps a wrapped process heading inside the collapsed activity", () => {
    const styledLines = [
      { absoluteLine: 80, wrapped: false, spans: [{ text: "• Ran node --input-", style: { color: "#92d192" } }] },
      { absoluteLine: 81, wrapped: true, spans: [{ text: "type=module", style: { color: "#92d192" } }] },
      { absoluteLine: 82, wrapped: false, spans: [{ text: "  ✓ passed", style: { color: "#92d192" } }] },
      { absoluteLine: 83, wrapped: false, spans: [{ text: "• Explored", style: { color: "#8bb8ff" } }] },
      { absoluteLine: 84, wrapped: false, spans: [{ text: "  └ Read file", style: { dim: true as const } }] }
    ];
    const transcript = deriveTerminalAgentTranscript([
      "• Ran node --input-",
      "type=module",
      "  ✓ passed",
      "• Explored",
      "  └ Read file"
    ].join("\n"), 80, styledLines);

    expect(transcript?.blocks).toMatchObject([
      {
        kind: "activity",
        title: "Ran",
        text: "Ran node --input-type=module\n✓ passed",
        styledLines: [{ absoluteLine: 80 }, { absoluteLine: 81 }, { absoluteLine: 82 }]
      },
      { kind: "activity", title: "Explored" }
    ]);
    expect(transcript?.blocks.some((block) => block.kind === "narrative"))
      .toBe(false);
  });

  it("preserves consecutive physical blank lines inside narration", () => {
    const transcript = deriveTerminalAgentTranscript([
      "• First conclusion.",
      "",
      "",
      "• Second conclusion.",
      "• Ran npm test",
      "  ✓ passed",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"));

    expect(transcript?.blocks[0]).toMatchObject({
      kind: "narrative",
      text: "• First conclusion.\n\n\n• Second conclusion."
    });
  });

  it("keeps activities separated only by blank lines in one group", () => {
    const transcript = deriveTerminalAgentTranscript([
      "• Ran npm test",
      "  ✓ passed",
      "",
      "",
      "• Explored",
      "  └ Read structuredOutput.ts",
      "A non-empty conclusion ends the group.",
      "",
      "• Edited src/client/terminal/structuredOutput.ts",
      "  └ Preserved blank lines"
    ].join("\n"));
    const activities = transcript?.blocks.filter(
      (block) => block.kind === "activity"
    ) ?? [];

    expect(activities.map((block) => block.groupId)).toEqual([
      "activity-group:0",
      "activity-group:0",
      "activity-group:1"
    ]);
    expect(transcript?.blocks.filter(
      (block) => block.kind === "narrative" && block.blankLineCount !== undefined
    ).map((block) => block.blankLineCount)).toEqual([2]);
  });

  it("keeps an indented process-like bullet as narration", () => {
    const transcript = deriveTerminalAgentTranscript([
      "  • Ran nested task",
      "• Ran npm test",
      "  ✓ passed",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"));

    expect(transcript?.blocks).toMatchObject([
      { kind: "narrative", text: "  • Ran nested task" },
      { kind: "activity", title: "Ran" },
      { kind: "activity", title: "Explored" }
    ]);
  });

  it("uses the transcript only when the session has no declared conversation message", () => {
    const visibleText = [
      "• Ran npm test",
      "  ✓ 65 tests passed",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n");

    expect(deriveTerminalOutputPresentation("project-codex", [], visibleText)).toMatchObject({
      items: [],
      transcript: {
        blocks: [
          { kind: "activity", title: "Ran" },
          { kind: "activity", title: "Explored" }
        ]
      }
    });
    expect(deriveTerminalOutputPresentation("project-codex", [conversation()], visibleText))
      .toMatchObject({
        items: [{ id: "conversation-1" }],
        transcript: null
      });
  });

  it("keeps an unopened terminal in the raw view before its first visible-text snapshot", () => {
    expect(deriveTerminalOutputPresentation("shell", [], undefined as never)).toEqual({
      items: [],
      transcript: null
    });
  });

  it("does not swallow unbulleted narration and keeps an activity identity stable as the viewport moves", () => {
    const original = deriveTerminalAgentTranscript([
      "• Ran npm test",
      "  ✓ 65 tests passed",
      "This conclusion must remain visible.",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"), 100);
    const shifted = deriveTerminalAgentTranscript([
      "• Earlier visible narration.",
      "• Ran npm test",
      "  ✓ 65 tests passed",
      "This conclusion must remain visible.",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"), 99);

    expect(original).toMatchObject({
      blocks: [
        { kind: "activity", title: "Ran", text: expect.stringContaining("Ran npm test") },
        { kind: "narrative", text: "This conclusion must remain visible." },
        { kind: "activity", title: "Explored" }
      ]
    });
    expect(shifted).toMatchObject({
      blocks: [
        { kind: "narrative", text: "• Earlier visible narration." },
        { kind: "activity", title: "Ran", text: expect.stringContaining("Ran npm test") },
        { kind: "narrative", text: "This conclusion must remain visible." },
        { kind: "activity", title: "Explored" }
      ]
    });
    expect(original?.blocks.find((block) => block.kind === "activity")?.id)
      .toBe(shifted?.blocks.find((block) => block.kind === "activity")?.id);
  });

  it("does not mistake one shell line that resembles a Codex process record for a transcript", () => {
    expect(deriveTerminalAgentTranscript([
      "• Ran npm test",
      "  ✓ shell output"
    ].join("\n"))).toBeNull();
  });

  it("gives repeated process records unique identities that survive a narrative prefix", () => {
    const source = [
      "• Ran npm test",
      "  ✓ first run",
      "• Ran npm test",
      "  ✓ second run",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ];
    const original = deriveTerminalAgentTranscript(source.join("\n"), 100);
    const shifted = deriveTerminalAgentTranscript([
      "• A newly visible conclusion.",
      ...source
    ].join("\n"), 99);
    const activityIds = (transcript: typeof original) =>
      transcript?.blocks
        .filter((block) => block.kind === "activity" && block.title === "Ran")
        .map((block) => block.id) ?? [];

    expect(new Set(activityIds(original)).size).toBe(2);
    expect(activityIds(shifted)).toEqual(activityIds(original));
  });

  it("keeps the remaining repeated process identity after the earlier copy scrolls away", () => {
    const full = deriveTerminalAgentTranscript([
      "• Ran npm test",
      "  ✓ first run",
      "• Ran npm test",
      "  ✓ second run",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"), 0);
    const clipped = deriveTerminalAgentTranscript([
      "• Ran npm test",
      "  ✓ second run",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"), 2);
    const ranIds = (transcript: typeof full) =>
      transcript?.blocks.filter(
        (block) => block.kind === "activity" && block.title === "Ran"
      ).map((block) => block.id) ?? [];

    expect(ranIds(clipped)[0]).toBe(ranIds(full)[1]);
  });

  it("keeps an identical repeated process identity when its earlier copy scrolls away", () => {
    const full = deriveTerminalAgentTranscript([
      "• Ran npm test",
      "  ✓ 76 tests passed",
      "• Ran npm test",
      "  ✓ 76 tests passed",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"), 200);
    const clipped = deriveTerminalAgentTranscript([
      "• Ran npm test",
      "  ✓ 76 tests passed",
      "• Explored",
      "  └ Read structuredOutput.ts"
    ].join("\n"), 202);
    const ranIds = (transcript: typeof full) =>
      transcript?.blocks.filter(
        (block) => block.kind === "activity" && block.title === "Ran"
      ).map((block) => block.id) ?? [];

    expect(new Set(ranIds(full)).size).toBe(2);
    expect(ranIds(clipped)[0]).toBe(ranIds(full)[1]);
  });

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
