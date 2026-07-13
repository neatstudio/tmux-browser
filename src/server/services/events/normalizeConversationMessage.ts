import type {
  ConversationMessageContentType,
  ConversationMessageRole,
  ConversationMessageStatus,
  ConversationMessageTimelineEventDraft
} from "../../../shared/timeline.js";
import { validateSessionName } from "../tmux/createTmuxService.js";
import { normalizeEventMetadata } from "./normalizeEventMetadata.js";

const CONVERSATION_CONTENT_LIMIT = 20_000;
const CONVERSATION_ID_LIMIT = 160;
const CONVERSATION_TOOL_LIMIT = 120;
export const CONVERSATION_SUMMARY_LIMIT = 320;

const ROLES = new Set<ConversationMessageRole>(["user", "assistant", "tool"]);
const CONTENT_TYPES = new Set<ConversationMessageContentType>(["text", "code", "image", "command"]);
const STATUSES = new Set<ConversationMessageStatus>(["streaming", "complete", "failed"]);

export class ConversationMessageNormalizationError extends Error {
  readonly statusCode = 400;

  constructor(
    message: string,
    readonly code?: "invalid_revision"
  ) {
    super(message);
  }
}

function trimmedString(value: unknown, maxLength: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength) || fallback;
}

function nullableString(value: unknown, maxLength: number) {
  return trimmedString(value, maxLength) || null;
}

function createMessageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeConversationMessage(body: unknown): ConversationMessageTimelineEventDraft {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const sessionName = trimmedString(payload.sessionName, 128);
  const content =
    typeof payload.content === "string" && payload.content.length > 0
      ? payload.content.slice(0, CONVERSATION_CONTENT_LIMIT)
      : null;

  try {
    validateSessionName(sessionName);
  } catch {
    throw new ConversationMessageNormalizationError("Invalid conversation session name");
  }
  if (!content) {
    throw new ConversationMessageNormalizationError("Conversation content is required");
  }

  const role = trimmedString(payload.role, 40, "assistant");
  const contentType = trimmedString(payload.contentType, 40, "text");
  const status = trimmedString(payload.status, 40, "complete");
  if (
    Object.prototype.hasOwnProperty.call(payload, "revision") &&
    typeof payload.revision !== "number"
  ) {
    throw new ConversationMessageNormalizationError(
      "The conversation message revision must be a finite integer",
      "invalid_revision"
    );
  }

  return {
    type: "conversation-message",
    messageId: nullableString(payload.messageId, CONVERSATION_ID_LIMIT) ?? createMessageId(),
    sessionName,
    role: ROLES.has(role as ConversationMessageRole)
      ? (role as ConversationMessageRole)
      : "assistant",
    contentType: CONTENT_TYPES.has(contentType as ConversationMessageContentType)
      ? (contentType as ConversationMessageContentType)
      : "text",
    content,
    summary: nullableString(payload.summary, CONVERSATION_SUMMARY_LIMIT),
    status: STATUSES.has(status as ConversationMessageStatus)
      ? (status as ConversationMessageStatus)
      : "complete",
    toolName: nullableString(payload.toolName, CONVERSATION_TOOL_LIMIT),
    parentMessageId: nullableString(payload.parentMessageId, CONVERSATION_ID_LIMIT),
    metadata: normalizeEventMetadata(payload.metadata),
    revision: typeof payload.revision === "number" ? payload.revision : undefined
  };
}
