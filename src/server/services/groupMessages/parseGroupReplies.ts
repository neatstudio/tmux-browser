import type {
  GroupReplyStatus,
  ParsedGroupMessageReply
} from "../../../shared/groupMessages.js";

const REPLY_BLOCK_PATTERN = /\[tmux-ui:reply\]([\s\S]*?)\[\/tmux-ui:reply\]/g;
const JSON_REPLY_TYPE_PATTERN = /"type"\s*:\s*"tmux-ui\.reply"/g;
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

function parseJsonReply(value: unknown): ParsedGroupMessageReply | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (record.type !== "tmux-ui.reply") {
    return null;
  }

  const messageId = typeof record.id === "string" ? record.id.trim() : "";
  const fromSession = typeof record.from === "string" ? record.from.trim() : "";
  const status = typeof record.status === "string"
    ? (record.status.trim() as GroupReplyStatus)
    : undefined;
  const body = typeof record.body === "string" ? record.body.trim() : "";

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

function parseJsonReplies(output: string) {
  const replies: ParsedGroupMessageReply[] = [];

  for (const jsonText of extractJsonReplyObjects(output)) {
    try {
      const reply = parseJsonReply(JSON.parse(jsonText));

      if (reply) {
        replies.push(reply);
      }
    } catch {
      // Captured panes often contain partial JSON while an agent is typing.
    }
  }

  return replies;
}

function findJsonObjectStart(output: string, fromIndex: number) {
  for (let index = fromIndex; index >= 0; index -= 1) {
    if (output[index] === "{") {
      return index;
    }
  }

  return -1;
}

function findJsonObjectEnd(output: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < output.length; index += 1) {
    const char = output[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return -1;
}

function extractJsonReplyObjects(output: string) {
  const objects: string[] = [];

  for (const match of output.matchAll(JSON_REPLY_TYPE_PATTERN)) {
    const startIndex = findJsonObjectStart(output, match.index ?? 0);

    if (startIndex < 0) {
      continue;
    }

    const endIndex = findJsonObjectEnd(output, startIndex);

    if (endIndex < 0) {
      continue;
    }

    objects.push(output.slice(startIndex, endIndex));
  }

  return objects;
}

export function parseGroupReplies(output: string) {
  const replies: ParsedGroupMessageReply[] = [];
  const seen = new Set<string>();

  for (const reply of parseJsonReplies(output)) {
    const key = getReplyDedupeKey(reply);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    replies.push(reply);
  }

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
