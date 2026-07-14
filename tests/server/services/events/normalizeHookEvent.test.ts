import { describe, expect, it } from "vitest";

import { normalizeHookEvent } from "../../../../src/server/services/events/normalizeHookEvent";

describe("normalizeHookEvent", () => {
  it("preserves hook defaults, actions, content, and safe metadata", () => {
    expect(normalizeHookEvent({
      sessionName: "build",
      metadata: { password: "hidden", filesChanged: 2 },
      actions: [{ label: "Approve", input: "y\r" }],
      content: [{ type: "details", text: "why" }]
    })).toEqual({
      schemaVersion: "tmux-ui.hook/v1",
      source: "custom",
      sessionName: "build",
      eventType: "event",
      status: "info",
      title: "custom event",
      body: null,
      cwd: null,
      taskId: null,
      severity: "info",
      target: { sessionName: "build", projectName: null, view: "terminal" },
      actions: [{
        id: "action-1",
        label: "Approve",
        input: "y\r",
        open: false,
        target: null,
        style: "secondary"
      }],
      content: [{ type: "details", title: "Details", text: "why", collapsed: true }],
      metadata: { fileschanged: 2, password: "[redacted]" }
    });
  });

  it("rejects invalid hook and target session names", () => {
    expect(() => normalizeHookEvent({ sessionName: "bad name" })).toThrowError("Invalid hook session name");
    expect(() => normalizeHookEvent({
      sessionName: "build",
      target: { sessionName: "bad name" }
    })).toThrowError("Invalid hook target session name");
  });
});
