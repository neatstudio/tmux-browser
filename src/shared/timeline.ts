import type { HookEvent } from "./hookEvents.js";

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
  type: Exclude<TimelineEventType, "conversation-message" | "hook-event">;
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
  summary: string | null;
  status: ConversationMessageStatus;
  createdAt: string;
  revision: number;
  updatedAt: string;
  toolName: string | null;
  parentMessageId: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type HookEventTimelineEvent = HookEvent & {
  type: "hook-event";
  id: string;
  createdAt: string;
};

export type LegacyHookEventTimelineEvent = {
  type: "hook-event";
  id: string;
  sessionName: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TimelineEvent =
  | BaseTimelineEvent
  | ConversationMessageTimelineEvent
  | HookEventTimelineEvent
  | LegacyHookEventTimelineEvent;

export type ConversationMessageTimelineEventDraft = Omit<
  ConversationMessageTimelineEvent,
  "id" | "createdAt" | "updatedAt" | "revision" | "summary"
> & {
  summary?: string | null;
  revision?: number;
};

export type ConversationMessageUpsertDraft =
  ConversationMessageTimelineEventDraft;

export type TimelineEventDraft =
  | Omit<BaseTimelineEvent, "id" | "createdAt">
  | ConversationMessageTimelineEventDraft
  | Omit<HookEventTimelineEvent, "id" | "createdAt">
  | Omit<LegacyHookEventTimelineEvent, "id" | "createdAt">;
