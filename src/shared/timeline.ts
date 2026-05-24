export type TimelineEventType =
  | "session-created"
  | "session-renamed"
  | "session-killed"
  | "command-sent"
  | "pane-split"
  | "pane-selected"
  | "pane-killed";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  sessionName: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type TimelineEventDraft = Omit<TimelineEvent, "id" | "createdAt">;
