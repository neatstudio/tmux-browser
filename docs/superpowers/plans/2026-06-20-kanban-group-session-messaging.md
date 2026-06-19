# Kanban Group Session Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight group messaging layer so sessions inside one Kanban project can send tasks, reports, and replies to each other through tmux.

**Architecture:** tmux-ui acts as a router and observer, not as a Codex/Claude API client. Messages are formatted as readable text blocks, delivered through tmux input, and replies are discovered by scanning recent pane output for structured reply blocks. The first version stores messages in memory and exposes explicit scan controls to avoid background `capture-pane` pressure.

**Tech Stack:** TypeScript, Express, Vitest, jsdom, xterm/tmux integration, existing tmux service, existing Kanban preferences, existing timeline and app event hub.

---

## Baseline

- Current stable UI baseline is `0.1.87`.
- New group messaging work should bump to `0.2.0` before local packaging.
- Keep current simplified sidebar/top rail/status bar layout intact unless a task explicitly touches it.
- Do not use `tw0` as a verification target.
- Verify local packaged service before any full publish.

## File Structure

Create:

- `src/shared/groupMessages.ts`: shared message, reply, target, status, request, and response types.
- `src/server/services/groupMessages/formatGroupMessage.ts`: pure text protocol formatter.
- `src/server/services/groupMessages/parseGroupReplies.ts`: pure parser for reply blocks captured from tmux output.
- `src/server/services/groupMessages/resolveGroupMessageTargets.ts`: pure target resolver from Kanban project data and live tmux sessions.
- `src/server/services/groupMessages/createGroupMessageStore.ts`: in-memory message store and status reducer.
- `src/client/render/groupMessagePanel.ts`: compact compose/history panel for group task/report workflow.
- `tests/server/services/groupMessages/formatGroupMessage.test.ts`
- `tests/server/services/groupMessages/parseGroupReplies.test.ts`
- `tests/server/services/groupMessages/resolveGroupMessageTargets.test.ts`
- `tests/server/services/groupMessages/createGroupMessageStore.test.ts`
- `tests/client/render/groupMessagePanel.test.ts`

Modify:

- `src/server/createApp.ts`: add Kanban message endpoints and wire store/service dependencies.
- `src/server/services/tmux/createTmuxService.ts`: expose a narrow output capture method if no suitable method already exists.
- `src/shared/timeline.ts`: add group message timeline event types.
- `src/shared/appEvents.ts`: add group message invalidation reason.
- `src/client/api/sessionApi.ts`: add group message API methods and shared types.
- `src/client/state/dashboardStore.ts`: add message fetch/send/scan actions only if UI needs shared store state.
- `src/client/render/sessionGroupRail.ts`: add compact group task entry.
- `src/client/render/sessionFloatingMenu.ts`: add group task/messages entries in the right menu.
- `src/client/main.ts`: wire panel open/send/scan actions.
- `src/client/styles.css`: style compact panel without expanding the normal terminal layout.
- `tests/server/createApp.test.ts`: cover route behavior and tmux delivery integration.
- `tests/client/api/sessionApi.test.ts`: cover API wrapper calls.
- `tests/client/render/sessionGroupRail.test.ts`: cover task entry visibility and callback.
- `tests/client/render/sessionFloatingMenu.test.ts`: cover right-menu entries.

## Data Contracts

Shared message types should be small and explicit:

```ts
export type GroupMessageKind = "task" | "report";
export type GroupMessageStatus = "pending" | "partial" | "replied" | "stale" | "failed";
export type GroupReplyStatus = "done" | "blocked" | "need-input" | "ack";

export type GroupMessageTarget =
  | { type: "session"; sessionName: string }
  | { type: "others" }
  | { type: "role"; role: string };
```

The first API request shape:

```ts
export type CreateGroupMessageRequest = {
  fromSession: string;
  kind: GroupMessageKind;
  target: GroupMessageTarget;
  body: string;
};
```

The first API endpoints:

- `POST /api/kanban/projects/:projectName/messages`
- `GET /api/kanban/projects/:projectName/messages`
- `POST /api/kanban/projects/:projectName/messages/:messageId/scan`

## Task 1: Shared Types And Text Formatter

**Files:**

- Create: `src/shared/groupMessages.ts`
- Create: `src/server/services/groupMessages/formatGroupMessage.ts`
- Test: `tests/server/services/groupMessages/formatGroupMessage.test.ts`

- [ ] **Step 1: Write failing formatter tests**

Create tests that assert a task and report block include required fields and preserve multi-line body text.

```ts
expect(formatGroupMessage({
  id: "gm-test-1",
  projectName: "xxvisa",
  fromSession: "xxvisa-pm",
  toSession: "xxvisa-review",
  kind: "task",
  body: "Please review the diff.\nFocus on payment."
})).toContain("[tmux-ui:task]");
```

- [ ] **Step 2: Run formatter tests and verify failure**

Run:

```bash
npm test -- tests/server/services/groupMessages/formatGroupMessage.test.ts
```

Expected: fail because files/functions do not exist.

- [ ] **Step 3: Implement shared types and formatter**

Formatter requirements:

- Use `[tmux-ui:task]` or `[tmux-ui:report]`.
- Include `id`, `project`, `from`, and `to`.
- Include a reply template in the delivered block.
- End with closing marker `[/tmux-ui:task]` or `[/tmux-ui:report]`.
- Do not include ANSI/control characters from user body.
- Trim leading/trailing blank lines while preserving inner line breaks.

- [ ] **Step 4: Run formatter tests and typecheck**

Run:

```bash
npm test -- tests/server/services/groupMessages/formatGroupMessage.test.ts
npm run build
```

Expected: tests pass, build succeeds.

- [ ] **Step 5: Commit formatter slice**

```bash
git add src/shared/groupMessages.ts src/server/services/groupMessages/formatGroupMessage.ts tests/server/services/groupMessages/formatGroupMessage.test.ts
git commit -m "feat: add group message text formatter"
```

## Task 2: Target Resolver

**Files:**

- Create: `src/server/services/groupMessages/resolveGroupMessageTargets.ts`
- Test: `tests/server/services/groupMessages/resolveGroupMessageTargets.test.ts`

- [ ] **Step 1: Write failing target resolver tests**

Cover:

- `{ type: "session" }` resolves one live session.
- `{ type: "others" }` excludes `fromSession`.
- `{ type: "role" }` matches `agent.name` first.
- Missing tmux sessions are skipped with warnings.
- Empty result fails with a clear error.

- [ ] **Step 2: Run resolver tests and verify failure**

Run:

```bash
npm test -- tests/server/services/groupMessages/resolveGroupMessageTargets.test.ts
```

Expected: fail because resolver does not exist.

- [ ] **Step 3: Implement resolver**

Inputs:

```ts
{
  project: KanbanProject;
  liveSessionNames: string[];
  fromSession: string;
  target: GroupMessageTarget;
}
```

Output:

```ts
{
  sessions: string[];
  warnings: string[];
}
```

Rules:

- Never send to a session not present in `liveSessionNames`.
- For `others`, only include sessions configured in the project and exclude `fromSession`.
- For `role`, check `agent.name === role`, then derived suffix matching.
- Preserve project order for predictable UI and delivery.
- Dedupe target sessions.

- [ ] **Step 4: Run resolver tests**

Run:

```bash
npm test -- tests/server/services/groupMessages/resolveGroupMessageTargets.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit resolver slice**

```bash
git add src/server/services/groupMessages/resolveGroupMessageTargets.ts tests/server/services/groupMessages/resolveGroupMessageTargets.test.ts
git commit -m "feat: resolve kanban group message targets"
```

## Task 3: Reply Parser And Message Store

**Files:**

- Create: `src/server/services/groupMessages/parseGroupReplies.ts`
- Create: `src/server/services/groupMessages/createGroupMessageStore.ts`
- Test: `tests/server/services/groupMessages/parseGroupReplies.test.ts`
- Test: `tests/server/services/groupMessages/createGroupMessageStore.test.ts`

- [ ] **Step 1: Write failing parser tests**

Cover:

- Parses valid reply blocks.
- Accepts extra whitespace around keys.
- Ignores unknown keys.
- Ignores malformed blocks without throwing.
- Requires `id`, `from`, `status`, and `body`.
- Dedupes by `messageId + fromSession + body hash`.

- [ ] **Step 2: Write failing store tests**

Cover:

- Creates pending message with per-target delivery state.
- Marks target delivery failed without failing delivered targets.
- Updates status to `partial` when only some targets replied.
- Updates status to `replied` when all delivered targets replied.
- Leaves message `pending` when no reply exists.

- [ ] **Step 3: Run parser/store tests and verify failure**

Run:

```bash
npm test -- tests/server/services/groupMessages/parseGroupReplies.test.ts tests/server/services/groupMessages/createGroupMessageStore.test.ts
```

Expected: fail because parser/store do not exist.

- [ ] **Step 4: Implement parser and store**

Store should expose:

```ts
{
  createMessage(input): GroupMessage;
  listProjectMessages(projectName: string): GroupMessage[];
  markDelivery(messageId: string, sessionName: string, result): GroupMessage;
  addReplies(messageId: string, replies: GroupMessageReply[]): GroupMessage;
  getMessage(projectName: string, messageId: string): GroupMessage | null;
}
```

Keep storage in memory for the first version.

- [ ] **Step 5: Run parser/store tests**

Run:

```bash
npm test -- tests/server/services/groupMessages/parseGroupReplies.test.ts tests/server/services/groupMessages/createGroupMessageStore.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit parser/store slice**

```bash
git add src/server/services/groupMessages tests/server/services/groupMessages
git commit -m "feat: track kanban group message replies"
```

## Task 4: API Routes, Delivery, Timeline, And Events

**Files:**

- Modify: `src/server/createApp.ts`
- Modify: `src/server/services/tmux/createTmuxService.ts`
- Modify: `src/shared/timeline.ts`
- Modify: `src/shared/appEvents.ts`
- Test: `tests/server/createApp.test.ts`
- Test: `tests/server/services/tmux/createTmuxService.test.ts` if tmux service grows a new method.

- [ ] **Step 1: Write failing API route tests**

Add tests for:

- `POST /api/kanban/projects/:projectName/messages` resolves targets and sends literal message plus Enter.
- Partial send failure records failed target and still returns successful deliveries.
- No valid targets returns `400`.
- `GET /api/kanban/projects/:projectName/messages` returns message list.
- `POST /api/kanban/projects/:projectName/messages/:messageId/scan` captures only pending target sessions.
- Sent and reply scan events appear in timeline.

- [ ] **Step 2: Run API route tests and verify failure**

Run:

```bash
npm test -- tests/server/createApp.test.ts
```

Expected: new route tests fail.

- [ ] **Step 3: Implement app-level group message dependencies**

Wire:

- one in-memory `groupMessageStore` per app instance
- current preferences Kanban project lookup
- live tmux session lookup via `listSessions({ includePreview: false })`
- message delivery through `sendInput(sessionName, formattedMessage + "\r")`
- timeline event type `group-message-sent`
- timeline event type `group-message-replied`
- app event reason `group-message-updated`

- [ ] **Step 4: Add capture support only if needed**

If `createTmuxService` already has a safe capture method, reuse it. Otherwise add a narrow method:

```ts
captureRecentOutput(name: string, lineCount?: number): Promise<string>
```

Implementation should cap default line count to `300` and validate session name.

- [ ] **Step 5: Run API and tmux tests**

Run:

```bash
npm test -- tests/server/createApp.test.ts tests/server/services/tmux/createTmuxService.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit API slice**

```bash
git add src/server/createApp.ts src/server/services/tmux/createTmuxService.ts src/shared/timeline.ts src/shared/appEvents.ts tests/server/createApp.test.ts tests/server/services/tmux/createTmuxService.test.ts
git commit -m "feat: deliver kanban group messages through tmux"
```

## Task 5: Client API And State Wiring

**Files:**

- Modify: `src/client/api/sessionApi.ts`
- Modify: `src/client/state/dashboardStore.ts` only if shared UI state is needed.
- Test: `tests/client/api/sessionApi.test.ts`
- Test: `tests/client/state/dashboardStore.test.ts` only if store is changed.

- [ ] **Step 1: Write failing client API tests**

Cover:

- `sendGroupMessage(projectName, request)` posts to encoded project endpoint.
- `listGroupMessages(projectName)` loads messages.
- `scanGroupMessage(projectName, messageId)` calls scan endpoint.

- [ ] **Step 2: Run client API tests and verify failure**

Run:

```bash
npm test -- tests/client/api/sessionApi.test.ts
```

Expected: new API tests fail.

- [ ] **Step 3: Implement API wrapper methods**

Add methods to `SessionApi` and `createSessionApi`.

Prefer returning typed response objects instead of `void` so UI can show delivery warnings.

- [ ] **Step 4: Run client API tests**

Run:

```bash
npm test -- tests/client/api/sessionApi.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit client API slice**

```bash
git add src/client/api/sessionApi.ts tests/client/api/sessionApi.test.ts src/client/state/dashboardStore.ts tests/client/state/dashboardStore.test.ts
git commit -m "feat: add client api for group messages"
```

## Task 6: Compact UI Entry Points

**Files:**

- Modify: `src/client/render/sessionGroupRail.ts`
- Modify: `src/client/render/sessionFloatingMenu.ts`
- Create: `src/client/render/groupMessagePanel.ts`
- Modify: `src/client/main.ts`
- Modify: `src/client/styles.css`
- Test: `tests/client/render/sessionGroupRail.test.ts`
- Test: `tests/client/render/sessionFloatingMenu.test.ts`
- Test: `tests/client/render/groupMessagePanel.test.ts`

- [ ] **Step 1: Write failing render tests for entry points**

Expected behavior:

- Top rail shows a compact `Task` action only when current session is inside a Kanban project.
- Right floating menu shows `Group Task` and `Group Messages` only inside a group.
- No-group sessions keep the existing bottom toolbar and existing menu behavior.

- [ ] **Step 2: Write failing panel tests**

Cover:

- Task/report kind toggle.
- Target selector supports session, all others, and role.
- Body textarea keeps focus while typing.
- Send button calls callback with typed request.
- Message list shows pending, partial, replied, failed.
- Manual scan button calls callback with message id.

- [ ] **Step 3: Run render tests and verify failure**

Run:

```bash
npm test -- tests/client/render/sessionGroupRail.test.ts tests/client/render/sessionFloatingMenu.test.ts tests/client/render/groupMessagePanel.test.ts
```

Expected: new tests fail.

- [ ] **Step 4: Implement compact panel**

UI constraints:

- Do not add a permanent large area to the terminal screen.
- Prefer a small overlay opened from top rail/right menu.
- Keep overlay opaque on mobile.
- Do not remove existing `image`, `reconnect`, `camera`, `clear`, or navigation actions unless explicitly requested.
- Avoid strong expand/collapse animation.

- [ ] **Step 5: Wire main actions**

In `src/client/main.ts`:

- derive current Kanban project with existing helper
- open compose panel from top rail/menu
- submit through `api.sendGroupMessage`
- refresh messages after send
- call scan endpoint on manual scan

- [ ] **Step 6: Run render tests**

Run:

```bash
npm test -- tests/client/render/sessionGroupRail.test.ts tests/client/render/sessionFloatingMenu.test.ts tests/client/render/groupMessagePanel.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit UI slice**

```bash
git add src/client/render/sessionGroupRail.ts src/client/render/sessionFloatingMenu.ts src/client/render/groupMessagePanel.ts src/client/main.ts src/client/styles.css tests/client/render/sessionGroupRail.test.ts tests/client/render/sessionFloatingMenu.test.ts tests/client/render/groupMessagePanel.test.ts
git commit -m "feat: add compact group message UI"
```

## Task 7: Reply Scan Performance Guardrails

**Files:**

- Modify: `src/server/createApp.ts`
- Modify: `src/server/services/groupMessages/createGroupMessageStore.ts`
- Test: `tests/server/createApp.test.ts`
- Optional: `tests/server/services/groupMessages/createGroupMessageStore.test.ts`

- [ ] **Step 1: Add failing tests for scan scope**

Cover:

- Scan only captures target sessions for the selected message.
- Scan skips targets already replied unless user passes an explicit `force` option.
- Scan uses a fixed line cap.
- Repeated scan of same reply does not create duplicates.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- tests/server/createApp.test.ts tests/server/services/groupMessages/createGroupMessageStore.test.ts
```

Expected: new scan guardrail tests fail.

- [ ] **Step 3: Implement scan guardrails**

Rules:

- Manual scan is allowed.
- No high-frequency auto scan in v0.2.0.
- If auto scan is added later, it must be event-driven and pending-message-only.
- Capture at most `300` recent lines per target.

- [ ] **Step 4: Run scan tests**

Run:

```bash
npm test -- tests/server/createApp.test.ts tests/server/services/groupMessages/createGroupMessageStore.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit performance guardrail slice**

```bash
git add src/server/createApp.ts src/server/services/groupMessages/createGroupMessageStore.ts tests/server/createApp.test.ts tests/server/services/groupMessages/createGroupMessageStore.test.ts
git commit -m "perf: limit kanban group reply scans"
```

## Task 8: Version, Local Package, And Verification

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Package output: `release/release.run`
- Package output: `release/tmux-ui-0.2.0.run`

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Build**

Run:

```bash
npm run build
```

Expected: build succeeds. Existing chunk size warnings are acceptable unless new warnings appear.

- [ ] **Step 3: Bump version to 0.2.0**

Run:

```bash
npm version 0.2.0 --no-git-tag-version
```

Expected: `package.json` and `package-lock.json` both show `0.2.0`.

- [ ] **Step 4: Package run files**

Run:

```bash
npm run pack:run
```

Expected:

- `release/release.run`
- `release/tmux-ui-0.2.0.run`

- [ ] **Step 5: Local install/restart**

Run:

```bash
./release/release.run install
./release/release.run restart
```

Expected: local packaged service restarts inside the expected service/tmux context.

- [ ] **Step 6: Verify local health**

Run:

```bash
curl -s http://100.89.0.116:3000/api/health
```

Expected: JSON contains `"version":"0.2.0"`.

- [ ] **Step 7: Commit version/package-ready state**

```bash
git add package.json package-lock.json release/release.run release/tmux-ui-0.2.0.run
git commit -m "chore: package tmux-ui 0.2.0"
```

## Task 9: Optional Full Publish After Local Verification

Only run this after the user explicitly asks for full publish.

- [ ] **Step 1: Publish to configured targets**

Run:

```bash
npm run publish -- --install --restart
```

Expected: configured targets receive the same `release/release.run`.

- [ ] **Step 2: Verify local, tw1, and vn health**

Run:

```bash
curl -s http://100.89.0.116:3000/api/health
ssh tw1 'curl -s http://127.0.0.1:3000/api/health'
ssh vn 'curl -s http://127.0.0.1:3000/api/health'
```

Expected: all report `"version":"0.2.0"`.

Do not count `tw0` as tested.

## Acceptance Criteria

- A session in a Kanban group can send a task to one other group session.
- A session in a Kanban group can send a report to all other live group sessions.
- Delivery state is shown per target.
- Missing/dead targets are skipped with visible warnings instead of failing the whole group request.
- A valid reply block printed in the target session is captured and attached to the original message.
- Message status moves from `pending` to `partial`, `replied`, or `failed` based on delivery/reply state.
- UI does not make no-group sessions lose the bottom toolbar.
- UI does not introduce a high-frequency dashboard/session scan loop.
- Full test suite and local packaged health check pass before any full publish.
