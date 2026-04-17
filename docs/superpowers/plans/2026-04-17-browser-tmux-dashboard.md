# Browser Tmux Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight browser dashboard that lists real tmux sessions, opens terminal tabs attached to those sessions, creates new tmux sessions, and kills sessions from the dashboard without letting browser disconnects affect tmux lifecycle.

**Architecture:** Use a small Node.js + TypeScript app with an Express HTTP server, a single websocket endpoint for active terminal tabs, and `tmux` as the only persistent source of truth. Keep dashboard state light by polling `tmux list-sessions` over HTTP for session truth while using browser `sessionStorage` only for UI restore hints and using `node-pty` only for active terminal attachments.

**Tech Stack:** Node.js 20, TypeScript, Express, `ws`, `node-pty`, `xterm.js`, `@xterm/addon-fit`, Vite, Vitest, Supertest, jsdom

---

## Inputs

- Spec: `docs/superpowers/specs/2026-04-17-browser-tmux-dashboard-design.md`
- Local prerequisites already present in this environment:
  - `node v20.19.3`
  - `npm 11.7.0`
  - `tmux 3.5a`

## File Structure

- Create: `package.json`
  - Runtime dependencies, scripts, and project metadata
- Create: `.gitignore`
  - Ignore `node_modules`, build output, local env files, and `.superpowers/`
- Create: `tsconfig.base.json`
  - Shared TypeScript compiler settings
- Create: `tsconfig.server.json`
  - Server build target and output folder
- Create: `tsconfig.client.json`
  - Client type-check configuration
- Create: `vite.config.ts`
  - Client bundling into `dist/client`
- Create: `index.html`
  - Vite HTML entry that loads the dashboard shell
- Create: `src/server/index.ts`
  - Temporary bootstrap entry in Task 1, then real production server entrypoint in Task 2
- Create: `src/client/main.ts`
  - Temporary client bootstrap in Task 1, then real dashboard bootstrap in Task 5
- Create: `src/client/styles.css`
  - Temporary styles in Task 1, then real dashboard styles in Task 5
- Create: `src/server/createApp.ts`
  - Express app composition and dependency injection
- Create: `src/server/config.ts`
  - Port, poll interval, and environment defaults
- Create: `src/server/services/tmux/runTmuxCommand.ts`
  - Safe `spawn` wrapper for tmux CLI commands
- Create: `src/server/services/tmux/parseTmuxListOutput.ts`
  - Parse `tmux list-sessions` output into dashboard records
- Create: `src/server/services/tmux/createTmuxService.ts`
  - `listSessions`, `createSession`, `killSession`, name validation
- Create: `src/server/services/terminal/bridgeRegistry.ts`
  - In-memory tracking of active tab attachments
- Create: `src/server/services/terminal/createTerminalBridge.ts`
  - `node-pty` bridge for `tmux attach-session`
- Create: `src/server/routes/sessionRoutes.ts`
  - HTTP endpoints for list/create/kill session operations
- Create: `src/server/ws/createTerminalSocketServer.ts`
  - Websocket endpoint for active terminal tabs only
- Create: `src/shared/protocol.ts`
  - Typed message shapes shared by client and server
- Create: `src/client/api/sessionApi.ts`
  - Fetch wrapper for session list/create/kill
- Create: `src/client/state/dashboardStore.ts`
  - Session polling state and action orchestration
- Create: `src/client/state/tabState.ts`
  - Browser tab state and `sessionStorage` restore hints
- Create: `src/client/terminal/createTerminalTab.ts`
  - `xterm.js` mount, websocket attach, resize, and close handling
- Create: `src/client/render/renderDashboard.ts`
  - Session list rendering and action binding
- Create: `src/client/render/renderTabs.ts`
  - Terminal tab strip and panel rendering
- Create: `tests/server/services/tmux/parseTmuxListOutput.test.ts`
  - Unit tests for tmux list parsing
- Create: `tests/server/services/tmux/createTmuxService.test.ts`
  - Unit tests for tmux command generation and validation
- Create: `tests/server/routes/sessionRoutes.test.ts`
  - HTTP integration tests with a fake tmux service
- Create: `tests/server/services/terminal/bridgeRegistry.test.ts`
  - Unit tests for attachment bookkeeping
- Create: `tests/server/ws/createTerminalSocketServer.test.ts`
  - Socket tests with fake pty processes
- Create: `tests/client/state/dashboardStore.test.ts`
  - Client polling and optimistic action tests
- Create: `tests/client/state/tabState.test.ts`
  - `sessionStorage` restore behavior tests
- Create: `tests/client/terminal/createTerminalTab.test.ts`
  - Terminal tab protocol handling tests
- Create: `README.md`
  - Project setup, scripts, and manual verification notes

## Implementation Notes

- Keep `tmux` as the only persistent session authority. Do not add a database or server-side file registry in v1.
- Use fixed-argument process execution like `spawn('tmux', ['list-sessions'])`. Do not shell-interpolate session names.
- Keep websocket usage limited to active terminal tabs. Dashboard list refresh should use HTTP polling every 3 seconds by default.
- Treat browser `sessionStorage` as a UI restore helper only. If a saved tab points to a dead tmux session, drop it from UI state on reload.
- Use dependency injection for the tmux runner and pty factory so tests can run without a real tmux server.

### Task 1: Bootstrap The Repo And Tooling

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tsconfig.base.json`
- Create: `tsconfig.server.json`
- Create: `tsconfig.client.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `README.md`
- Create: `src/server/index.ts`
- Create: `src/client/main.ts`
- Create: `src/client/styles.css`

- [ ] **Step 1: Create package metadata and scripts**

Configuration is the one acceptable TDD exception in this plan. Create `package.json` with these sections:

```json
{
  "name": "browser-tmux-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "build": "tsc -p tsconfig.server.json && vite build",
    "start": "node dist/server/index.js",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install express ws node-pty xterm @xterm/addon-fit
npm install -D typescript tsx vite vitest @vitest/coverage-v8 @types/node @types/express @types/ws supertest @types/supertest jsdom
```

Expected: install completes with no `npm ERR!` lines.

- [ ] **Step 3: Add TypeScript, Vite, and ignore files**

Create config files with:
- `dist/server` as server output
- `dist/client` as Vite output
- path alias-free imports to keep the repo simple
- `.gitignore` entries for `node_modules/`, `dist/`, `.env`, and `.superpowers/`

- [ ] **Step 4: Add a short README stub**

Add:
- project purpose
- prerequisite note that `tmux` must be installed
- the exact scripts from `package.json`

- [ ] **Step 5: Add minimal placeholder source files**

Create the smallest possible files that let the toolchain run:

```ts
// src/server/index.ts
console.log('server bootstrap placeholder');
```

```ts
// src/client/main.ts
import './styles.css';

document.querySelector('#app')!.textContent = 'Browser tmux dashboard bootstrap';
```

```css
/* src/client/styles.css */
body { font-family: sans-serif; }
```

- [ ] **Step 6: Verify the scaffolding works**

Run:

```bash
npm run test
npm run build
```

Expected:
- `npm run test` reports no test files found or zero tests without crashing
- `npm run build` completes and creates `dist/server` and `dist/client`

- [ ] **Step 7: Commit the bootstrap**

Run:

```bash
git add package.json package-lock.json .gitignore tsconfig.base.json tsconfig.server.json tsconfig.client.json vite.config.ts index.html README.md src/server/index.ts src/client/main.ts src/client/styles.css
git commit -m "chore: bootstrap browser tmux dashboard"
```

### Task 2: Build tmux Session Discovery And HTTP API

**Files:**
- Create: `src/server/config.ts`
- Create: `src/server/createApp.ts`
- Modify: `src/server/index.ts`
- Create: `src/server/services/tmux/runTmuxCommand.ts`
- Create: `src/server/services/tmux/parseTmuxListOutput.ts`
- Create: `src/server/services/tmux/createTmuxService.ts`
- Create: `src/server/routes/sessionRoutes.ts`
- Create: `tests/server/services/tmux/parseTmuxListOutput.test.ts`
- Create: `tests/server/services/tmux/createTmuxService.test.ts`
- Create: `tests/server/routes/sessionRoutes.test.ts`

- [ ] **Step 1: Write the failing parser test**

```ts
import { describe, expect, it } from 'vitest';
import { parseTmuxListOutput } from '../../../../src/server/services/tmux/parseTmuxListOutput';

describe('parseTmuxListOutput', () => {
  it('parses tmux list output into dashboard rows', () => {
    const output = [
      'build: 2 windows (created Sat Apr 17 10:00:00 2026)',
      'ops: 1 windows (created Sat Apr 17 11:00:00 2026)',
    ].join('\n');

    expect(parseTmuxListOutput(output)).toEqual([
      { name: 'build', windows: 2 },
      { name: 'ops', windows: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run the parser test to verify RED**

Run:

```bash
npm run test -- tests/server/services/tmux/parseTmuxListOutput.test.ts
```

Expected: FAIL with a module-not-found or export-not-found error for `parseTmuxListOutput`.

- [ ] **Step 3: Implement the parser minimally**

```ts
export function parseTmuxListOutput(output: string) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?):\s+(\d+)\s+windows?/);
      if (!match) throw new Error(`Unsupported tmux output: ${line}`);
      return { name: match[1], windows: Number(match[2]) };
    });
}
```

- [ ] **Step 4: Run the parser test to verify GREEN**

Run:

```bash
npm run test -- tests/server/services/tmux/parseTmuxListOutput.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing tmux service test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTmuxService } from '../../../../src/server/services/tmux/createTmuxService';

describe('createTmuxService', () => {
  it('creates a detached session with validated args', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const service = createTmuxService({ run });

    await service.createSession('build');

    expect(run).toHaveBeenCalledWith('new-session', ['-d', '-s', 'build']);
  });
});
```

- [ ] **Step 6: Run the tmux service test to verify RED**

Run:

```bash
npm run test -- tests/server/services/tmux/createTmuxService.test.ts
```

Expected: FAIL because `createTmuxService` does not exist yet.

- [ ] **Step 7: Implement the tmux runner and service**

Include:
- `runTmuxCommand(command, args)` using `spawn('tmux', [command, ...args])`
- `listSessions()`
- `createSession(name)`
- `killSession(name)`
- session name validation such as `/^[A-Za-z0-9._-]+$/`

Minimal implementation shape:

```ts
export function createTmuxService(deps: { run: RunTmuxCommand }) {
  return {
    async listSessions() {
      const result = await deps.run('list-sessions', []);
      return parseTmuxListOutput(result.stdout);
    },
    async createSession(name: string) {
      validateSessionName(name);
      await deps.run('new-session', ['-d', '-s', name]);
    },
    async killSession(name: string) {
      validateSessionName(name);
      await deps.run('kill-session', ['-t', name]);
    },
  };
}
```

- [ ] **Step 8: Run the tmux service test to verify GREEN**

Run:

```bash
npm run test -- tests/server/services/tmux/createTmuxService.test.ts
```

Expected: PASS.

- [ ] **Step 9: Write the failing HTTP route integration test**

```ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createSessionRoutes } from '../../../src/server/routes/sessionRoutes';

describe('sessionRoutes', () => {
  it('returns session rows from the tmux service', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionRoutes({
      listSessions: vi.fn().mockResolvedValue([{ name: 'build', windows: 2 }]),
      createSession: vi.fn(),
      killSession: vi.fn(),
    }));

    const response = await request(app).get('/api/sessions');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ name: 'build', windows: 2 }]);
  });
});
```

- [ ] **Step 10: Run the route test to verify RED**

Run:

```bash
npm run test -- tests/server/routes/sessionRoutes.test.ts
```

Expected: FAIL because the route module does not exist yet.

- [ ] **Step 11: Implement Express app composition and routes**

Add:
- `GET /api/sessions`
- `POST /api/sessions` with `{ name: string }`
- `DELETE /api/sessions/:name`
- a health check at `GET /api/health`

Minimal route shape:

```ts
router.get('/', async (_req, res, next) => {
  try {
    res.json(await deps.listSessions());
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 12: Run all server session tests**

Run:

```bash
npm run test -- tests/server/services/tmux/parseTmuxListOutput.test.ts tests/server/services/tmux/createTmuxService.test.ts tests/server/routes/sessionRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 13: Commit the tmux session API**

Run:

```bash
git add src/server/config.ts src/server/createApp.ts src/server/index.ts src/server/services/tmux/runTmuxCommand.ts src/server/services/tmux/parseTmuxListOutput.ts src/server/services/tmux/createTmuxService.ts src/server/routes/sessionRoutes.ts tests/server/services/tmux/parseTmuxListOutput.test.ts tests/server/services/tmux/createTmuxService.test.ts tests/server/routes/sessionRoutes.test.ts
git commit -m "feat: add tmux session discovery api"
```

### Task 3: Build The Active Terminal Bridge

**Files:**
- Create: `src/shared/protocol.ts`
- Create: `src/server/services/terminal/bridgeRegistry.ts`
- Create: `src/server/services/terminal/createTerminalBridge.ts`
- Create: `src/server/ws/createTerminalSocketServer.ts`
- Create: `tests/server/services/terminal/bridgeRegistry.test.ts`
- Create: `tests/server/ws/createTerminalSocketServer.test.ts`

- [ ] **Step 1: Write the failing registry test**

```ts
import { describe, expect, it } from 'vitest';
import { createBridgeRegistry } from '../../../../src/server/services/terminal/bridgeRegistry';

describe('createBridgeRegistry', () => {
  it('tracks attachments by tab id and session name', () => {
    const registry = createBridgeRegistry();

    registry.attach({ tabId: 'tab-1', sessionName: 'build' });

    expect(registry.countForSession('build')).toBe(1);
  });
});
```

- [ ] **Step 2: Run the registry test to verify RED**

Run:

```bash
npm run test -- tests/server/services/terminal/bridgeRegistry.test.ts
```

Expected: FAIL because `createBridgeRegistry` does not exist yet.

- [ ] **Step 3: Implement the in-memory registry**

Minimal shape:

```ts
export function createBridgeRegistry() {
  const byTab = new Map<string, { sessionName: string }>();
  return {
    attach(record: { tabId: string; sessionName: string }) {
      byTab.set(record.tabId, { sessionName: record.sessionName });
    },
    detach(tabId: string) {
      byTab.delete(tabId);
    },
    countForSession(sessionName: string) {
      return [...byTab.values()].filter((item) => item.sessionName === sessionName).length;
    },
  };
}
```

- [ ] **Step 4: Run the registry test to verify GREEN**

Run:

```bash
npm run test -- tests/server/services/terminal/bridgeRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing terminal socket test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTerminalSocketServer } from '../../../src/server/ws/createTerminalSocketServer';

describe('createTerminalSocketServer', () => {
  it('kills only the attach client when the socket closes', async () => {
    const pty = { onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    const createBridge = vi.fn().mockReturnValue(pty);

    const server = createTerminalSocketServer({ createBridge });

    const socket = server.testOnly.open({ tabId: 'tab-1', sessionName: 'build' });
    socket.close();

    expect(pty.kill).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the terminal socket test to verify RED**

Run:

```bash
npm run test -- tests/server/ws/createTerminalSocketServer.test.ts
```

Expected: FAIL because the websocket server module does not exist yet.

- [ ] **Step 7: Implement the shared protocol and terminal bridge**

Support these message types:
- client to server:
  - `{ type: 'attach', tabId, sessionName, cols, rows }`
  - `{ type: 'input', data }`
  - `{ type: 'resize', cols, rows }`
- server to client:
  - `{ type: 'output', data }`
  - `{ type: 'session-exit' }`
  - `{ type: 'error', message }`

For each attached tab, spawn a pty client with:

```ts
pty.spawn('tmux', ['attach-session', '-t', sessionName], {
  cols,
  rows,
  name: 'xterm-256color',
  cwd: process.cwd(),
  env: process.env,
});
```

- [ ] **Step 8: Implement socket cleanup semantics**

On websocket close:
- remove the tab from `bridgeRegistry`
- call `pty.kill()`
- do not run `tmux kill-session`

- [ ] **Step 9: Run the terminal bridge tests**

Run:

```bash
npm run test -- tests/server/services/terminal/bridgeRegistry.test.ts tests/server/ws/createTerminalSocketServer.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit the terminal bridge**

Run:

```bash
git add src/shared/protocol.ts src/server/services/terminal/bridgeRegistry.ts src/server/services/terminal/createTerminalBridge.ts src/server/ws/createTerminalSocketServer.ts tests/server/services/terminal/bridgeRegistry.test.ts tests/server/ws/createTerminalSocketServer.test.ts
git commit -m "feat: add tmux terminal websocket bridge"
```

### Task 4: Build Dashboard Polling And UI Tab State

**Files:**
- Create: `src/client/api/sessionApi.ts`
- Create: `src/client/state/dashboardStore.ts`
- Create: `src/client/state/tabState.ts`
- Create: `src/client/render/renderDashboard.ts`
- Create: `src/client/render/renderTabs.ts`
- Create: `tests/client/state/dashboardStore.test.ts`
- Create: `tests/client/state/tabState.test.ts`

- [ ] **Step 1: Write the failing tab state test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createTabState } from '../../../src/client/state/tabState';

describe('createTabState', () => {
  beforeEach(() => sessionStorage.clear());

  it('restores open browser tabs from sessionStorage without claiming tmux ownership', () => {
    sessionStorage.setItem('browser-tmux-dashboard.tabs', JSON.stringify([
      { id: 'tab-1', sessionName: 'build', title: 'build' },
    ]));

    const state = createTabState();

    expect(state.getTabs()).toEqual([
      { id: 'tab-1', sessionName: 'build', title: 'build' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tab state test to verify RED**

Run:

```bash
npm run test -- tests/client/state/tabState.test.ts
```

Expected: FAIL because `createTabState` does not exist yet.

- [ ] **Step 3: Implement tab persistence**

Create `createTabState()` with:
- `getTabs()`
- `openTab(sessionName)`
- `closeTab(tabId)`
- `setActiveTab(tabId | null)`
- persistence key `browser-tmux-dashboard.tabs`

Minimal persistence write:

```ts
sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
```

- [ ] **Step 4: Run the tab state test to verify GREEN**

Run:

```bash
npm run test -- tests/client/state/tabState.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing dashboard store test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDashboardStore } from '../../../src/client/state/dashboardStore';

describe('createDashboardStore', () => {
  it('loads sessions from the api and exposes them to the renderer', async () => {
    const api = { listSessions: vi.fn().mockResolvedValue([{ name: 'build', windows: 2 }]) };
    const store = createDashboardStore({ api, pollMs: 3000 });

    await store.refresh();

    expect(store.getState().sessions).toEqual([{ name: 'build', windows: 2 }]);
  });
});
```

- [ ] **Step 6: Run the dashboard store test to verify RED**

Run:

```bash
npm run test -- tests/client/state/dashboardStore.test.ts
```

Expected: FAIL because `createDashboardStore` does not exist yet.

- [ ] **Step 7: Implement dashboard polling and session actions**

`createDashboardStore()` should:
- call `sessionApi.listSessions()`
- expose `refresh()`
- expose `createSession(name)`
- expose `killSession(name)`
- poll every 3000 ms
- drop restored UI tabs whose `sessionName` no longer exists after refresh

Minimal state shape:

```ts
type DashboardState = {
  sessions: Array<{ name: string; windows: number }>;
  loading: boolean;
  error: string | null;
};
```

- [ ] **Step 8: Render the dashboard and tab strip**

Implement simple DOM rendering with:
- a session list table
- an input + button to create sessions
- an open button per session
- a close button per session
- a top tab strip for open browser terminal tabs

- [ ] **Step 9: Run the client state tests**

Run:

```bash
npm run test -- tests/client/state/tabState.test.ts tests/client/state/dashboardStore.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit the dashboard state layer**

Run:

```bash
git add src/client/api/sessionApi.ts src/client/state/dashboardStore.ts src/client/state/tabState.ts src/client/render/renderDashboard.ts src/client/render/renderTabs.ts tests/client/state/dashboardStore.test.ts tests/client/state/tabState.test.ts
git commit -m "feat: add dashboard session list and tab state"
```

### Task 5: Wire xterm.js Terminal Tabs And End-To-End Behavior

**Files:**
- Create: `src/client/terminal/createTerminalTab.ts`
- Modify: `src/client/main.ts`
- Modify: `src/client/styles.css`
- Modify: `src/server/createApp.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/ws/createTerminalSocketServer.ts`
- Create: `tests/client/terminal/createTerminalTab.test.ts`

- [ ] **Step 1: Write the failing terminal tab protocol test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTerminalTabController } from '../../../src/client/terminal/createTerminalTab';

describe('createTerminalTabController', () => {
  it('closes the browser tab when the server reports session exit', () => {
    const socket = { send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
    const onClosed = vi.fn();

    const controller = createTerminalTabController({ socket, onClosed });
    controller.handleMessage({ type: 'session-exit' });

    expect(onClosed).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the terminal tab test to verify RED**

Run:

```bash
npm run test -- tests/client/terminal/createTerminalTab.test.ts
```

Expected: FAIL because the terminal tab module does not exist yet.

- [ ] **Step 3: Implement terminal tab controller logic**

Implement:
- websocket connect to `/ws/terminal`
- initial `attach` message with `tabId`, `sessionName`, `cols`, `rows`
- `xterm.write()` on `output`
- close callback on `session-exit`
- `fitAddon.fit()` on mount and resize

Minimal message handler:

```ts
function handleMessage(message: ServerMessage) {
  if (message.type === 'output') terminal.write(message.data);
  if (message.type === 'session-exit') onClosed();
}
```

- [ ] **Step 4: Mount the full client app**

`src/client/main.ts` should:
- bootstrap `dashboardStore` and `tabState`
- render the session list
- create terminal panels for active tabs
- restore saved tabs on load only if their sessions still exist after the first refresh

- [ ] **Step 5: Serve the built client from Express**

Add static hosting for `dist/client` and ensure the websocket server shares the same HTTP server instance.

- [ ] **Step 6: Run the focused terminal tests**

Run:

```bash
npm run test -- tests/client/terminal/createTerminalTab.test.ts tests/client/state/tabState.test.ts tests/client/state/dashboardStore.test.ts tests/server/ws/createTerminalSocketServer.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the full test suite and build**

Run:

```bash
npm run test
npm run build
```

Expected:
- all tests PASS
- `dist/server/index.js` exists
- `dist/client/index.html` exists

- [ ] **Step 8: Manually verify tmux lifecycle semantics**

Run:

```bash
npm run dev:server
```

Then verify:
1. Open the dashboard in a browser.
2. Create a session named `demo`.
3. Open a terminal tab for `demo`.
4. Start a long-running command like `sleep 300`.
5. Close the browser tab for that terminal.
6. Run `tmux list-sessions` in another shell and confirm `demo` still exists.
7. Reopen the dashboard and open `demo` again.
8. Kill `demo` from the dashboard and verify the open terminal tab closes.

- [ ] **Step 9: Commit the terminal UI**

Run:

```bash
git add src/client/terminal/createTerminalTab.ts src/client/main.ts src/client/styles.css src/server/createApp.ts src/server/index.ts src/server/ws/createTerminalSocketServer.ts tests/client/terminal/createTerminalTab.test.ts
git commit -m "feat: add browser terminal tabs for tmux sessions"
```

### Task 6: Final Cleanup And Usage Docs

**Files:**
- Modify: `README.md`
- Modify: `src/client/styles.css`
- Modify: `src/client/render/renderDashboard.ts`

- [ ] **Step 1: Update README with exact usage**

Document:
- how to install deps
- how to run the app in dev
- the fact that browser close does not kill tmux
- the fact that dashboard "close session" does kill tmux

- [ ] **Step 2: Do one UI polish pass without changing architecture**

Limit this pass to:
- readable spacing
- clear button labeling for `Open` and `Kill`
- visible error state when tmux is unavailable

- [ ] **Step 3: Re-run verification**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit docs and polish**

Run:

```bash
git add README.md src/client/styles.css src/client/render/renderDashboard.ts
git commit -m "docs: document browser tmux dashboard usage"
```

## Risks To Watch During Execution

- `node-pty` can behave differently across platforms, so keep it isolated behind `createTerminalBridge.ts`.
- `tmux list-sessions` output can vary slightly by version; keep parser assumptions minimal and cover them in tests.
- If `tmux attach-session` exits immediately for a missing session, the websocket path must translate that into a clean client close instead of a hung terminal.
- Browser tab restore logic must never resurrect dead sessions into the UI after a refresh.

## Completion Checklist

- [ ] Dashboard lists the same sessions as `tmux list-sessions`
- [ ] Creating a session from the UI produces a real tmux session
- [ ] Opening a browser tab attaches to an existing session
- [ ] Closing a browser tab does not kill tmux
- [ ] Killing a session from the dashboard removes it from tmux and closes any open browser viewers
- [ ] `npm run test` passes
- [ ] `npm run build` passes
