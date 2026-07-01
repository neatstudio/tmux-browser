import { describe, expect, it } from "vitest";

import { formatGroupMessage } from "../../../../src/server/services/groupMessages/formatGroupMessage";

describe("formatGroupMessage", () => {
  it("formats a task as JSON with required routing fields and reply template", () => {
    const text = formatGroupMessage({
      id: "gm-test-1",
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSession: "xxvisa-review",
      kind: "task",
      body: "Please review the diff.\nFocus on payment."
    });
    const payload = JSON.parse(text);

    expect(payload).toEqual({
      type: "tmux-ui.task",
      id: "gm-test-1",
      project: "xxvisa",
      from: "xxvisa-pm",
      to: "xxvisa-review",
      body: "Please review the diff.\nFocus on payment.",
      reply_with: {
        type: "tmux-ui.reply",
        id: "gm-test-1",
        from: "xxvisa-review",
        status: "done|blocked|need-input|ack",
        body: "..."
      }
    });
  });

  it("formats reports as JSON and strips terminal control characters from the body", () => {
    const text = formatGroupMessage({
      id: "gm-test-2",
      projectName: "xxvisa",
      fromSession: "xxvisa-codex",
      toSession: "xxvisa-pm",
      kind: "report",
      body: "\n\u001b[31mDone\u001b[0m\r\nNext: deploy.\n"
    });
    const payload = JSON.parse(text);

    expect(payload).toMatchObject({
      type: "tmux-ui.report",
      body: "Done\nNext: deploy."
    });
    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("\r");
  });
});
