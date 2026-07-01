import { describe, expect, it } from "vitest";

import { parseGroupReplies } from "../../../../src/server/services/groupMessages/parseGroupReplies";

describe("parseGroupReplies", () => {
  it("parses JSON reply objects from captured terminal output", () => {
    expect(
      parseGroupReplies(`
agent output
{"type":"tmux-ui.reply","id":"gm-test-json","from":"xxvisa-review","status":"done","body":"Reviewed JSON task."}
`)
    ).toEqual([
      {
        messageId: "gm-test-json",
        fromSession: "xxvisa-review",
        status: "done",
        body: "Reviewed JSON task."
      }
    ]);
  });

  it("parses JSON replies whose body contains braces", () => {
    expect(
      parseGroupReplies(`
{
  "type": "tmux-ui.reply",
  "id": "gm-test-braces",
  "from": "xxvisa-review",
  "status": "done",
  "body": "Created {\\\"ok\\\": true} payload."
}
`)
    ).toEqual([
      {
        messageId: "gm-test-braces",
        fromSession: "xxvisa-review",
        status: "done",
        body: "Created {\"ok\": true} payload."
      }
    ]);
  });

  it("parses valid reply blocks with required fields", () => {
    expect(
      parseGroupReplies(`
[tmux-ui:reply]
id: gm-test-1
from: xxvisa-review
status: done
body:
Reviewed the diff.
Looks safe.
[/tmux-ui:reply]
`)
    ).toEqual([
      {
        messageId: "gm-test-1",
        fromSession: "xxvisa-review",
        status: "done",
        body: "Reviewed the diff.\nLooks safe."
      }
    ]);
  });

  it("accepts whitespace and unknown keys while ignoring malformed blocks", () => {
    expect(
      parseGroupReplies(`
[tmux-ui:reply]
 id : gm-test-2
 from : xxvisa-codex
 ignored: value
 status : need-input
 body:
 Need API credentials.
[/tmux-ui:reply]
[tmux-ui:reply]
id: gm-test-3
from: xxvisa-codex
body:
Missing status.
[/tmux-ui:reply]
`)
    ).toEqual([
      {
        messageId: "gm-test-2",
        fromSession: "xxvisa-codex",
        status: "need-input",
        body: "Need API credentials."
      }
    ]);
  });

  it("dedupes identical replies by message, sender, and body", () => {
    const text = `
[tmux-ui:reply]
id: gm-test-4
from: xxvisa-codex
status: done
body:
Done.
[/tmux-ui:reply]
[tmux-ui:reply]
id: gm-test-4
from: xxvisa-codex
status: done
body:
Done.
[/tmux-ui:reply]
`;

    expect(parseGroupReplies(text)).toHaveLength(1);
  });
});
