# Compact Groups/Create Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile/PAD `Groups` popup smaller and right-aligned, hide `Server` by default in project creation, and compress recommended session cards.

**Architecture:** Keep the existing rendering paths. Only adjust the mobile sheet shell, the kanban create panel rendering, and the related CSS/test coverage. Preserve the current group-switch and project-create semantics.

**Tech Stack:** TypeScript, DOM rendering, CSS media queries, Vitest.

---

### Task 1: Lock the desired UI behavior in tests

**Files:**
- Modify: `tests/client/render/sessionStatusBar.test.ts`
- Modify: `tests/client/render/kanbanCreatePanel.test.ts`
- Modify: `tests/client/styles.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that:
- the mobile `Groups` sheet is a compact right-aligned overlay,
- `Server` is hidden in kanban project creation,
- recommended session cards render in a compact mode on non-desktop tiers.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/client/render/sessionStatusBar.test.ts tests/client/render/kanbanCreatePanel.test.ts tests/client/styles.test.ts -v`
Expected: fail on the new assertions.

- [ ] **Step 3: Write minimal implementation**

Only after the tests fail, adjust the renderers and CSS to satisfy them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/client/render/sessionStatusBar.test.ts tests/client/render/kanbanCreatePanel.test.ts tests/client/styles.test.ts -v`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add tests/client/render/sessionStatusBar.test.ts tests/client/render/kanbanCreatePanel.test.ts tests/client/styles.test.ts
git commit -m "test: lock compact groups and create panel layout"
```

### Task 2: Implement the compact UI

**Files:**
- Modify: `src/client/render/sessionStatusBar.ts`
- Modify: `src/client/render/kanbanCreatePanel.ts`
- Modify: `src/client/styles.css`

- [ ] **Step 1: Write the failing test**

Use the tests from Task 1.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/client/render/sessionStatusBar.test.ts tests/client/render/kanbanCreatePanel.test.ts tests/client/styles.test.ts -v`

- [ ] **Step 3: Write minimal implementation**

Anchor the mobile sheet to the lower-right with a narrower width, hide `Server` by default, and shrink the checkbox cards on compact tiers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/client/render/sessionStatusBar.test.ts tests/client/render/kanbanCreatePanel.test.ts tests/client/styles.test.ts -v`

- [ ] **Step 5: Commit**

```bash
git add src/client/render/sessionStatusBar.ts src/client/render/kanbanCreatePanel.ts src/client/styles.css
git commit -m "feat: compact groups popup and create panel"
```

### Task 3: Full verification

**Files:**
- None

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Run: `npm run build`

- [ ] **Step 2: Review results**

Expected: all tests pass and the build succeeds.

- [ ] **Step 3: Commit or hand off**

If anything regresses, fix before handing off.
