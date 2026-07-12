export type TimelineEventType =
  | "session-created"
  | "session-renamed"
  | "session-killed"
  | "command-sent"
  | "conversation-message"
  | "group-message-sent"
  | "group-message-replied"
  | "pane-split"
  | "pane-selected"
  | "pane-killed"
  | "hook-event";

export type ConversationMessageRole = "user" | "assistant" | "tool";

export type ConversationMessageContentType =
  | "text"
  | "code"
  | "image"
  | "command";

export type ConversationMessageStatus = "streaming" | "complete" | "failed";

export type BaseTimelineEvent = {
  id: string;
  type: Exclude<TimelineEventType, "conversation-message">;
  sessionName: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ConversationMessageTimelineEvent = {
  id: string;
  type: "conversation-message";
  messageId: string;
  sessionName: string;
  role: ConversationMessageRole;
  contentType: ConversationMessageContentType;
  content: string;
  status: ConversationMessageStatus;
  createdAt: string;
  toolName: string | null;
  parentMessageId: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TimelineEvent = BaseTimelineEvent | ConversationMessageTimelineEvent;

export type TimelineEventDraft =
  | Omit<BaseTimelineEvent, "id" | "createdAt">
  | Omit<ConversationMessageTimelineEvent, "id" | "createdAt">;
