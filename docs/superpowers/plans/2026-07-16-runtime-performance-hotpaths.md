# Runtime Performance Hotpaths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all five measured performance recommendations without changing standard xterm input, Ctrl-C, pane, scroll, or tmux behavior.

**Architecture:** Keep xterm and existing HTTP/WS contracts. Optimize only hot boundaries: cached terminal chrome render inputs, structural store reconciliation with keyed single-flight, delayed tail-only prompt snapshots, bounded WebSocket delivery plus a process-scoped bridge factory, and compressed immutable hashed assets. Every phase starts with a failing behavior test and ends with a repeatable benchmark.

**Tech Stack:** TypeScript, Vitest, Express 5, ws, xterm.js, node-pty, Playwright/CDP.

## Evidence And Budgets

Baseline commit: `6a5f503`. Runner: local macOS Chromium headless against production service `http://100.89.0.116:3000`, 2026-07-16.

| Symptom | Baseline | Required evidence after change |
|---|---:|---|
| No-op terminal resize churn | 10 cycles: 251 subtree nodes added, 250 removed, 559.7ms | 0 terminal-chrome subtree replacements for unchanged inputs; elapsed no worse than 420ms for the same two-RAF harness |
| Dashboard cold load | FCP p50 80ms, 9 requests, 252,529 bytes | FCP/request count no more than 20% worse |
| Terminal open | p50 119ms, p95 135ms | Neither percentile more than 20% worse |
| API | sequential p95 <=23.1ms; 30-concurrent p95 <=72.2ms | Neither threshold more than 20% worse |
| Hashed terminal JS | 479,924-byte identity transfer; 124,647-byte gzip artifact | gzip or br transfer <=135,000 bytes; `public,max-age=31536000,immutable` |
| Server idle | about 1% CPU, 106,256KB RSS with 18 sessions/23 panes | No sustained >20% regression after a 30-second idle sample |

Create untracked benchmark artifacts under `.gstack/benchmark-reports/runtime-hotpaths/`. Add reusable scripts under `scripts/bench-runtime-hotpaths.mjs` and tests for their metric summarizers. Build and start two isolated services: baseline `6a5f503` from the main checkout on `HOST=127.0.0.1 PORT=3100`, and the candidate worktree on `HOST=127.0.0.1 PORT=3101`. The harness must fetch each `/api/health` first and reject a run unless the reported commit equals the requested baseline/candidate SHA.

Commands:

- Baseline HTTP/browser: `node scripts/bench-runtime-hotpaths.mjs http://127.0.0.1:3100 --expect-commit 6a5f503 --runs 7 --api-runs 30 --api-concurrency 30 --idle-seconds 30`
- Candidate HTTP/browser: `node scripts/bench-runtime-hotpaths.mjs http://127.0.0.1:3101 --expect-commit <candidate-sha> --runs 7 --api-runs 30 --api-concurrency 30 --idle-seconds 30`
- Asset headers: `curl -fsSI -H 'Accept-Encoding: br, gzip' <hashed-asset-url>`
- Store microbench: `node scripts/bench-runtime-hotpaths.mjs --store-events 100,500 --rate 20`
- WS policy tests: focused Vitest with fake `bufferedAmount` and fake timers.

The script records SHA, health commit, Node/Chromium versions, URL, run count, sequential and 30-concurrent API raw samples/p50/p95, browser samples, mutations, resource bytes, and 30 one-second process CPU/RSS samples in JSON. It discovers the server PID from the listening port and rejects missing/mismatched process evidence. Absolute budgets above gate the work; a metric exceeding 20% relative regression also fails.

Captured artifact: `.gstack/benchmark-reports/runtime-hotpaths/baseline-6a5f503.json` from harness commit `81136af`. Dashboard ready p50/p95: 540.7/629.2ms; network idle: 1135.7/3543.1ms; terminal open: 135.2/179.7ms; no-op resize: 6 mutation records per run; transfer p50/p95: 252,518/252,519 bytes; idle CPU p50/p95: 0/1.1%; RSS p50/p95: 87,375,872 bytes. The artifact is intentionally `valid:false`: 18/30 concurrent `kanban-projects` requests returned HTTP 500, while successful concurrent samples were p50/p95 2940.1/2943.1ms. Candidate verification must eliminate this error or explicitly revise the gate through review.

---

### Task 0: Commit The Benchmark Harness And Baseline

**Files:**
- Create: `scripts/bench-runtime-hotpaths.mjs`
- Create: `tests/scripts/bench-runtime-hotpaths.test.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-07-16-runtime-performance-hotpaths.md`

- [x] Write failing tests for percentile, relative-budget, and mutation-summary helpers.
- [x] Run `npm test -- tests/scripts/bench-runtime-hotpaths.test.ts`; expect missing exports.
- [x] Implement the read-only Playwright/API/header harness and JSON report output.
- [x] Capture `6a5f503` on port 3100 with 7 browser runs, 30 sequential and concurrent API runs, and 30 seconds of idle process samples.
- [x] Record artifact path and exact metrics in this plan.

### Task 1: Skip Unchanged Terminal Chrome Renders

**Files:**
- Create: `src/client/render/terminalChromeRenderCache.ts`
- Create: `tests/client/render/terminalChromeRenderCache.test.ts`
- Modify: `src/client/main.ts`
- Test: existing status bar, rail, and floating menu tests.

The cache is keyed by tab id and mounted-terminal identity. A serializable signature includes session summary display fields, connection state, responsive tier, action count, project/board/session names and statuses, menu open/focus/draft state, keyboard mode, and relevant local UI flags. Callback identity is excluded. Each cache entry owns one stable actions object whose closures resolve current global/store state at call time; remount, tab close, or terminal identity change invalidates it.

- [ ] Write tests proving equal signatures return the same stable actions and skip all three render callbacks.
- [ ] Write tests proving changed display data rerenders, changed callbacks are observed through the stable indirection, and tab close/remount clears the entry.
- [ ] Confirm failures against the missing cache.
- [ ] Integrate the cache into `syncTerminalStatusBars` and initial terminal mount.
- [ ] Run focused component tests and the no-op resize mutation benchmark; require zero terminal-chrome replacements.

### Task 2: Structural Store Equality And Request Single-Flight

**Files:**
- Create: `src/client/state/dashboardStateReconciler.ts`
- Create: `src/client/state/singleFlight.ts`
- Create: corresponding tests.
- Modify: `src/client/state/dashboardStore.ts`

Reconcile these slices explicitly: scalar loading/error/cursors; server status fields; kanban project names/settings/session arrays; session fields including input prompt fields and pane id/status/geometry fields; timeline by id/type/revision/status/createdAt and payload reference, reusing previous objects when field-equal. No whole-slice `JSON.stringify` remains in `commit`.

Single-flight keys are exact: `status:<session>`, `sessions:<preview>:<panes>:<server-status>:<sorted-muted>`, `server-status`, `kanban`, and `timeline:<cursor-or-latest>:<limit>:<history-expired>`. Only identical keys coalesce. Entries clear on resolve and reject. Timeline generation/baseline merge remains authoritative so WS events received during a refresh are retained and stale generations cannot overwrite them.

- [ ] Write failing equality tests for every nested slice and notification behavior.
- [ ] Write failing success, rejection/retry, distinct-key, WS-during-refresh, and stale-generation single-flight tests.
- [ ] Implement structural reuse and keyed single-flight.
- [ ] Run store tests and 100/500-event microbench; require no full-slice serialization and no ordering regression.

### Task 3: Bound Prompt Detection Work

**Files:**
- Create: `src/client/terminal/promptSnapshotScheduler.ts`
- Create: `tests/client/terminal/promptSnapshotScheduler.test.ts`
- Modify: `src/client/terminal/createTerminalTab.ts`
- Modify: existing terminal tests.

PTY bytes continue to enter `terminal.write` on every animation-frame output flush. Prompt snapshots are separate: inspect only the last 8 visible rows, at most once every 150ms. A pending snapshot runs after the latest `terminal.write` callback. Idle/final output flushes the snapshot; destroy and reconnect cancel it; close/exit performs one final snapshot only after the final write callback. Visibility changes do not discard pending work.

- [ ] Write failing burst, tail-row, write-order, idle, exit, reconnect, and destroy tests.
- [ ] Add regressions for printable input, Enter, raw `\x03`, CSI-u `\x1b[99;5u`, and ordinary xterm input.
- [ ] Implement the scheduler and tail extraction.
- [ ] Run terminal tests and a 60fps spinner/bulk-log benchmark; require <=7 snapshots/second and unchanged PTY byte delivery.

### Task 4: Bounded WebSocket Delivery And Bridge Factory

**Files:**
- Create: `src/server/ws/socketBackpressure.ts`
- Create: corresponding tests.
- Modify: `src/server/ws/createTerminalSocketServer.ts`
- Modify: `src/server/ws/createAppEventSocketServer.ts`
- Create: `src/server/services/terminal/createTerminalBridgeFactory.ts`
- Modify: `src/server/services/terminal/createTerminalBridge.ts`
- Modify: focused WS/bridge tests.

Policy for both sockets: low watermark 128KiB, high watermark 512KiB, hard limit 1MiB for `bufferedAmount + pending application bytes`. Above high, retain bounded pending data and retry after 16ms; resume only at/below low. Above hard limit, cancel timers/buffers and close with code 1013, reason `Client too slow`. Normal close/exit flushes only when under hard limit; otherwise it follows the same 1013 path. Tests use fake timers and explicit buffered values.

The app-event server owns one eventHub subscription and one `JSON.stringify` per event, then fans the string to sockets through the same policy.

The default bridge factory owns configuration state. It marks configured only after `show-options` and every synchronous `tmux set-option` command returns status 0; throw/nonzero remains retryable. Tests instantiate a fresh factory, so no module reset hook exists. Every viewer still gets its own PTY in this phase; shared bridge fan-out is explicitly deferred because input/resize ownership requires a separate design.

- [ ] Write failing watermark, recovery, hard-close, cleanup, single-serialization, configure-once, and retry tests.
- [ ] Implement policy, event fan-out, and factory.
- [ ] Run focused tests and confirm bounded memory under synthetic slow sockets.

### Task 5: Compress And Cache Static Assets

**Files:**
- Modify: `src/server/createApp.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/server/createApp.test.ts`

Use the maintained `compression` package version selected from its current npm/Express documentation, pinned by the lockfile. Hashed assets match `/assets/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|svg)$` and receive `Cache-Control: public,max-age=31536000,immutable`. Unhashed assets and source maps use `public,max-age=0,must-revalidate`. `index.html` and SPA fallback use `no-cache`. Compression negotiates br/gzip/identity, sets `Vary: Accept-Encoding`, and leaves unsupported encodings on identity/406 behavior defined by the middleware.

- [ ] Write failing integration tests for br, gzip, identity, Vary, hashed/unhashed/source-map caching, index, and SPA fallback.
- [ ] Verify the dependency's official capability before installation.
- [ ] Add middleware and exact static `setHeaders` policy.
- [ ] Test against fixture files and the actual production build.
- [ ] Require terminal JS compressed transfer <=135,000 bytes.

### Task 6: Final Verification, Merge, And Release

- [ ] Bump `package.json` and `package-lock.json` once to the next patch version on the worktree branch.
- [ ] Dispatch independent spec and code-quality reviews and resolve every finding.
- [ ] Create a reviewed candidate commit after resolving findings.
- [ ] Run focused tests, `npm test`, `npm run build`, `npm audit --omit=dev --registry=https://registry.npmjs.org`, and baseline/candidate benchmark gates on ports 3100/3101 against that exact candidate SHA.
- [ ] If a failed gate requires a source change, re-review the change, create a new candidate commit, and rerun every gate against the new SHA. The last green candidate commit is the final reviewed commit.
- [ ] Package exactly once from that final commit with `npm run pack:run`; record SHA-256 and verify the artifact's `/api/health` commit equals the final commit.
- [ ] Merge the final reviewed commit into `main` without source changes; push `origin/main`.
- [ ] Install/restart the exact artifact locally, then publish the same artifact to `tw1:/root/tmux`, `m9:/home/gouki/tmux`, `vn:/root/tmux`, and `vn200:/root/tmux`. Attempt `cc1:/root/tmux` separately; timeout is reported and does not block other targets.
- [ ] Verify live host/port and `/api/health` version/commit on local, tw1, m9, vn, and vn200. Never count tw0. Do not claim cc1 if SSH fails.
