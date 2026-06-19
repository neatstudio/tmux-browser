import type { GroupMessageKind } from "../../../shared/groupMessages.js";

export type FormatGroupMessageInput = {
  id: string;
  projectName: string;
  fromSession: string;
  toSession: string;
  kind: GroupMessageKind;
  body: string;
};

function sanitizeBody(body: string) {
  return body
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

export function formatGroupMessage(input: FormatGroupMessageInput) {
  const body = sanitizeBody(input.body);

  return [
    `[tmux-ui:${input.kind}]`,
    `id: ${input.id}`,
    `project: ${input.projectName}`,
    `from: ${input.fromSession}`,
    `to: ${input.toSession}`,
    "",
    body,
    "",
    "Reply with:",
    "[tmux-ui:reply]",
    `id: ${input.id}`,
    `from: ${input.toSession}`,
    "status: done|blocked|need-input|ack",
    "body:",
    "...",
    "[/tmux-ui:reply]",
    `[/tmux-ui:${input.kind}]`
  ].join("\n");
}
