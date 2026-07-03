export type HookEventStatus =
  | "waiting"
  | "blocked"
  | "need-input"
  | "running"
  | "done"
  | "failed"
  | "info";

export type HookEventSeverity = "info" | "warning" | "error";

export type HookEvent = {
  source: string;
  sessionName: string;
  eventType: string;
  status: HookEventStatus;
  title: string;
  body: string | null;
  cwd: string | null;
  taskId: string | null;
  severity: HookEventSeverity;
  metadata?: Record<string, string | number | boolean | null>;
};
