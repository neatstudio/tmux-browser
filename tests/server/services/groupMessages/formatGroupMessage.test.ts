import { describe, expect, it } from "vitest";

import { formatGroupMessage } from "../../../../src/server/services/groupMessages/formatGroupMessage";

describe("formatGroupMessage", () => {
  it("formats a task block with required routing fields and reply template", () => {
    const text = formatGroupMessage({
      id: "gm-test-1",
      projectName: "xxvisa",
      fromSession: "xxvisa-pm",
      toSession: "xxvisa-review",
      kind: "task",
      body: "Please review the diff.\nFocus on payment."
    });

    expect(text).toContain("[tmux-ui:task]");
    expect(text).toContain("id: gm-test-1");
    expect(text).toContain("project: xxvisa");
    expect(text).toContain("from: xxvisa-pm");
    expect(text).toContain("to: xxvisa-review");
    expect(text).toContain("Please review the diff.\nFocus on payment.");
    expect(text).toContain("[tmux-ui:reply]");
    expect(text).toContain("status: done|blocked|need-input|ack");
    expect(text).toContain("[/tmux-ui:task]");
  });

  it("formats report blocks and strips terminal control characters from the body", () => {
    const text = formatGroupMessage({
      id: "gm-test-2",
      projectName: "xxvisa",
      fromSession: "xxvisa-codex",
      toSession: "xxvisa-pm",
      kind: "report",
      body: "\n\u001b[31mDone\u001b[0m\r\nNext: deploy.\n"
    });

    expect(text).toContain("[tmux-ui:report]");
    expect(text).toContain("Done\nNext: deploy.");
    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("\r");
    expect(text).toContain("[/tmux-ui:report]");
  });
});
