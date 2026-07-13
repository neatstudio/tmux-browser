import type { HookEvent } from "./hookEvents.js";
import type { ConversationMessageTimelineEvent } from "./timeline.js";

export type SessionsInvalidatedReason =
  | "session-created"
  | "session-renamed"
  | "session-killed"
  | "session-list-changed"
  | "command-sent"
  | "group-message-updated"
  | "pane-split"
  | "pane-selected"
  | "pane-killed";

export type GeneratedAppEventDraft =
  | {
      type: "sessions-invalidated";
      reason: SessionsInvalidatedReason;
      sessionName?: string;
    }
  | ({
      type: "hook-event";
    } & HookEvent);

export type AppEventDraft =
  | GeneratedAppEventDraft
  | ConversationMessageTimelineEvent;

export type AppEvent =
  | (GeneratedAppEventDraft & { id: string; createdAt: string })
  | ConversationMessageTimelineEvent;

export type AppEventSocketMessage = { type: "hello" } | AppEvent;
