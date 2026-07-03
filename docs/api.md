# tmux-ui API Reference

This document lists the HTTP and WebSocket APIs that third-party tools can call
directly. It is based on the current Express routes and shared TypeScript types.

## Calling Convention

- Base URL is the running tmux-ui server, usually a Tailscale URL such as
  `http://100.x.y.z:3000`.
- API routes do not implement user login or API keys. Keep the server bound to a
  trusted private interface.
- `POST /api/hooks/events` accepts unauthenticated requests from localhost and
  Tailscale `100.64.0.0/10`. Other sources require `Authorization: Bearer
  <TMUX_UI_HOOK_TOKEN>` or `X-Tmux-Ui-Hook-Token: <token>` when a hook token is
  configured.
- JSON endpoints expect `Content-Type: application/json`.
- Path parameters should be URL-encoded.
- JSON errors use:

```ts
type ErrorResponse = {
  error: string;
};
```

## Data Structures

```ts
type AppHealth = {
  ok: true;
  name: "tmux-ui";
  version: string;
  commit: string;
  builtAt: string;
};

type ServerStatus = {
  platform: string;
  cpuCount: number;
  loadAverage: [number, number, number];
  loadPercent: number | null;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedPercent: number | null;
  uptimeSeconds: number;
  homeDirectory: string;
};

type SessionRuntimeKind = "agent" | "shell" | "unknown";

type TerminalInputPrompt = {
  snippet: string;
  actions: Array<{ label: string; input: string }>;
};

type PaneSummary = {
  sessionName: string;
  paneId: string;
  windowIndex: number;
  windowName: string;
  windowActive: boolean;
  paneIndex: number;
  paneActive: boolean;
  currentCommand: string | null;
  runtimeKind: SessionRuntimeKind;
  currentPath: string | null;
  paneDead: boolean;
  paneDeadStatus: number | null;
  panePid: number | null;
  paneLeft: number;
  paneTop: number;
  paneWidth: number;
  paneHeight: number;
};

type SessionSummary = {
  name: string;
  windows: number;
  status: "attached" | "detached";
  lastActivityAt: number | null;
  paneCount: number;
  activeWindowName: string | null;
  currentCommand: string | null;
  runtimeKind: SessionRuntimeKind;
  currentPath: string | null;
  gitBranch: string | null;
  gitDirty: boolean | null;
  paneDead: boolean;
  paneDeadStatus: number | null;
  preview: string | null;
  inputPrompt: TerminalInputPrompt | null;
  panes?: PaneSummary[];
};

type SessionSettings = {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  themeId: string;
};

type KanbanAgent = {
  kind: string;
  name: string;
  command: string | null;
  sessionName?: string;
};

type KanbanProject = {
  name: string;
  path: string;
  server: string | null;
  agents: KanbanAgent[];
};

type Preferences = {
  pinnedSessionNames: string[];
  mutedSessionNames: string[];
  sessionSettings: Record<string, SessionSettings>;
  kanbanProjects: KanbanProject[];
};

type TimelineEvent = {
  id: string;
  type:
    | "session-created"
    | "session-renamed"
    | "session-killed"
    | "command-sent"
    | "group-message-sent"
    | "group-message-replied"
    | "pane-split"
    | "pane-selected"
    | "pane-killed"
    | "hook-event";
  sessionName: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};
```

## Health, Status, Timeline

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | `AppHealth` |
| `GET` | `/api/server-status` | none | `ServerStatus` |
| `GET` | `/api/timeline?limit=20` | optional `limit` query | `{ events: TimelineEvent[] }` |

## Sessions

Session names must match `^[A-Za-z0-9._-]+$`.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `GET` | `/api/sessions` | none | `Array<Omit<SessionSummary, "panes">>` |
| `GET` | `/api/sessions-all?only=a,b` | optional comma-separated `only` query | `SessionSummary[]` with previews, panes, and input prompts |
| `GET` | `/api/sessions-panes?muted=a,b` | optional comma-separated `muted` query | `SessionSummary[]` with panes, no previews |
| `GET` | `/api/sessions/:name/status` | none | `Omit<SessionSummary, "preview">` |
| `POST` | `/api/sessions` | `{ name: string }` | `{ ok: true }` |
| `PATCH` | `/api/sessions/:name` | `{ name: string }` new name | `{ ok: true }` |
| `DELETE` | `/api/sessions/:name` | none | `204 No Content` |
| `POST` | `/api/sessions/:name/send` | `{ command: string }` | `{ ok: true }` |
| `POST` | `/api/sessions/:name/input` | `{ input: string }` max 256 chars | `{ ok: true }` |
| `POST` | `/api/sessions/:name/split` | `{ direction: "horizontal" \| "vertical" }` | `{ ok: true }` |
| `POST` | `/api/sessions/:name/select-pane` | `{ paneId: string }`, for example `%1` | `{ ok: true }` |
| `DELETE` | `/api/sessions/:name/panes/:paneId` | none | `204 No Content` |

## Preferences

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `GET` | `/api/preferences` | none | `Preferences` |
| `PATCH` | `/api/preferences/pinned-sessions/:name` | `{ pinned: boolean }` | `{ ok: true }` |
| `PATCH` | `/api/preferences/muted-sessions/:name` | `{ muted: boolean }` | `{ ok: true }` |
| `PATCH` | `/api/preferences/session-settings/:name` | `{ settings: SessionSettings }` | `{ ok: true }` |

## Kanban Projects

`ungrouped` is a reserved virtual project name.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `GET` | `/api/kanban/projects` | none | `{ projects: KanbanProject[] }` after pruning sessions missing from live tmux |
| `POST` | `/api/kanban/projects` | `CreateKanbanProjectRequest` | `{ ok: true, sessions: string[], preferences: Preferences }` |
| `DELETE` | `/api/kanban/projects/:name` | none | `204 No Content` |
| `POST` | `/api/kanban/projects/:name/sessions` | `{ sessionName: string }` | `{ ok: true, preferences: Preferences }` |
| `DELETE` | `/api/kanban/projects/:name/sessions/:agent?kill=false` | optional `kill=true` query | `{ ok: true, preferences: Preferences }` |

```ts
type CreateKanbanProjectRequest = {
  name: string;
  path: string;
  server: string | null;
  agents?: KanbanAgent[];
  selectedAgentNames?: string[];
};
```

## Group Messages

```ts
type GroupMessageKind = "task" | "report";
type GroupMessageStatus = "pending" | "partial" | "replied" | "stale" | "failed";
type GroupReplyStatus = "done" | "blocked" | "need-input" | "ack";

type GroupMessageTarget =
  | { type: "session"; sessionName: string }
  | { type: "others" }
  | { type: "role"; role: string };

type GroupMessageDelivery = {
  sessionName: string;
  status: "pending" | "sent" | "failed";
  mode?: "agent-input" | "shell-print";
  error?: string;
};

type GroupMessageReply = {
  messageId: string;
  fromSession: string;
  status: GroupReplyStatus;
  body: string;
  capturedAt: string;
};

type GroupMessage = {
  id: string;
  projectName: string;
  fromSession: string;
  toSessions: string[];
  kind: GroupMessageKind;
  status: GroupMessageStatus;
  body: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  deliveries: GroupMessageDelivery[];
  replies: GroupMessageReply[];
  warnings: string[];
};
```

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `GET` | `/api/kanban/projects/:name/messages` | none | `{ messages: GroupMessage[] }` |
| `POST` | `/api/kanban/projects/:name/messages` | `{ fromSession: string, kind: "task" \| "report", target: GroupMessageTarget, body: string }` | `{ ok: true, message: GroupMessage }` |
| `POST` | `/api/kanban/projects/:name/messages/:messageId/scan` | none | `{ ok: true, message: GroupMessage }` |

## Hook Events

```ts
type HookEventStatus =
  | "waiting"
  | "blocked"
  | "need-input"
  | "running"
  | "done"
  | "failed"
  | "info";

type HookEventSeverity = "info" | "warning" | "error";

type HookEvent = {
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
```

### `POST /api/hooks/events`

Records an agent/tool event, adds a timeline event, and broadcasts over
`/ws/events`.

```ts
type Request = Partial<HookEvent> & {
  sessionName: string;
};

type Response = {
  ok: true;
  event: HookEvent & {
    type: "hook-event";
    id: string;
    createdAt: string;
  };
};
```

Defaults: `source` is `"custom"`, `eventType` is `"event"`, `status` is
`"info"`, `severity` is `"info"`, and `title` is `"<source> <eventType>"`.

## Uploads And Image Preview

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/api/uploads/image` | raw PNG/JPEG/GIF/WebP bytes, max 10 MiB; optional `X-Tmux-Session` header | `ImageUploadResult` |
| `POST` | `/api/uploads/image-url` | `{ url: string }`; optional `X-Tmux-Session` header | `ImageUploadResult` |
| `GET` | `/api/image-preview?path=<path>&basePath=<basePath>` | optional `basePath` query | binary image stream with `X-Preview-Image-Path` header |
| `GET` | `/api/image-preview-info?path=<path>&basePath=<basePath>` | optional `basePath` query | `{ ok: true, path: string, contentType: string, size: number }` or `{ ok: false, error: string }` |

```ts
type ImageUploadResult = {
  ok: true;
  absolutePath: string;
  contentType: string;
  size: number;
};
```

## WebSocket APIs

Use `ws://` for `http://` servers and `wss://` for `https://` servers.

### `GET /ws/events`

Subscribes to app-level events. The first message is `{ type: "hello" }`.

```ts
type AppEventSocketMessage =
  | { type: "hello" }
  | ({
      type: "sessions-invalidated";
      reason:
        | "session-created"
        | "session-renamed"
        | "session-killed"
        | "session-list-changed"
        | "command-sent"
        | "group-message-updated"
        | "pane-split"
        | "pane-selected"
        | "pane-killed";
      sessionName?: string;
    } & { id: string; createdAt: string })
  | ({
      type: "hook-event";
    } & HookEvent & { id: string; createdAt: string });
```

### `GET /ws/terminal`

Streams an interactive PTY for one tmux session. Prefer the HTTP command/input
routes unless a tool needs live terminal output.

Client to server:

```ts
type ClientMessage =
  | { type: "attach"; tabId: string; sessionName: string; cols: number; rows: number }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "scroll"; lines: number }
  | { type: "clear-history" };
```

Server to client:

```ts
type ServerMessage =
  | { type: "output"; data: string }
  | { type: "session-exit" }
  | { type: "error"; message: string };
```

## Examples

```bash
BASE=http://100.89.0.116:3000

curl -fsS "$BASE/api/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"name":"third-party"}'

curl -fsS "$BASE/api/sessions/third-party/send" \
  -H 'Content-Type: application/json' \
  -d '{"command":"pwd"}'

curl -fsS "$BASE/api/hooks/events" \
  -H 'Content-Type: application/json' \
  -d '{
    "source": "third-party",
    "sessionName": "third-party",
    "eventType": "need-input",
    "status": "waiting",
    "title": "Tool needs input",
    "body": "Approve the next step?"
  }'
```
