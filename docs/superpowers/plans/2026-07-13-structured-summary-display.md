# Structured Summary Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the spec's summary-first Activity/Attention experience for structured conversation and hook events, with canonical history/realtime records, safe actions, and phased pagination/performance support.

**Architecture:** Extend the shared timeline union with canonical conversation and typed hook records. The server owns identity, revision/upsert, sanitization, and broadcast consistency; focused client pure functions adapt records and derive collection-level grouping before a unified panel renders Activity and Attention views. Raw `/ws/terminal` remains unchanged.

**Tech Stack:** TypeScript, Express, Vitest, JSDOM, native DOM APIs, WebSocket event hub, Vite, Playwright/browser QA.

**Design source:** `docs/superpowers/specs/2026-07-13-structured-summary-display-design.md`

---

## Phase 1: Contract And Presentation Model

### Task 1: Canonical Timeline Types And Conversation Upsert Store

**Files:**
- Modify: `src/shared/timeline.ts`
- Modify: `src/server/services/timeline/createTimelineStore.ts`
- Create: `tests/server/services/timeline/createTimelineStore.test.ts`

- [ ] **Step 1: Write failing shared/store tests**

Add tests proving:

- a new conversation record receives stable `id`, equal initial `createdAt`/`updatedAt`, and `revision: 1`;
- `(sessionName, messageId)` upserts the same record;
- immutable-field changes, missing update revision, stale revision, revision gaps, terminal regressions, and conflicting terminal retries return typed store conflicts;
- same revision plus the same normalized semantic payload is idempotent;
- `TimelineEvent` explicitly supports conversation, typed hook, and legacy hook records while BaseTimelineEvent excludes their discriminators.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/server/services/timeline/createTimelineStore.test.ts`

Expected: FAIL because canonical types and `upsertConversationMessage` do not exist.

- [ ] **Step 3: Implement the minimal store contract**

Introduce focused store results/errors instead of HTTP concerns. Keep `addEvent` for append-only records, add `upsertConversationMessage`, preserve stable identity, and compare normalized semantic payloads deterministically. Do not add pagination yet.

- [ ] **Step 4: Verify GREEN and type/build compatibility**

Run:

```bash
npm test -- tests/server/services/timeline/createTimelineStore.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/timeline.ts src/server/services/timeline/createTimelineStore.ts tests/server/services/timeline/createTimelineStore.test.ts
git commit -m "feat: add canonical conversation timeline upserts"
```

### Task 2: Conversation API Summary, Revision, And Canonical Broadcast

**Files:**
- Create: `src/server/services/events/normalizeConversationMessage.ts`
- Create: `tests/server/services/events/normalizeConversationMessage.test.ts`
- Modify: `src/server/createApp.ts`
- Modify: `src/shared/appEvents.ts`
- Modify: `src/server/services/events/createAppEventHub.ts`
- Modify: `tests/server/createApp.test.ts`
- Modify: `tests/server/services/events/createAppEventHub.test.ts`
- Modify: `tests/client/events/appEventSocket.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Write failing API/event tests**

Cover the extracted normalizer plus API behavior: optional `summary`, required output `revision`/`updatedAt`, first revision validation, `428 revision_required`, stale/gap/immutable/terminal `409` codes, idempotent retries, and identical timeline/websocket identity. Assert rejected updates do not broadcast.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/server/services/events/normalizeConversationMessage.test.ts tests/server/createApp.test.ts tests/server/services/events/createAppEventHub.test.ts tests/client/events/appEventSocket.test.ts`

Expected: FAIL on the new response and identity assertions.

- [ ] **Step 3: Implement conversation normalization and publish-record behavior**

Extract conversation payload normalization from `createApp.ts`. Map store conflicts to the spec's HTTP status/error codes. Change the event hub to preserve supplied canonical `id`/timestamps for timeline records while continuing to generate identity for non-timeline events. Document single-create legacy compatibility and streaming producer upgrade requirements.

- [ ] **Step 4: Verify GREEN**

Run the focused command from Step 2 and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/events/normalizeConversationMessage.ts tests/server/services/events/normalizeConversationMessage.test.ts src/server/createApp.ts src/shared/appEvents.ts src/server/services/events/createAppEventHub.ts tests/server/createApp.test.ts tests/server/services/events/createAppEventHub.test.ts tests/client/events/appEventSocket.test.ts docs/api.md
git commit -m "feat: version structured conversation updates"
```

### Task 3: Typed Hook Records, Metadata Safety, And Legacy Compatibility

**Files:**
- Modify: `src/shared/timeline.ts`
- Modify: `src/shared/hookEvents.ts`
- Create: `src/server/services/events/normalizeHookEvent.ts`
- Create: `tests/server/services/events/normalizeHookEvent.test.ts`
- Create: `src/server/services/events/normalizeEventMetadata.ts`
- Create: `tests/server/services/events/normalizeEventMetadata.test.ts`
- Modify: `src/server/createApp.ts`
- Modify: `tests/server/createApp.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Write failing metadata and hook API tests**

Test typed hook history/realtime identity, complete top-level fields, dual-written legacy projection, sensitive-key redaction, UTF-8 2 KiB value truncation, deterministic normalized-key collision handling, 16 KiB budget, and `_truncated`. Verify raw sensitive values never appear in the response, timeline, or websocket payload.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/server/services/events/normalizeHookEvent.test.ts tests/server/services/events/normalizeEventMetadata.test.ts tests/server/createApp.test.ts`

Expected: FAIL because typed hook records and metadata sanitization do not exist.

- [ ] **Step 3: Implement sanitization and canonical hook append**

Extract hook normalization from `createApp.ts` and create a small metadata utility. Build one `HookEventTimelineEvent`, append it, broadcast that exact record, and preserve the legacy JSON projection under reserved metadata keys without exposing it as user metadata.

- [ ] **Step 4: Verify GREEN**

Run the focused tests and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/timeline.ts src/shared/hookEvents.ts src/server/services/events/normalizeHookEvent.ts tests/server/services/events/normalizeHookEvent.test.ts src/server/services/events/normalizeEventMetadata.ts tests/server/services/events/normalizeEventMetadata.test.ts src/server/createApp.ts tests/server/createApp.test.ts docs/api.md
git commit -m "feat: record typed hook events safely"
```

### Task 4: Pure Structured Presentation Adapters And Privacy-Safe Metrics

**Files:**
- Create: `src/client/structuredPresentation.ts`
- Create: `tests/client/structuredPresentation.test.ts`
- Create: `src/client/structuredPresentationMetrics.ts`
- Create: `tests/client/structuredPresentationMetrics.test.ts`
- Modify: `src/client/actionCenter.ts`
- Modify: `tests/client/actionCenter.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Cover typed, legacy, and corrupt hooks; trimmed summary with its independent length cap; conversation summary fallbacks for every content type/status; status/severity/attention truth table; finite/ranged metadata stats; nullable session; action deduplication and target precedence; lazy detail descriptors; `collapsed: false` only in expanded non-Toast views; parent/tool grouping; orphan children; and failed-child Attention promotion.

Add privacy-safe counters for conversation/hook totals, missing producer summaries, fallback summary categories, and Attention totals. Assert the metrics API accepts only enum/count inputs and cannot receive or retain content/body/summary strings.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/client/structuredPresentation.test.ts tests/client/structuredPresentationMetrics.test.ts tests/client/actionCenter.test.ts`

Expected: FAIL because the adapters and unified model do not exist.

- [ ] **Step 3: Implement two pure layers**

Implement `adaptStructuredRecord(record)` and `deriveStructuredPresentation(items)`. Move reusable legacy hook parsing out of Action Center. Keep input prompts/dead panes as Attention-only legacy items without forcing them into the structured event schema. Record only categorical/count diagnostics through the separate metrics module.

- [ ] **Step 4: Verify GREEN**

Run the focused tests and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/client/structuredPresentation.ts tests/client/structuredPresentation.test.ts src/client/structuredPresentationMetrics.ts tests/client/structuredPresentationMetrics.test.ts src/client/actionCenter.ts tests/client/actionCenter.test.ts
git commit -m "feat: derive structured activity summaries"
```

### Task 5: Phase 1 Release Compatibility Gate

**Files:**
- Create: `config/structured-events-compat.json`
- Create: `scripts/check-structured-events-compat.mjs`
- Create: `tests/scripts/check-structured-events-compat.test.ts`
- Modify: `tests/scripts/run-release.test.ts`
- Modify: `scripts/publish-run.mjs`
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/api.md`

- [ ] **Step 1: Write failing release-gate tests**

Test that every registered strict decoder and repeated-message streaming producer has a minimum compatible version and `compatible: true`; malformed/unready entries fail. Assert local publish and GitHub release run `npm run check:structured-events-compat` before packing/uploading. The initial manifest must enumerate all currently known consumers/producers; an empty category is allowed only with an explicit audited-at date and owner.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/scripts/check-structured-events-compat.test.ts tests/scripts/run-release.test.ts`

Expected: FAIL because the manifest/check and release integration do not exist.

- [ ] **Step 3: Implement the executable gate**

Make the check deterministic and offline. `publish-run.mjs` must fail before any SSH/SCP when the check fails; the release workflow must check before `pack:run`. Document how to register a strict client or streaming producer and update its minimum version.

- [ ] **Step 4: Verify Phase 1 completely**

Run:

```bash
npm test
npm run build
npm run check:structured-events-compat
git diff --check
```

Expected: all pass. Phase 1 is code-complete but production release remains blocked whenever any manifest entry is unready.

- [ ] **Step 5: Commit**

```bash
git add config/structured-events-compat.json scripts/check-structured-events-compat.mjs tests/scripts/check-structured-events-compat.test.ts tests/scripts/run-release.test.ts scripts/publish-run.mjs .github/workflows/release.yml package.json package-lock.json docs/api.md
git commit -m "build: gate structured event compatibility"
```

## Phase 2: Activity Summary Flow

### Task 6: Capture The Pre-Activity Performance Baseline

**Files:**
- Create: `scripts/benchmark-structured-activity.mjs`
- Create: `tests/scripts/benchmark-structured-activity.test.ts`
- Create: `tests/fixtures/structured-activity.json`
- Create: `performance/structured-activity-baseline.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/structured-activity-harness.ts`
- Create: `.github/workflows/structured-activity-benchmark.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing benchmark-harness tests**

Require the fixed 1,000-record fixture (100 tool children, 20 Attention, 160-character summaries, every tenth item with 8 KiB details), five warm runs, runner/commit metadata, performance mark names, and a mandatory baseline comparison mode. Define a deterministic runner fingerprint; compare mode must fail when it differs from the baseline artifact.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/scripts/benchmark-structured-activity.test.ts`

- [ ] **Step 3: Implement the reusable harness and capture baseline**

Install and configure `@playwright/test`. Capture `BASELINE_SHA=$(git rev-parse HEAD)` before Task 6 is committed; this current HEAD is the completed Phase 1 parent. The same script must benchmark that supplied SHA using an isolated parent worktree/server and the new fixture injector; save the resulting artifact with the exact SHA. Add a CI workflow whose single benchmark job checks out baseline and candidate, runs both on the same runner, and fails on fingerprint mismatch or either budget. Do not begin Task 7 until the committed artifact exists.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/scripts/benchmark-structured-activity.test.ts
BASELINE_SHA=$(git rev-parse HEAD)
npm run benchmark:activity -- --mode baseline --target-commit "$BASELINE_SHA"
```

Expected: tests pass and the artifact records five warm runs plus median for the parent commit.

- [ ] **Step 5: Commit**

```bash
git add scripts/benchmark-structured-activity.mjs tests/scripts/benchmark-structured-activity.test.ts tests/fixtures/structured-activity.json performance/structured-activity-baseline.json playwright.config.ts tests/e2e/structured-activity-harness.ts .github/workflows/structured-activity-benchmark.yml package.json package-lock.json
git commit -m "test: capture structured activity baseline"
```

### Task 7: Incremental Timeline State And Unified Panel State

**Files:**
- Modify: `src/client/state/dashboardStore.ts`
- Modify: `tests/client/state/dashboardStore.test.ts`
- Modify: `src/client/main.ts`
- Modify: `tests/client/events/appEventRefreshScheduler.test.ts`

- [ ] **Step 1: Write failing state tests**

Prove realtime records merge by stable event `id`, streaming updates replace rather than duplicate, reconnect reload remains authoritative, expanded ids survive normal refresh, and panel tab/selected event state follows Activity vs Attention entry rules.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/client/state/dashboardStore.test.ts tests/client/events/appEventRefreshScheduler.test.ts`

- [ ] **Step 3: Implement minimal incremental state**

Add a store method for canonical timeline record merge and focused UI state in `main.ts`. Stop fetching the whole timeline for every structured websocket event; retain refresh-on-reconnect.

- [ ] **Step 4: Verify GREEN**

Run focused tests plus `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/client/state/dashboardStore.ts tests/client/state/dashboardStore.test.ts src/client/main.ts tests/client/events/appEventRefreshScheduler.test.ts
git commit -m "feat: merge realtime activity records"
```

### Task 8: Activity And Attention Panel Rendering

**Files:**
- Modify: `src/client/render/actionCenter.ts`
- Modify: `tests/client/render/actionCenter.test.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/client/styles.test.ts`
- Modify: `src/client/main.ts`
- Modify: `playwright.config.ts`
- Create: `tests/e2e/structured-event-panel.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing component/style tests**

Test Activity/Attention tabs, default tab rules, summary-first cards, semantic status labels, details expansion, stable `aria-expanded`, empty/loading/reconnect states, corrupt fallback, metadata lazy rendering, and no action controls in ordinary completed Activity items.

Add a Playwright smoke test that loads a deterministic structured-event fixture and exercises Activity/Attention tabs plus details expansion in Chromium.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/client/render/actionCenter.test.ts tests/client/styles.test.ts
npx playwright test tests/e2e/structured-event-panel.spec.ts --project=chromium
```

Expected: both Vitest and Playwright fail on missing Activity/Attention behavior.

- [ ] **Step 3: Implement the unified panel**

Reuse the existing modal/backdrop and compact visual language. Render full content only after expansion. Use buttons/tabs/details with accessible names; keep mobile layout constrained and avoid nested cards.

- [ ] **Step 4: Verify GREEN and Phase 2 completely**

Run:

```bash
npm test
npm run build
npx playwright test tests/e2e/structured-event-panel.spec.ts --project=chromium
npm run benchmark:activity -- --mode compare --baseline performance/structured-activity-baseline.json
git diff --check
```

Capture screenshots at 390x844, 768x1024, and 1440x900. Expected: all automated checks pass, no horizontal overflow/overlap/console error, and the benchmark stays inside both the absolute and relative spec budgets.

- [ ] **Step 5: Commit**

```bash
git add src/client/render/actionCenter.ts tests/client/render/actionCenter.test.ts src/client/styles.css tests/client/styles.test.ts src/client/main.ts playwright.config.ts tests/e2e/structured-event-panel.spec.ts package.json package-lock.json
git commit -m "feat: add activity and attention views"
```

## Phase 3: Accurate Attention And Actions

### Task 9: Safe Action Execution And Toast Routing

**Files:**
- Modify: `src/client/main.ts`
- Modify: `src/client/api/sessionApi.ts`
- Modify: `src/server/routes/sessionRoutes.ts`
- Modify: `src/client/render/hookEventToast.ts`
- Modify: `tests/client/render/hookEventToast.test.ts`
- Modify: `tests/server/createApp.test.ts`
- Modify: `tests/server/routes/sessionRoutes.test.ts`
- Create: `src/client/structuredActionRunner.ts`
- Create: `tests/client/structuredActionRunner.test.ts`
- Modify: `tests/client/actionCenter.test.ts`

- [ ] **Step 1: Write failing action/toast tests**

Cover target precedence, client pre-disable, server `404 target_session_not_found`, `409 target_session_unavailable`, no fallback session, input-before-navigation, navigation only after input success, Kanban-only navigation, disabled corrupt/incomplete actions, danger styling, at-most-two Toast actions, and Toast detail routing to a selected Attention item.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/server/routes/sessionRoutes.test.ts tests/client/structuredActionRunner.test.ts tests/client/actionCenter.test.ts tests/client/render/hookEventToast.test.ts`

- [ ] **Step 3: Implement safe action execution**

Create a focused action runner. Keep `sessionRoutes.ts` authoritative, preserve structured error codes in `sessionApi`, refresh sessions after target races, retain the event after failure, and never retry against another session. Make ordinary completion Toasts silent while preserving Activity history.

- [ ] **Step 4: Verify GREEN and Phase 3 completely**

Run:

```bash
npm test
npm run build
npx playwright test tests/e2e/structured-event-panel.spec.ts --project=chromium
git diff --check
```

Capture the three required responsive screenshots again and verify Toast-to-Attention routing plus failed/dead target behavior in Chromium.

- [ ] **Step 5: Commit**

```bash
git add src/client/main.ts src/client/api/sessionApi.ts src/client/structuredActionRunner.ts tests/client/structuredActionRunner.test.ts src/server/routes/sessionRoutes.ts tests/server/routes/sessionRoutes.test.ts src/client/render/hookEventToast.ts tests/client/render/hookEventToast.test.ts tests/client/actionCenter.test.ts
git commit -m "fix: route structured actions safely"
```

## Phase 4: Pagination, Grouping Performance, And Release Readiness

### Task 10: Cursor Timeline Pagination And Retention

**Files:**
- Modify: `src/server/services/timeline/createTimelineStore.ts`
- Modify: `tests/server/services/timeline/createTimelineStore.test.ts`
- Modify: `src/server/createApp.ts`
- Modify: `tests/server/createApp.test.ts`
- Modify: `src/client/api/sessionApi.ts`
- Modify: `src/client/state/dashboardStore.ts`
- Modify: `tests/client/state/dashboardStore.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Write failing pagination tests**

Test descending `(createdAt,id)` order, opaque cursor repeatability, new-event insertion without duplicate/skip, invalid cursor `400`, evicted boundary `410`, configurable `TMUX_UI_TIMELINE_MAX_EVENTS` defaulting to 1000, per-page cap, client append/dedupe, and restart-from-first-page on expiry.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/server/services/timeline/createTimelineStore.test.ts tests/server/createApp.test.ts tests/client/state/dashboardStore.test.ts`

- [ ] **Step 3: Implement cursor pagination**

Keep cursors server-owned and opaque. Add a paged API return type rather than changing callers through casts. Preserve default small first-page loading.

- [ ] **Step 4: Verify GREEN**

Run focused tests and `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/timeline/createTimelineStore.ts tests/server/services/timeline/createTimelineStore.test.ts src/server/createApp.ts tests/server/createApp.test.ts src/client/api/sessionApi.ts src/client/state/dashboardStore.ts tests/client/state/dashboardStore.test.ts docs/api.md
git commit -m "feat: paginate structured timeline history"
```

### Task 11: Streaming Throttle, Responsive QA, And Performance Fixture

**Files:**
- Create: `tests/client/structuredActivity.performance.test.ts`
- Modify: `src/client/state/dashboardStore.ts`
- Modify: `src/client/render/actionCenter.ts`
- Modify: `src/client/styles.css`
- Modify: `tests/client/render/actionCenter.test.ts`
- Modify: `tests/client/styles.test.ts`
- Modify: `scripts/benchmark-structured-activity.mjs`
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/structured-event-panel.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing high-volume/streaming tests**

Use fake timers to deliver exactly 300 updates at 100 ms intervals (10 Hz for 30 seconds). Assert they retain one item, rendered event elements remain at or below 200, collapsed details are not materialized, and parent/tool grouping stays stable.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/client/structuredActivity.performance.test.ts tests/client/render/actionCenter.test.ts tests/client/styles.test.ts`

- [ ] **Step 3: Implement bounded rendering and benchmark script**

Throttle render scheduling without delaying Attention. Render a bounded window/page, preserve selected/expanded records, and emit the spec's performance marks. The benchmark script records fixture/version/runner metadata and five warm-run values.

- [ ] **Step 4: Verify GREEN and collect the benchmark**

Run:

```bash
npm test -- tests/client/structuredActivity.performance.test.ts tests/client/render/actionCenter.test.ts tests/client/styles.test.ts
npm run build
npm run benchmark:activity -- --mode compare --baseline performance/structured-activity-baseline.json
npx playwright test tests/e2e/structured-event-panel.spec.ts --project=chromium
```

Expected: tests/build pass; benchmark requires `performance/structured-activity-baseline.json` and reports median plus mandatory absolute and relative budget results.

- [ ] **Step 5: Commit**

```bash
git add tests/client/structuredActivity.performance.test.ts src/client/state/dashboardStore.ts src/client/render/actionCenter.ts src/client/styles.css tests/client/render/actionCenter.test.ts tests/client/styles.test.ts scripts/benchmark-structured-activity.mjs playwright.config.ts tests/e2e/structured-event-panel.spec.ts package.json package-lock.json
git commit -m "perf: bound structured activity rendering"
```

### Task 12: Documentation, Full Verification, And Browser QA

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/api.md`
- Modify: `scripts/install-agent-hooks.mjs`
- Modify: `scripts/tmux-ui-agent-hook.mjs`
- Modify: `tests/scripts/install-agent-hooks.test.ts`
- Modify: `tests/scripts/run-release.test.ts`

- [ ] **Step 1: Add failing producer/release tests**

Require generated examples to include summary/revision guidance, minimum compatible producer/client versions, and the Phase 1 release gate. Add an example multi-update streaming sequence.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/scripts/install-agent-hooks.test.ts tests/scripts/run-release.test.ts`

- [ ] **Step 3: Update producer integration and docs**

Teach bundled hook producers to send accurate summaries. Document monotonically increasing revisions for any conversation producer that repeats a message id; do not claim the current hook scripts produce conversation messages. Document fallback behavior, privacy rules, pagination, error codes, Activity/Attention, observability counters, compatibility manifest, release gate, and rollback boundaries in both READMEs/API docs.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
npm test
npm run build
npm run benchmark:activity -- --mode compare --baseline performance/structured-activity-baseline.json
npx playwright test tests/e2e/structured-event-panel.spec.ts --project=chromium
git diff --check
```

Expected: all pass with a clean worktree except intended changes.

- [ ] **Step 5: Run browser QA**

Start the dev server and verify with the repository browser skill at 390x844, 768x1024, and 1440x900:

- Activity shows at least three ordinary collapsed items at 390x844;
- Attention reasons/actions remain visible;
- details expand without additional network requests;
- long commands and 2 KiB words stay inside the details scroller;
- no horizontal page overflow, overlap, blank panel, or console error;
- realtime streaming updates one item in place;
- Toast routes to the matching Attention item.

Capture screenshots and report the URL, viewport, and evidence.

- [ ] **Step 6: Commit**

```bash
git add README.md README.zh-CN.md docs/api.md scripts/install-agent-hooks.mjs scripts/tmux-ui-agent-hook.mjs tests/scripts/install-agent-hooks.test.ts tests/scripts/run-release.test.ts
git commit -m "docs: publish structured activity integration"
```

## Final Review And Integration

- [ ] Dispatch an independent spec-compliance reviewer for the complete diff against `docs/superpowers/specs/2026-07-13-structured-summary-display-design.md`.
- [ ] Resolve every High/Medium finding and re-run its affected tests.
- [ ] Dispatch an independent code-quality/security reviewer.
- [ ] Run `npm test`, `npm run build`, `git diff --check`, and browser QA again after fixes.
- [ ] Use `superpowers:finishing-a-development-branch` to merge the feature branch back to `main`, verify on merged `main`, then clean up the completed worktree.
