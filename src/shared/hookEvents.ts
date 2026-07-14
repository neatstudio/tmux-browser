export type HookEventStatus =
  | "waiting"
  | "blocked"
  | "need-input"
  | "running"
  | "done"
  | "failed"
  | "info";

export type HookEventSeverity = "info" | "warning" | "error";

export const HOOK_EVENT_SCHEMA_VERSION = "tmux-ui.hook/v1" as const;

export type HookEventTargetView = "terminal" | "kanban";

export type HookEventTarget = {
  sessionName: string | null;
  projectName: string | null;
  view: HookEventTargetView;
};

export type HookEventActionStyle = "primary" | "secondary" | "danger";

export type HookEventAction = {
  id: string;
  label: string;
  input: string | null;
  open: boolean;
  target: HookEventTarget | null;
  style: HookEventActionStyle;
};

export type HookEventContentBlock =
  | {
      type: "summary";
      text: string;
    }
  | {
      type: "text";
      text: string;
    }
  | {
      type: "code";
      text: string;
      title?: string;
      language?: string;
      collapsed: boolean;
    }
  | {
      type: "details";
      title: string;
      text: string;
      collapsed: boolean;
    };

export type HookEventMetadata = Record<
  string,
  string | number | boolean | null
> & {
  fileschanged?: number;
  testspassed?: number;
  testsfailed?: number;
  durationms?: number;
};

export type HookEvent = {
  schemaVersion: typeof HOOK_EVENT_SCHEMA_VERSION;
  source: string;
  sessionName: string;
  eventType: string;
  status: HookEventStatus;
  title: string;
  body: string | null;
  cwd: string | null;
  taskId: string | null;
  severity: HookEventSeverity;
  target: HookEventTarget;
  actions: HookEventAction[];
  content: HookEventContentBlock[];
  metadata?: HookEventMetadata;
};
