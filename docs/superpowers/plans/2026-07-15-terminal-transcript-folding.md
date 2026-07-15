# Terminal Transcript Folding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved B layout so Codex process records form compact accordion button groups while terminal whitespace, colors, typography, and raw-terminal behavior remain faithful to xterm.

**Architecture:** Extend the local xterm transcript parser to preserve blank physical lines and expose consecutive activity groups without broadening the recognition grammar. Keep one expanded record per terminal tab in `structuredOutputState`, render grouped activities as flat buttons, and pass the active session typography to the overlay through terminal-frame CSS custom properties.

**Tech Stack:** TypeScript, xterm.js, DOM APIs, CSS, Vitest/jsdom, Vite, Playwright/browser screenshots.

---

### Task 1: Preserve transcript structure and recognition safety

**Files:**
- Modify: `src/client/terminal/structuredOutput.ts`
- Test: `tests/client/terminal/structuredOutput.test.ts`

- [x] **Step 1: Write failing parser tests**

Add cases proving that multiple blank physical lines remain present in narrative blocks, blank lines do not split consecutive activity groups, and an indented `  • Ran nested task` cannot count as a top-level process record.

- [x] **Step 2: Run the focused parser tests and verify RED**

Run: `npm test -- tests/client/terminal/structuredOutput.test.ts`

Expected: the new whitespace/grouping expectations fail against `normalizeTranscriptGroup`, and the indented-bullet test fails against the current `^\s*[•·]` recognition.

- [x] **Step 3: Implement the minimal transcript model**

Preserve blank narrative lines instead of trimming/filtering the group. Add an explicit activity grouping identifier or group block representation so consecutive activities remain in one group across blank lines, while non-empty narrative ends the group. Tighten title recognition to `^[•·]\s+` after soft-wrap merging.

- [x] **Step 4: Run focused parser tests and verify GREEN**

Run: `npm test -- tests/client/terminal/structuredOutput.test.ts`

Expected: all parser tests pass, including existing soft-wrap, stable-ID, style, and shell-output regressions.

### Task 2: Enforce transcript-only accordion state

**Files:**
- Modify: `src/client/terminal/structuredOutputState.ts`
- Test: `tests/client/terminal/structuredOutputState.test.ts`

- [x] **Step 1: Write failing state tests**

Assert that the transcript-specific toggle opening `activity:b` closes `activity:a`, clicking `activity:b` again closes it, and `reconcile` clears the active ID when the record disappears. Add a regression proving the existing conversation toggle can still keep two conversation IDs expanded. Preserve explicit raw-terminal view behavior.

- [x] **Step 2: Run the focused state tests and verify RED**

Run: `npm test -- tests/client/terminal/structuredOutputState.test.ts`

Expected: no transcript-specific toggle exists and the current additive `Set` retains both activity IDs.

- [x] **Step 3: Implement single-expansion state**

Keep the public `getExpandedIds()` renderer contract and existing additive `toggleExpanded()` behavior for conversation cards. Add `toggleTranscriptExpanded()` that removes any currently expanded transcript activity ID and replaces it with either the selected activity ID or none; pass the transcript activity IDs from `main.ts` so conversation expansions remain untouched. Keep `reconcile()` responsible for removing stale expansion after snapshot updates.

- [x] **Step 4: Run focused state tests and verify GREEN**

Run: `npm test -- tests/client/terminal/structuredOutputState.test.ts`

Expected: all state tests pass.

### Task 3: Render compact activity button groups

**Files:**
- Modify: `src/client/render/terminalStructuredOutput.ts`
- Modify: `src/client/styles.css`
- Test: `tests/client/render/terminalStructuredOutput.test.ts`
- Test: `tests/client/styles.test.ts`

- [x] **Step 1: Write failing DOM tests**

Assert that consecutive activities share one `.terminal-agent-transcript-activity-group`, non-empty narrative creates a new group, button titles do not change to `Hide ...`, expanded content is attached to its selected button, and preserved blank lines remain visible in narrative text.

- [x] **Step 2: Run focused renderer tests and verify RED**

Run: `npm test -- tests/client/render/terminalStructuredOutput.test.ts tests/client/styles.test.ts`

Expected: current per-activity sections and `Hide ${title}` text fail the new structure.

- [x] **Step 3: Implement grouped renderer**

Build flat activity groups in transcript order. Use buttons with stable titles and `aria-expanded`; render at most one detail panel from the state contract. Keep `textContent` and existing whitelisted cell-style application.

- [x] **Step 4: Replace card styling with the approved B layout**

Remove per-activity borders, detail separators, and fixed grid gaps. Use a wrapping inline-flex button group with restrained spacing, a light selected background, and terminal-preserving narrative whitespace. Do not add status badges or decorative separators.

- [x] **Step 5: Run focused renderer tests and verify GREEN**

Run: `npm test -- tests/client/render/terminalStructuredOutput.test.ts tests/client/styles.test.ts`

Expected: all renderer tests pass.

### Task 4: Synchronize overlay typography with each xterm session

**Files:**
- Modify: `src/client/terminal/createTerminalTab.ts`
- Modify: `src/client/main.ts`
- Modify: `src/client/render/terminalStructuredOutput.ts`
- Modify: `src/client/styles.css`
- Test: `tests/client/terminal/createTerminalTab.test.ts`
- Test: `tests/client/render/terminalStructuredOutput.test.ts`
- Test: `tests/client/styles.test.ts`

- [x] **Step 1: Write failing typography tests**

Assert that terminal creation and later `setFontFamily`, `setFontSize`, and `setLineHeight` updates write matching `--terminal-output-font-family`, `--terminal-output-font-size`, and `--terminal-output-line-height` properties on the terminal frame. Assert transcript narrative, buttons, and details inherit those variables. Add explicit interaction regressions proving Ctrl+C still emits `\x03` while the Agent output overlay is visible, and switching to Raw terminal exposes the xterm that continued receiving PTY output without changing its measured rows/columns.

- [x] **Step 2: Run focused terminal and renderer tests and verify RED**

Run: `npm test -- tests/client/terminal/createTerminalTab.test.ts tests/client/render/terminalStructuredOutput.test.ts tests/client/styles.test.ts`

Expected: the CSS variables do not exist yet.

- [x] **Step 3: Implement typography propagation**

Initialize the frame variables from the effective xterm options after `terminal.open()`. Update them in the existing font setters, using CSS-safe values and the same clamped settings already applied to xterm. Make the transcript container, buttons, and `pre` inherit these variables.

- [x] **Step 4: Run focused typography tests and verify GREEN**

Run: `npm test -- tests/client/terminal/createTerminalTab.test.ts tests/client/render/terminalStructuredOutput.test.ts tests/client/styles.test.ts`

Expected: all focused tests pass.

### Task 5: Verify the complete terminal behavior

**Files:**
- Verify: all files above
- Create: `tests/e2e/terminal-transcript-harness.html`
- Create: `tests/e2e/terminal-transcript-harness.ts`
- Create: `tests/e2e/terminal-transcript.spec.ts`
- Update only if evidence requires it: `docs/superpowers/specs/2026-07-14-terminal-structured-output-design.md`

- [x] **Step 1: Run all terminal-focused tests**

Run: `npm test -- tests/client/terminal/structuredOutput.test.ts tests/client/terminal/structuredOutputState.test.ts tests/client/render/terminalStructuredOutput.test.ts tests/client/terminal/createTerminalTab.test.ts tests/client/styles.test.ts`

Expected: all pass with zero failures.

- [x] **Step 2: Run the full suite and production build**

Run: `npm test`

Run: `npm run build`

Run: `git diff --check`

Expected: zero test failures, successful TypeScript/Vite build, and no whitespace errors.

- [x] **Step 3: Add an executable terminal transcript browser harness**

Follow the existing `structured-event-panel` E2E harness pattern, but mount the real `createTerminalTab`, `renderTerminalStructuredOutput`, `createTerminalStructuredOutputState`, and session floating menu inside a terminal panel. Install a deterministic browser-side WebSocket stub before creating the terminal; it must capture client input/resize messages and allow the harness to emit PTY output into the real xterm. Feed the renderer a deterministic styled transcript fixture with two narrative sections, two preserved blank lines, and three consecutive activities.

The Playwright spec must:

- emit PTY data, record xterm rows/columns, show the Agent output overlay, invoke the same active-tab `sendInput("\x03")` path used by the main keyboard handler, and assert the stub received `{ type: "input", data: "\x03" }`;
- emit additional PTY data while the overlay is visible, click `Raw terminal`, assert that output is present in xterm, and assert rows/columns did not change;
- click two different activity buttons and assert the first closes;
- compare computed `font-family`, `font-size`, and `line-height` with the real xterm configuration;
- assert zero activity/detail borders, no horizontal overflow, and no overlap between the real `Raw terminal` control and rendered session `Menu` control.

- [x] **Step 4: Run desktop and mobile Playwright verification with screenshots**

Run: `npx playwright test tests/e2e/terminal-transcript.spec.ts`

Expected: desktop and `390x844` projects pass. Save screenshots with the existing `testInfo.outputPath("screenshots/.../*.png")` plus `testInfo.attach()` pattern, showing collapsed, first-expanded, and second-expanded states. Inspect each screenshot for preserved two-line whitespace, original activity colors, compact wrapping, no separators, and no `Raw terminal`/`Menu` overlap.

- [x] **Step 5: Run independent code review**

Review the final diff against `docs/superpowers/specs/2026-07-14-terminal-structured-output-design.md`, with special attention to Ctrl+C/raw xterm isolation, transcript false positives, DOM safety, stale expansion state, and responsive layout.

- [x] **Step 6: Commit the verified implementation**

Stage only the intended source, test, and plan/spec files. Use an OMC commit message with constraint and verification trailers. Do not publish until the user approves the final rendered result.
