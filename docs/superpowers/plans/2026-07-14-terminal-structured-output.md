# Terminal Structured Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在每个终端 tab 中默认显示该 session 的结构化 Agent 输出摘要，并允许切回持续接收的原始 PTY。

**Architecture:** 复用 timeline 的 canonical `conversation-message` 和已有 websocket/store 合并。客户端将 assistant/tool message 派生为 Agent 输出视图，与原始 xterm 互斥可见，xterm 始终继续接收数据且尺寸不变；producer 通过 helper 主动发送完整快照，原始 terminal websocket 不新增解析规则。

**Tech Stack:** TypeScript, Vitest, JSDOM, native DOM, xterm.js, Express.

---

## Phase 1: Terminal Agent Output View

### Task 1: Session-scoped output derivation

**Files:**
- Create: `src/client/terminal/structuredOutput.ts`
- Create: `tests/client/terminal/structuredOutput.test.ts`

- [ ] Write failing tests for assistant/tool filtering, session isolation, newest-first ordering, duplicate revision replacement, and full-detail retention.
- [ ] Run `npm test -- tests/client/terminal/structuredOutput.test.ts` and verify RED.
- [ ] Implement the pure derivation function using `adaptStructuredRecord`.
- [ ] Re-run the focused test and verify GREEN.

### Task 2: Default-collapsed renderer

**Files:**
- Create: `src/client/render/terminalStructuredOutput.ts`
- Create: `tests/client/render/terminalStructuredOutput.test.ts`
- Modify: `src/client/styles.css`

- [ ] Write failing DOM tests for compact summary, error reason, expand/collapse, detail rendering,默认 Agent 输出视图、原始终端切换和空状态移除。
- [ ] Run the focused renderer test and verify RED.
- [ ] Implement the renderer and constrained, responsive styles.
- [ ] Re-run the focused test and verify GREEN.

### Task 3: Terminal-tab integration

**Files:**
- Modify: `src/client/main.ts`
- Modify: `tests/client/terminal/terminalBundle.test.ts` as needed
- Create: `tests/client/terminal/terminalStructuredOutput.integration.test.ts`

- [ ] Write a failing integration test proving session isolation, revision 更新后的展开状态, 默认视图, 原始终端切换, 手动 raw 视图不会被实时更新打断, and raw terminal output 不变。
- [ ] Implement terminal panel mounting, realtime store-driven re-rendering, and view state. Preserve xterm frame dimensions during a view switch.
- [ ] Run focused tests, `npm run build`, and the terminal test suite.

## Phase 2: Agent Output Producer Helper And Authentication

### Task 4: Conversation helper mode

**Files:**
- Modify: `scripts/tmux-ui-agent-hook.mjs`
- Modify: `tests/scripts/install-agent-hooks.test.ts`
- Modify: `src/server/createApp.ts`
- Modify: `tests/server/createApp.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] Write failing tests for the `agent-output` stdin payload, independent `TMUX_UI_CONVERSATION_URL`, hook URL not receiving conversation payload, inferred-session matching/mismatch, token-authenticated endpoint request, endpoint rejection without a configured token, and local no-token compatibility.
- [ ] Run the focused script test and verify RED.
- [ ] Implement the helper and conditional conversation endpoint authorization without extracting terminal text.
- [ ] Re-run focused tests and verify GREEN.

## Phase 3: Regression Verification

### Task 5: Raw terminal boundary and interaction coverage

**Files:**
- Modify: `tests/client/terminal/createTerminalTab.test.ts`
- Modify: `tests/e2e/structured-event-panel.spec.ts` or add a terminal-specific browser spec

- [ ] Verify raw `output` messages still reach `terminal.write`, whether or not a structured stream exists.
- [ ] Verify Ctrl+C, scroll, copy, reconnect and session switching while Agent 输出或原始终端视图可见。
- [ ] Verify an Agent-output/raw-terminal switch preserves frame geometry and does not cause a terminal resize.
- [ ] Run `npm test`, `npm run build`, focused browser test, and `git diff --check`.
