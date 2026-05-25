export type SessionsInvalidatedReason =
  | "session-created"
  | "session-renamed"
  | "session-killed"
  | "command-sent"
  | "pane-split"
  | "pane-selected"
  | "pane-killed";

export type AppEventDraft = {
  type: "sessions-invalidated";
  reason: SessionsInvalidatedReason;
  sessionName?: string;
};

export type AppEvent = AppEventDraft & {
  id: string;
  createdAt: string;
};

export type AppEventSocketMessage = { type: "hello" } | AppEvent;
