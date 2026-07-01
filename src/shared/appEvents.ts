import type { HookEvent } from "./hookEvents.js";

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

export type AppEventDraft =
  | {
      type: "sessions-invalidated";
      reason: SessionsInvalidatedReason;
      sessionName?: string;
    }
  | ({
      type: "hook-event";
    } & HookEvent);

export type AppEvent = AppEventDraft & {
  id: string;
  createdAt: string;
};

export type AppEventSocketMessage = { type: "hello" } | AppEvent;
