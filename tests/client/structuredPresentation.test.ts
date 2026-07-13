import { describe, expect, it } from "vitest";

import {
  adaptStructuredRecord,
  deriveStructuredPresentation,
  materializeStructuredDetails
} from "../../src/client/structuredPresentation";
import { HOOK_EVENT_SCHEMA_VERSION } from "../../src/shared/hookEvents";
import type { TimelineEvent } from "../../src/shared/timeline";

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: "conversation-1",
  type: "conversation-message" as const,
  messageId: "message-1",
  sessionName: "api",
  role: "assistant" as const,
  contentType: "text" as const,
  content: " First paragraph.\n\nSecond paragraph. ",
  summary: null,
  status: "complete" as const,
  createdAt: "2026-07-14T01:00:00.000Z",
  updatedAt: "2026-07-14T01:00:00.000Z",
  revision: 1,
  toolName: null,
  parentMessageId: null,
  ...overrides
}) as TimelineEvent;

const typedHook = (overrides: Record<string, unknown> = {}) => ({
  id: "hook-1",
  type: "hook-event" as const,
  schemaVersion: HOOK_EVENT_SCHEMA_VERSION,
  source: "codex",
  sessionName: "api",
  eventType: "task",
  status: "done" as const,
  title: "Task update",
  body: "Body",
  cwd: null,
  taskId: null,
  severity: "info" as const,
  target: { sessionName: "api", projectName: null, view: "terminal" as const },
  actions: [],
  content: [],
  createdAt: "2026-07-14T01:00:00.000Z",
  ...overrides
}) as TimelineEvent;

describe("adaptStructuredRecord", () => {
  it("prefers and independently caps a producer conversation summary", () => {
    const item = adaptStructuredRecord(conversation({
      content: "content must not determine the summary cap",
      summary: `  ${"x".repeat(400)}  `
    }));

    expect(item?.summary).toBe("x".repeat(320));
    expect(item?.summarySource).toBe("producer");
  });

  it.each([
    ["text", "One line", "One line"],
    ["code", "const answer = 42", "Codex 输出了一段代码"],
    ["command", "npm test\nignored", "npm test"],
    ["image", "image-id", "发送了一张图片"]
  ])("uses deterministic %s fallbacks", (contentType, content, expected) => {
    expect(adaptStructuredRecord(conversation({ contentType, content }))?.summary)
      .toBe(expected);
  });

  it("uses conservative streaming, failed, and empty completion fallbacks", () => {
    expect(adaptStructuredRecord(conversation({ content: "", status: "streaming" }))?.summary)
      .toBe("正在输出…");
    expect(adaptStructuredRecord(conversation({ content: "", status: "failed" }))?.summary)
      .toBe("消息发送失败");
    expect(adaptStructuredRecord(conversation({ role: "tool", content: "" }))?.summary)
      .toBe("工具执行完成");
  });

  it.each(["text", "code", "command", "image"])(
    "uses ongoing wording for streaming %s content unless a producer summary exists",
    (contentType) => {
      const item = adaptStructuredRecord(conversation({
        contentType,
        content: "already emitted content",
        status: "streaming"
      }));
      expect(item?.summary).toBe("正在输出…");
      expect(item?.summary).not.toMatch(/完成|发送了|输出了一段/);

      expect(adaptStructuredRecord(conversation({
        contentType,
        content: "already emitted content",
        status: "streaming",
        summary: "Producer says work is in progress"
      }))?.summary).toBe("Producer says work is in progress");
    }
  );

  it("adapts typed hooks and applies the status, severity, approval, danger and stats rules", () => {
    const item = adaptStructuredRecord(typedHook({
      status: "done",
      severity: "warning",
      eventType: "approval-required",
      metadata: {
        fileschanged: 2,
        testspassed: 8,
        testsfailed: 1,
        durationms: 1250,
        filesChanged: 99,
        invalid: Number.POSITIVE_INFINITY
      },
      actions: [{
        id: "delete",
        label: "Delete",
        input: "yes",
        open: false,
        target: null,
        style: "danger"
      }]
    }));

    expect(item).toMatchObject({
      status: "complete",
      severity: "warning",
      attentionRequired: true,
      stats: { fileschanged: 2, testspassed: 8, testsfailed: 1, durationms: 1250 }
    });

    expect(adaptStructuredRecord(typedHook({ severity: "error", status: "info" })))
      .toMatchObject({ status: "failed", severity: "error", attentionRequired: true });
  });

  it("accepts an empty canonical event target and promotes failed tests visually only", () => {
    expect(adaptStructuredRecord(typedHook({
      target: { sessionName: null, projectName: null, view: "terminal" },
      metadata: { testsfailed: 2 }
    }))).toMatchObject({
      status: "complete",
      severity: "warning",
      attentionRequired: false,
      stats: { testsfailed: 2 }
    });
  });

  it("adapts legacy scalar and JSON metadata without inventing a session", () => {
    const item = adaptStructuredRecord({
      id: "legacy",
      type: "hook-event",
      sessionName: null,
      message: "Approve patch",
      createdAt: "2026-07-14T01:00:00.000Z",
      metadata: {
        status: "waiting",
        source: "codex",
        eventType: "approval-required",
        body: "Review changes",
        content: JSON.stringify([{ type: "summary", text: "Summary text" }]),
        target: JSON.stringify({ sessionName: null, projectName: "app", view: "kanban" }),
        actions: JSON.stringify([{ id: "send", label: "Send", input: "y", style: "primary" }])
      }
    });

    expect(item).toMatchObject({
      title: "Approve patch",
      summary: "Summary text",
      sessionName: null,
      attentionRequired: true
    });
    expect(item?.actions[0]).toMatchObject({ enabled: false, disabledReason: "目标会话不可用" });
  });

  it("normalizes unknown legacy status and severity to info", () => {
    expect(adaptStructuredRecord({
      id: "legacy-unknown",
      type: "hook-event",
      sessionName: "api",
      message: "Update",
      createdAt: "2026-07-14T01:00:00.000Z",
      metadata: { status: "mystery", severity: "critical" }
    })).toMatchObject({ status: "info", severity: "info", attentionRequired: false });
  });

  it("treats any malformed versioned hook as corrupt and read-only", () => {
    const item = adaptStructuredRecord({
      id: "corrupt",
      type: "hook-event",
      schemaVersion: HOOK_EVENT_SCHEMA_VERSION,
      sessionName: "api",
      title: "Pretends to be typed",
      status: "done",
      createdAt: "2026-07-14T01:00:00.000Z",
      actions: [{ id: "unsafe", label: "Unsafe", input: "y" }]
    } as TimelineEvent);

    expect(item).toMatchObject({
      summary: "事件数据损坏",
      severity: "error",
      attentionRequired: true,
      actions: []
    });
  });

  it("rejects malformed canonical action fields but drops only malformed legacy entries", () => {
    expect(adaptStructuredRecord(typedHook({
      actions: [{ id: "bad", label: "Bad", input: 42, open: false, target: null, style: "primary" }]
    }))).toMatchObject({ summary: "事件数据损坏", actions: [] });

    const legacy = adaptStructuredRecord({
      id: "legacy-partial",
      type: "hook-event",
      sessionName: "api",
      message: "Needs input",
      createdAt: "2026-07-14T01:00:00.000Z",
      metadata: {
        status: "waiting",
        actions: JSON.stringify([
          { id: "bad", style: "unknown" },
          { id: "good", label: "Good", input: "y", style: "primary" }
        ]),
        content: JSON.stringify([
          { type: "unknown", text: "bad" },
          { type: "summary", text: "Good summary" }
        ])
      }
    });
    expect(legacy?.summary).toBe("Good summary");
    expect(legacy?.actions.map((action) => action.id)).toEqual(["good"]);
  });

  it.each([
    ["missing source", { source: undefined }],
    ["missing severity", { severity: undefined }],
    ["missing body", { body: undefined }],
    ["missing cwd", { cwd: undefined }],
    ["missing task id", { taskId: undefined }],
    ["missing target", { target: undefined }],
    ["missing actions", { actions: undefined }],
    ["missing content", { content: undefined }],
    ["nullable session", { sessionName: null }],
    ["invalid body", { body: 1 }],
    ["invalid cwd", { cwd: false }],
    ["invalid task id", { taskId: 4 }],
    ["target missing view", { target: { sessionName: "api", projectName: null } }],
    ["target invalid session", { target: { sessionName: 1, projectName: null, view: "terminal" } }],
    ["action missing target", { actions: [{ id: "a", label: "A", input: null, open: true, style: "primary" }] }],
    ["action missing open", { actions: [{ id: "a", label: "A", input: null, target: null, style: "primary" }] }],
    ["summary non-string text", { content: [{ type: "summary", text: 1 }] }],
    ["code missing collapsed", { content: [{ type: "code", text: "x" }] }],
    ["details missing title", { content: [{ type: "details", text: "x", collapsed: true }] }],
    ["details missing collapsed", { content: [{ type: "details", title: "Details", text: "x" }] }]
  ])("makes a versioned hook corrupt when %s", (_label, overrides) => {
    expect(adaptStructuredRecord(typedHook(overrides))).toMatchObject({
      summary: "事件数据损坏",
      status: "failed",
      actions: []
    });
  });

  it("drops every duplicate action id and uses action targets before event targets", () => {
    const item = adaptStructuredRecord(typedHook({
      target: { sessionName: "event", projectName: null, view: "terminal" },
      actions: [
        { id: "duplicate", label: "A", input: "a", open: false, target: null, style: "primary" },
        { id: "duplicate", label: "B", input: "b", open: false, target: null, style: "primary" },
        {
          id: "unique", label: "Open", input: null, open: true, style: "secondary",
          target: { sessionName: "action", projectName: null, view: "terminal" }
        }
      ]
    }));

    expect(item?.actions).toHaveLength(1);
    expect(item?.actions[0]).toMatchObject({ id: "unique", target: { sessionName: "action" } });
  });

  it("keeps details lazy and honors expanded collapsed:false outside toast", () => {
    const item = adaptStructuredRecord(typedHook({
      content: [{ type: "code", text: "const x = 1", collapsed: false }]
    }));

    expect(item?.details[0]).not.toHaveProperty("text");
    const expandedCode = materializeStructuredDetails(item!, { view: "expanded" })
      .find((block) => block.type === "code");
    const toastCode = materializeStructuredDetails(item!, { view: "toast" })
      .find((block) => block.type === "code");
    expect(expandedCode)
      .toMatchObject({ text: "const x = 1", collapsed: false });
    expect(toastCode)
      .toMatchObject({ collapsed: true });
  });
});

describe("deriveStructuredPresentation", () => {
  it("groups tool children, promotes child attention, and leaves orphans independent", () => {
    const parent = adaptStructuredRecord(conversation())!;
    const failedChild = adaptStructuredRecord(conversation({
      id: "tool-event",
      messageId: "tool-message",
      role: "tool",
      parentMessageId: "message-1",
      status: "failed",
      content: "failed"
    }))!;
    const orphan = adaptStructuredRecord(conversation({
      id: "orphan-event",
      messageId: "orphan",
      role: "tool",
      parentMessageId: "missing"
    }))!;

    const result = deriveStructuredPresentation([parent, failedChild, orphan]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "conversation-1", toolStepCount: 1, attentionRequired: true });
    expect(result[0]?.children).toHaveLength(1);
    expect(result[1]).toMatchObject({ id: "orphan-event", toolStepCount: 0 });
  });

  it("keeps canonical ids and scopes equal message ids by session", () => {
    const apiParent = adaptStructuredRecord(conversation({
      id: "api-parent-record", sessionName: "api", messageId: "same-message"
    }))!;
    const webParent = adaptStructuredRecord(conversation({
      id: "web-parent-record", sessionName: "web", messageId: "same-message"
    }))!;
    const apiChild = adaptStructuredRecord(conversation({
      id: "api-child-record", sessionName: "api", messageId: "api-tool",
      role: "tool", parentMessageId: "same-message"
    }))!;
    const webChild = adaptStructuredRecord(conversation({
      id: "web-child-record", sessionName: "web", messageId: "web-tool",
      role: "tool", parentMessageId: "same-message"
    }))!;

    expect([apiParent.id, webParent.id, apiChild.id, webChild.id]).toEqual([
      "api-parent-record", "web-parent-record", "api-child-record", "web-child-record"
    ]);
    const result = deriveStructuredPresentation([apiParent, webParent, apiChild, webChild]);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.id === "api-parent-record")?.children.map((item) => item.id))
      .toEqual(["api-child-record"]);
    expect(result.find((item) => item.id === "web-parent-record")?.children.map((item) => item.id))
      .toEqual(["web-child-record"]);
  });
});
