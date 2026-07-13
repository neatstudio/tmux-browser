# tmux-ui API Reference

This document lists the HTTP and WebSocket APIs that third-party tools can call
directly. It is based on the current Express routes and shared TypeScript types.

## Calling Convention

- Base URL is the running tmux-ui server, usually a Tailscale URL such as
  `http://100.x.y.z:3000`.
- API routes do not implement user login or API keys. Keep the server bound to a
  trusted private interface.
- `POST /api/hooks/events` accepts unauthenticated requests from localhost and
  Tailscale `100.64.0.0/10` based on the socket address, or the Express trusted
  proxy address if trusted proxy is explicitly configured. Direct requests cannot
  bypass this by spoofing `X-Forwarded-For`. Other sources require
  `Authorization: Bearer <TMUX_UI_HOOK_TOKEN>` or
  `X-Tmux-Ui-Hook-Token: <token>` when a hook token is configured.
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

type BaseTimelineEvent = {
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
    | "pane-killed";
  sessionName: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type ConversationMessageRole = "user" | "assistant" | "tool";
type ConversationMessageContentType = "text" | "code" | "image" | "command";
type ConversationMessageStatus = "streaming" | "complete" | "failed";

type ConversationMessageTimelineEvent = {
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

type HookEventTimelineEvent = HookEvent & {
  type: "hook-event";
  id: string;
  createdAt: string;
};

type TimelineEvent =
  | BaseTimelineEvent
  | ConversationMessageTimelineEvent
  | HookEventTimelineEvent;
```

## Health, Status, Timeline

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | `AppHealth` |
| `GET` | `/api/server-status` | none | `ServerStatus` |
| `GET` | `/api/timeline?limit=20` | optional `limit` query | `{ events: TimelineEvent[] }` |

Timeline contains generic operational events plus structured
`conversation-message` events. Use conversation messages for Android/native chat
views instead of parsing `/ws/terminal` ANSI output.

## Conversation Messages

Records a structured chat/message event into timeline and broadcasts the same
message object over `/ws/events`. This is intentionally separate from
`/ws/terminal`: terminal websocket remains the raw TUI stream for keyboard and
screen interaction, while conversation messages are the stable API for native
left/right chat rendering.

```ts
type ConversationMessageRequest = {
  messageId?: string; // generated when omitted
  sessionName: string;
  role?: ConversationMessageRole; // default: "assistant"
  contentType?: ConversationMessageContentType; // default: "text"
  content: string;
  summary?: string | null; // trimmed, max 320 characters
  status?: ConversationMessageStatus; // default: "complete"
  toolName?: string | null;
  parentMessageId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  revision?: number;
};

type ConversationMessageResponse = {
  ok: true;
  message: ConversationMessageTimelineEvent;
};
```

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/api/conversation/messages` | `ConversationMessageRequest` | `ConversationMessageResponse` |

The logical key is `(sessionName, messageId)`. A first write defaults to
`revision: 1`; if supplied on the first write, revision must equal `1`. Producers
that update a streaming message must send the complete content snapshot with the
next consecutive revision. Successful updates preserve `id` and `createdAt`, set
a new `updatedAt`, and replace the mutable snapshot fields. Retrying the exact
same normalized payload at the same revision is idempotent.

Legacy producers that create each message only once remain compatible without
`summary` or `revision`; the response contains `summary: null`, `revision: 1`, and
`updatedAt`. Legacy streaming producers that reuse a message id must upgrade to
the explicit monotonically increasing revision contract before using this API.

### Phase 1 production compatibility gate

Production publishing is blocked by `npm run check:structured-events-compat`.
The command reads `config/structured-events-compat.json` locally and performs no
network access. Local publishing runs it before checking the run file or invoking
`ssh`/`scp`; the release workflow runs it before packing or uploading artifacts.

Register every strict decoder of structured `/ws/events` payloads under
`strictDecoders.entries`, and every producer that sends multiple
`conversation-message` snapshots for one `messageId` under
`repeatedMessageStreamingProducers.entries`. Each entry requires a stable `id`,
an `owner`, the deployed `minimumCompatibleVersion`, and `compatible: true` only
after compatibility has been verified. `minimumCompatibleVersion` must use the
deterministic core SemVer form `major.minor.patch` (for example, `1.2.3`): all
three identifiers are required, leading zeroes are forbidden except for `0`, and
prerelease/build suffixes are not accepted. A category may remain empty only when
its repository audit is recorded with an ISO `auditedAt` date and nonempty
`owner`. Entry `id` values must be unique across both categories.

The checker accepts an explicit manifest path for isolated validation, but
`npm run publish` always passes the repository's canonical
`config/structured-events-compat.json` path. Environment variables cannot
redirect the production publish gate to another manifest.

Before a Phase 1 server production release, update the manifest for every known
consumer and producer, deploy the recorded minimum compatible versions, set
`compatible: true`, and run the gate. Do not use an empty repository inventory as
evidence that an unregistered external native client or producer is ready.

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `invalid_revision` | A new message did not start at revision 1, or revision is not a finite integer. |
| `428` | `revision_required` | An existing message update omitted revision. |
| `409` | `stale_revision` | Revision is older, or repeats a revision with different normalized payload. |
| `409` | `revision_gap` | Revision skipped the next consecutive value. |
| `409` | `immutable_field` | An update changed identity, role, content type, tool, or parent fields. |
| `409` | `terminal_conflict` | An update attempted to change a complete or failed message. |

Example:

```json
{
  "messageId": "msg_123",
  "sessionName": "codex",
  "role": "assistant",
  "contentType": "text",
  "content": "已经完成修改",
  "summary": "修改完成",
  "status": "complete",
  "toolName": "apply_patch",
  "parentMessageId": "msg_122"
}
```

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

## Kanban Projects (Project APIs)

Kanban projects are tmux-ui's project-scoped agent groups. A project stores a
name, a working path, an optional SSH server name, and agent definitions. The UI
uses the same API as third-party tools.

Direct API callers should send `agents` explicitly. The browser client fills in
recommended agents before calling the API, but the server itself does not invent
agents when `agents` is omitted.

Session names are stable. Unless an agent provides `sessionName`, the server uses
`<normalized-project>-<normalized-agent>`, where names are lowercased and
non-session characters become `-`.

For local projects, selected agents are created in `path`. For remote projects,
`server` is an SSH host name; tmux-ui creates a local wrapper session that SSHes
to that host and attaches to or creates the same named tmux session remotely.

`ungrouped` is a reserved virtual project name. You cannot create or delete it,
but group-message APIs can target `ungrouped` live sessions.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `GET` | `/api/kanban/projects` | none | `200 { projects: KanbanProject[] }` after pruning saved sessions missing from live tmux |
| `POST` | `/api/kanban/projects` | `CreateKanbanProjectRequest` | `201 { ok: true, sessions: string[], preferences: Preferences }` |
| `DELETE` | `/api/kanban/projects/:name` | none | `204 No Content`; also deletes stored group messages for that project |
| `POST` | `/api/kanban/projects/:name/sessions` | `{ sessionName: string }` | `200 { ok: true, preferences: Preferences }` |
| `DELETE` | `/api/kanban/projects/:name/sessions/:agent?kill=false` | optional `kill=true` query | `200 { ok: true, preferences: Preferences }` |

```ts
type CreateKanbanProjectRequest = {
  name: string;
  path: string;
  server: string | null;
  agents?: KanbanAgent[];
  selectedAgentNames?: string[];
};
```

### `CreateKanbanProjectRequest`

- `name` is required and must not be `ungrouped`.
- `path` is required. Use a local path for local projects or the remote working
  directory when `server` is set.
- `server` is `null` for local projects or an SSH host name such as `"m9"`.
- `agents` are persisted on the project. Each agent needs `kind` and `name`;
  `command` may be `null`; `sessionName` is optional when you need a custom
  tmux session name.
- `selectedAgentNames` controls which agents should be created immediately. If
  it is omitted, the server selects the default names `pm`, `review`, and
  `codex` when matching agents exist. Use `[]` to save the project without
  creating sessions.

### Create a local project and start selected sessions

```http
POST /api/kanban/projects
Content-Type: application/json

{
  "name": "xxvisa",
  "path": "/srv/xxvisa",
  "server": null,
  "selectedAgentNames": ["pm", "codex"],
  "agents": [
    { "kind": "pm", "name": "pm", "command": null },
    { "kind": "review", "name": "review", "command": null },
    { "kind": "codex", "name": "codex", "command": "codex" }
  ]
}
```

Response:

```json
{
  "ok": true,
  "sessions": ["xxvisa-pm", "xxvisa-codex"],
  "preferences": {
    "pinnedSessionNames": [],
    "mutedSessionNames": ["tmux-ui"],
    "sessionSettings": {},
    "kanbanProjects": [
      {
        "name": "xxvisa",
        "path": "/srv/xxvisa",
        "server": null,
        "agents": [
          { "kind": "pm", "name": "pm", "command": null },
          { "kind": "review", "name": "review", "command": null },
          { "kind": "codex", "name": "codex", "command": "codex" }
        ]
      }
    ]
  }
}
```

### Create a remote project

```json
{
  "name": "m9-tools",
  "path": "/home/gouki/work/m9-tools",
  "server": "m9",
  "selectedAgentNames": ["codex"],
  "agents": [
    { "kind": "codex", "name": "codex", "command": "codex" },
    { "kind": "scratch", "name": "scratch", "command": null }
  ]
}
```

The created local session is a wrapper named `m9-tools-codex`. It SSHes to
`m9`, changes to `/home/gouki/work/m9-tools`, and attaches to or creates the
remote tmux session with the same stable name.

### Attach or remove an existing session

```http
POST /api/kanban/projects/xxvisa/sessions
Content-Type: application/json

{ "sessionName": "local-ssh" }
```

```http
DELETE /api/kanban/projects/xxvisa/sessions/local-ssh?kill=false
```

`kill=false` removes the session from the project only. `kill=true` also kills
the tmux session before removing it from the project.

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

`:name` can be a configured project name or the virtual `ungrouped` project.
`target.type` controls delivery:

- `session` sends to one explicit live session.
- `others` sends to all other live sessions in the same project.
- `role` matches an agent `name`, `kind`, or session suffix such as `codex`.

Example:

```http
POST /api/kanban/projects/xxvisa/messages
Content-Type: application/json

{
  "fromSession": "xxvisa-pm",
  "kind": "task",
  "target": { "type": "role", "role": "codex" },
  "body": "Run the checkout API tests and report failures."
}
```

Response:

```json
{
  "ok": true,
  "message": {
    "id": "gm-20260707-0001",
    "projectName": "xxvisa",
    "fromSession": "xxvisa-pm",
    "toSessions": ["xxvisa-codex"],
    "kind": "task",
    "status": "pending",
    "body": "Run the checkout API tests and report failures.",
    "createdAt": "2026-07-07T06:00:00.000Z",
    "updatedAt": "2026-07-07T06:00:00.000Z",
    "expiresAt": null,
    "deliveries": [
      { "sessionName": "xxvisa-codex", "status": "sent", "mode": "agent-input" }
    ],
    "replies": [],
    "warnings": []
  }
}
```

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

type HookEventTarget = {
  sessionName: string | null;
  projectName: string | null;
  view: "terminal" | "kanban";
};

type HookEventAction = {
  id: string;
  label: string;
  input: string | null;
  open: boolean;
  target: HookEventTarget | null;
  style: "primary" | "secondary" | "danger";
};

type HookEventContentBlock =
  | { type: "summary"; text: string }
  | { type: "text"; text: string }
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

type HookEvent = {
  schemaVersion: "tmux-ui.hook/v1";
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
  metadata?: Record<string, string | number | boolean | null>;
};
```

### `POST /api/hooks/events`

Records an agent/tool event, adds a timeline event, and broadcasts over
`/ws/events`. The response, stored timeline record, and websocket event are the
same canonical typed record, including the same `id` and `createdAt`.

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

Defaults: `schemaVersion` is `"tmux-ui.hook/v1"`, `source` is `"custom"`,
`eventType` is `"event"`, `status` is `"info"`, `severity` is `"info"`,
`title` is `"<source> <eventType>"`, `target.sessionName` is `sessionName`,
and `actions` / `content` are `[]`.

Hook metadata accepts scalar values only. Original keys are processed in sorted
order, then stored in lowercase alphanumeric form; normalized-key collisions
keep the first key and emit a value-free diagnostic. Normalized keys containing
`token`, `secret`, `password`, `authorization`, or `cookie`, or
ends in `key`, are stored as `[redacted]`. Strings are limited to 2 KiB of UTF-8
data including the `[truncated]` marker when shortened. User metadata is limited
to 16 KiB and receives `_truncated: true` when the limit is reached. User keys
that normalize to the reserved legacy names `status`, `source`, `eventtype`,
`body`, `taskid`, `target`, `actions`, or `content` are dropped; `_truncated`
is also protected from producer values. The optional
display statistics are persisted under canonical keys and validated as follows:
`fileschanged` is an integer from 0 to 100000, `testspassed` and `testsfailed`
are integers from 0 to 1000000, and `durationms` is a finite number from 0 to
86400000. Producers may use punctuation or case variants such as
`filesChanged`; normalization maps them to these canonical keys.

For compatibility, the record metadata also contains reserved legacy
projections for `status`, `source`, `eventType`, `body`, `taskId`, `target`,
`actions`, and `content`. These reserved fields do not consume
the user metadata budget; typed top-level fields are canonical.

`target` lets tmux-ui jump to the correct terminal or Kanban group when the event
belongs to a different group than the current page. `actions` renders explicit
buttons in the toast and Action Center. For example, an approval hook can send
`"y\r"` or `"n\r"` directly to the target tmux session instead of relying on
screen-content guessing.

Use `content` for mobile-friendly structured display. Toasts show the first
`summary` or `text` block instead of large raw bodies. Action Center renders
`code` and `details` blocks as collapsible sections, defaulting to collapsed
unless `collapsed: false` is provided. `body` remains a legacy fallback for
simple tools.

```json
{
  "schemaVersion": "tmux-ui.hook/v1",
  "source": "codex",
  "sessionName": "project-codex",
  "eventType": "approval-required",
  "status": "waiting",
  "title": "Review patch",
  "body": "Legacy fallback body",
  "content": [
    { "type": "summary", "text": "Two files changed; approve patch?" },
    {
      "type": "code",
      "title": "src/app.ts",
      "language": "ts",
      "text": "export const answer = 42;",
      "collapsed": true
    }
  ],
  "actions": [
    { "id": "approve", "label": "Approve", "input": "y\r", "style": "primary" }
  ]
}
```

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
    } & HookEvent & { id: string; createdAt: string })
  | ConversationMessageTimelineEvent;
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
    "schemaVersion": "tmux-ui.hook/v1",
    "source": "third-party",
    "sessionName": "project-codex",
    "eventType": "approval-required",
    "status": "waiting",
    "title": "Tool needs input",
    "body": "Approve the next step?",
    "target": {
      "sessionName": "project-codex",
      "projectName": "project",
      "view": "terminal"
    },
    "actions": [
      { "id": "approve", "label": "Approve", "input": "y\r", "style": "primary" },
      { "id": "deny", "label": "Deny", "input": "n\r", "style": "danger" },
      { "id": "open", "label": "Open", "open": true }
    ]
  }'

curl -fsS "$BASE/api/conversation/messages" \
  -H 'Content-Type: application/json' \
  -d '{
    "messageId": "msg_123",
    "sessionName": "codex",
    "role": "assistant",
    "contentType": "text",
    "content": "已经完成修改",
    "status": "complete",
    "toolName": "apply_patch",
    "parentMessageId": "msg_122"
  }'
```
