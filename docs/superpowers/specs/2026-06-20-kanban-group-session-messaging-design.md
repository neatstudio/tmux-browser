# Kanban Group Session Messaging Design

## Goal

Make a Kanban project group feel alive by allowing sessions inside the same group to send tasks, reports, and replies to each other.

tmux-ui should act as the group message router and observer. It should not assume a target session is Codex, Claude, a shell, or another TUI.

## Problem

Kanban grouping currently improves navigation, but group members do not collaborate.

Useful project groups need:

- a way for one session to ask another session to do work
- a way to broadcast a task to multiple sessions in the same project
- a way for worker sessions to report back to the requester
- a visible record of pending, replied, and stale messages
- compatibility with different agents and plain shells

The hard part is that different agents have different command modes, confirmation prompts, and APIs. Coupling tmux-ui to each agent directly would make the feature fragile.

## Recommended Approach

Use a text protocol over tmux.

tmux-ui sends structured text into target sessions using existing tmux input primitives. Target sessions reply by printing a structured reply block. tmux-ui observes pane output with capture-pane and extracts replies.

This keeps the transport agent-agnostic:

- Codex can read the task and respond.
- Claude can read the task and respond.
- A human in a shell can copy or type the reply block.
- Future agents can adopt the same block without backend changes.

## Non-Goals

This first version will not:

- call Codex, Claude, or Anthropic/OpenAI APIs directly
- guarantee that an agent actually understands the message
- provide distributed locking or reliable queue semantics
- edit files automatically based on replies
- require every project session to run the same agent

## Message Concepts

Group messages are persisted in a lightweight in-memory store for the first version.

Persistent-on-disk storage can be added later if the workflow proves durable enough.

Message fields:

- `id`: stable generated id, for example `gm-20260620-0001`
- `projectName`
- `fromSession`
- `toSessions`
- `kind`: `task` or `report`
- `status`: `pending`, `partial`, `replied`, `stale`, `failed`
- `body`
- `createdAt`
- `updatedAt`
- `expiresAt`
- `replies`

Reply fields:

- `messageId`
- `fromSession`
- `toSession`
- `status`: `done`, `blocked`, `need-input`, `ack`
- `body`
- `capturedAt`

## Text Protocol

tmux-ui sends a readable message block to each target session.

Example task:

```text
[tmux-ui:task]
id: gm-20260620-0001
project: xxvisa
from: xxvisa-pm
to: xxvisa-codex

Please implement the checkout API regression test.

Reply with:
[tmux-ui:reply]
id: gm-20260620-0001
from: xxvisa-codex
status: done|blocked|need-input|ack
body:
...
[/tmux-ui:reply]
[/tmux-ui:task]
```

Example reply:

```text
[tmux-ui:reply]
id: gm-20260620-0001
from: xxvisa-codex
status: done
body:
Implemented the regression test and verified it fails without the fix.
[/tmux-ui:reply]
```

The reply parser should be forgiving:

- accept extra whitespace around keys
- ignore unknown keys
- require `id`, `from`, `status`, and `body`
- ignore malformed blocks without failing the whole scan
- dedupe replies by `messageId + fromSession + body hash`

## Target Resolution

The sender can choose:

- one group session
- all other sessions in the current group
- sessions by role, such as `review` or `codex`

Target resolution should only include sessions that currently exist in tmux.

Rules:

- current session is excluded for "all others"
- missing configured agents are skipped and surfaced as warnings
- manually attached sessions use their real `sessionName`
- role selection matches `agent.name` first, then derived session name suffix

## Backend Shape

Add a group messaging service with pure units first:

- `formatGroupMessage()`
- `parseGroupReplies()`
- `resolveGroupMessageTargets()`
- `createGroupMessageStore()`

Then add API endpoints:

- `POST /api/kanban/projects/:projectName/messages`
- `GET /api/kanban/projects/:projectName/messages`
- `POST /api/kanban/projects/:projectName/messages/:messageId/scan`

Initial POST body:

```json
{
  "fromSession": "xxvisa-pm",
  "kind": "task",
  "target": { "type": "others" },
  "body": "Please review the latest diff."
}
```

Target variants:

```json
{ "type": "session", "sessionName": "xxvisa-review" }
{ "type": "others" }
{ "type": "role", "role": "review" }
```

Delivery:

- use `tmux send-keys -l <message>`
- then send `Enter`
- record one delivery result per target session
- add a timeline event for sent group messages
- emit an app event so active pages can refresh message state

Reply scanning:

- capture only target sessions related to pending messages
- limit capture to recent lines, for example last 300 lines
- parse reply blocks
- update message status
- add a timeline event when a reply is found

## Frontend Shape

First UI entry points:

- top group rail gets a compact `Task` button
- right floating menu gets `Group Task` and `Group Messages`

Task compose panel:

- `kind`: task or report
- target selector: session, all others, role
- body textarea
- send button

Message panel:

- sent messages
- pending/replied/stale status
- target delivery list
- replies grouped by target session
- manual `Scan replies` button

The first version should avoid auto-opening large overlays. It should stay compact and operational.

## Performance Notes

Do not scan every session on every dashboard refresh.

Rules:

- scan only when a message is pending
- scan only target sessions of pending messages
- debounce manual scans
- cap capture-pane to a fixed line count
- reuse existing app event refresh rather than adding a high-frequency poll

This keeps the feature compatible with larger tmux setups.

## Error Handling

Delivery failures:

- mark target delivery as `failed`
- preserve successful deliveries to other targets
- show target-specific error text

Reply parse failures:

- ignore malformed blocks
- do not mark the message failed
- optionally expose parser warning count in debug metadata later

Missing targets:

- skip missing sessions
- return warnings
- do not fail the whole request unless no valid targets remain

## Testing Plan

Pure unit tests:

- formats task/report blocks with stable required fields
- resolves `session`, `others`, and `role` targets from Kanban project data
- excludes current session from `others`
- skips missing tmux sessions
- parses valid reply blocks
- ignores malformed reply blocks
- dedupes duplicate replies
- computes message status from delivery and reply state

Server tests:

- `POST /messages` sends literal message and Enter to each resolved target
- partial target failure preserves successful deliveries
- `GET /messages` returns current project messages
- `POST /messages/:id/scan` captures only pending target sessions
- timeline events are added for sent messages and replies

Client tests:

- API wrapper calls the new endpoints with expected payloads
- rail or floating menu exposes group message entry only inside a group
- compose panel resolves target selector state
- message panel displays pending and replied states
- manual scan triggers the scan endpoint

## Phased Implementation

### Phase 1: Backend Core

Implement pure formatter, target resolver, reply parser, and in-memory store with tests.

### Phase 2: API and tmux Delivery

Add endpoints and route tests. Reuse existing tmux service input mechanisms or add a narrow `sendLiteralInput` helper if needed.

### Phase 3: UI Entry and Panels

Add compact task compose and message status UI from the group rail / floating menu.

### Phase 4: Reply Scan Integration

Add manual scan first. Add low-frequency event-driven scan only after manual behavior is reliable.

## Acceptance Criteria

- A session in a Kanban group can send a task/report to another group session.
- A session can send to all other existing sessions in the group.
- tmux-ui shows delivery state per target.
- A reply block printed by a target session is parsed and attached to the original message.
- The UI shows pending/replied/stale messages.
- The implementation works without knowing whether the target is Codex, Claude, or a shell.
- Tests cover formatter, target resolution, reply parsing, API behavior, and UI state rendering.
