import type {
  GroupReplyStatus,
  ParsedGroupMessageReply
} from "../../../shared/groupMessages.js";

const REPLY_BLOCK_PATTERN = /\[tmux-ui:reply\]([\s\S]*?)\[\/tmux-ui:reply\]/g;
const VALID_STATUSES = new Set<GroupReplyStatus>([
  "done",
  "blocked",
  "need-input",
  "ack"
]);

function parseKeyValueLine(line: string) {
  const match = line.match(/^\s*([a-zA-Z-]+)\s*:\s*(.*?)\s*$/);

  if (!match) {
    return null;
  }

  return {
    key: match[1].toLowerCase(),
    value: match[2]
  };
}

function parseReplyBlock(block: string): ParsedGroupMessageReply | null {
  const lines = block.replace(/\r\n?/g, "\n").split("\n");
  const fields = new Map<string, string>();
  const bodyStartIndex = lines.findIndex(
    (line) => parseKeyValueLine(line)?.key === "body"
  );

  for (const line of bodyStartIndex >= 0 ? lines.slice(0, bodyStartIndex) : lines) {
    const parsed = parseKeyValueLine(line);

    if (parsed) {
      fields.set(parsed.key, parsed.value);
    }
  }

  if (bodyStartIndex >= 0) {
    const bodyHeader = parseKeyValueLine(lines[bodyStartIndex]);
    const bodyInlineValue = bodyHeader?.value ? [bodyHeader.value] : [];
    fields.set(
      "body",
      [...bodyInlineValue, ...lines.slice(bodyStartIndex + 1)].join("\n").trim()
    );
  }

  const messageId = fields.get("id")?.trim();
  const fromSession = fields.get("from")?.trim();
  const status = fields.get("status")?.trim() as GroupReplyStatus | undefined;
  const body = fields.get("body")?.trim();

  if (!messageId || !fromSession || !status || !body || !VALID_STATUSES.has(status)) {
    return null;
  }

  return {
    messageId,
    fromSession,
    status,
    body
  };
}

function getReplyDedupeKey(reply: ParsedGroupMessageReply) {
  return `${reply.messageId}\u0000${reply.fromSession}\u0000${reply.body}`;
}

export function parseGroupReplies(output: string) {
  const replies: ParsedGroupMessageReply[] = [];
  const seen = new Set<string>();

  for (const match of output.matchAll(REPLY_BLOCK_PATTERN)) {
    const reply = parseReplyBlock(match[1]);

    if (!reply) {
      continue;
    }

    const key = getReplyDedupeKey(reply);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    replies.push(reply);
  }

  return replies;
}
