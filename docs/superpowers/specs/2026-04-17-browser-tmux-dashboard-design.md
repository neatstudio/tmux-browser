# Browser Tmux Dashboard Design

**Date:** 2026-04-17

**Status:** Draft approved in conversation, written for implementation planning

## Goal

Build a browser-accessible dashboard that presents the system's tmux sessions as a management UI. The dashboard must support opening terminal tabs attached to existing tmux sessions, creating new tmux sessions from the UI, and killing sessions from the dashboard. Closing a browser tab, refreshing the page, or closing the browser must not affect the underlying tmux session.

## Non-Goals

- Replacing tmux as the system of record
- Adding a database-backed state model in v1
- Multi-user authorization or permission isolation in v1
- Persisting terminal stream history outside tmux

## Product Semantics

### Truth Source

The real source of truth for sessions is the local tmux server. The dashboard is a visualization and control layer over `tmux ls` plus lightweight runtime metadata.

### Session Lifecycle

- A tmux session may exist whether or not any browser is open.
- The dashboard lists sessions based on current tmux state.
- Opening a browser tab for a session attaches the UI to that session.
- Closing a browser tab only closes the browser-side viewer.
- Refreshing the page only reconnects the browser-side viewer.
- Closing the whole browser does not affect tmux sessions.
- Clicking "close session" in the dashboard sends `tmux kill-session -t <name>`.
- If a session is being viewed in one or more browser tabs when it is killed, those tabs must be notified and closed or redirected back to the dashboard.

### Dashboard Role

The dashboard is broader than tmux management, but tmux management is one module within it. For v1, the implemented slice is a tmux session list plus terminal tab management.

## Recommended Approach

Use a lightweight Node.js application with:

- `xterm.js` for terminal rendering in the browser
- `ws` for browser/server bidirectional transport
- `tmux` CLI as the real backend
- Minimal server runtime state only for active browser connections and tab attachments

This approach keeps the system lightweight while preserving room for future dashboard modules.

## Rejected Alternatives

### Browser Storage as Session Truth

Rejected because `sessionStorage` and `localStorage` cannot be the truth source for tmux lifecycle. They disappear with browser state and cannot represent sessions created or modified outside the browser.

### Full Database-Backed Registry

Rejected for v1 because it adds operational weight without solving the core requirement. Tmux itself already provides the durable session lifecycle.

### ttyd/wetty as the Primary Architecture

Rejected for v1 because they solve terminal streaming but add extra process-management complexity around session mapping, dashboard integration, and close semantics.

## Architecture

### Components

1. **Dashboard UI**
   - Lists tmux sessions
   - Shows per-session actions such as open, create, and kill
   - Manages browser tab layout for open terminal viewers

2. **Session Discovery Service**
   - Executes `tmux ls` or `tmux list-sessions` to fetch current sessions
   - Normalizes tmux output into API-friendly records
   - Periodically refreshes to detect out-of-band changes

3. **Session Control Service**
   - Creates sessions via `tmux new-session -d -s <name>`
   - Kills sessions via `tmux kill-session -t <name>`
   - Validates names and reports command failures clearly

4. **Terminal Bridge**
   - Creates a live bridge between one browser tab and one tmux session
   - Forwards browser input to tmux
   - Forwards tmux output back to the browser
   - Cleans up only the live connection when the browser disconnects

5. **Runtime Attachment Registry**
   - In-memory map of active browser tabs, websocket connections, and attached tmux session names
   - Not persisted
   - Rebuilt naturally as users reconnect

### State Boundaries

- **Persistent state:** tmux sessions
- **Ephemeral server state:** active websocket connections and attachment map
- **Ephemeral browser state:** open UI tabs, selected tab, layout preferences, and optional restore hints in browser storage

## Data Flow

### Dashboard Load

1. Browser loads dashboard UI.
2. UI requests current session list.
3. Server runs `tmux list-sessions`.
4. Server returns normalized session records plus lightweight runtime metadata such as attachment count.

### Open Existing Session

1. User clicks "open" on a listed session.
2. UI opens a terminal tab.
3. Browser establishes a websocket connection for that tab.
4. Server attaches the bridge to the target tmux session.
5. Terminal output streams into `xterm.js`.

### Create New Session and Open It

1. User clicks "new session".
2. Server validates the name and runs `tmux new-session -d -s <name>`.
3. The new session appears in the dashboard list.
4. UI opens a terminal tab attached to the new session.

### Close Browser Tab

1. User closes a terminal tab in the UI.
2. Browser closes the websocket.
3. Server removes the attachment from its in-memory registry.
4. Tmux session keeps running unchanged.

### Kill Session from Dashboard

1. User clicks "close session" from the dashboard list.
2. Server runs `tmux kill-session -t <name>`.
3. Server pushes a `session-killed` event to any active browser tabs attached to that session.
4. UI closes those terminal tabs or redirects them back to the dashboard.
5. On next list refresh, the session is absent.

### Out-of-Band tmux Changes

If sessions are created or killed outside the dashboard, the next discovery refresh updates the dashboard state. Websocket notifications may accelerate local UI updates, but refresh remains the safety net.

## Sync Strategy

Use two synchronization paths:

- **Polling for truth:** periodic `tmux list-sessions` refresh to detect real system state
- **Websocket events for immediacy:** fast UI updates for actions taken through the dashboard

This avoids overloading websocket state with authority it should not have.

## Performance Model

The design should remain lightweight by separating control traffic from terminal stream traffic.

### Control Plane

- One light API/websocket channel for session list updates and actions
- No per-session long-lived terminal bridge unless that session is actually open in a browser tab

### Data Plane

- Only active terminal tabs create terminal stream connections
- Avoid per-character JSON envelopes
- Batch writes on short flush intervals where needed
- Write directly into `xterm.js` rather than routing terminal output through expensive UI state updates

## Error Handling

### tmux Missing or Unavailable

- Dashboard should surface a clear "tmux unavailable" state
- Session list requests should return actionable errors instead of generic failures

### Session Name Conflicts

- Creating a session with an existing name should return a validation error

### Attach Target Missing

- If a browser tries to open a session that no longer exists, the terminal tab should fail gracefully and redirect back to the dashboard state

### Session Killed During Attach

- If a session disappears while open, the bridge should emit a termination event and the UI should close that terminal view cleanly

### Browser Disconnect

- Disconnect only cleans up the live attachment record
- No kill commands are issued on disconnect

## Security and Safety Notes

- Commands must use fixed argument execution rather than shell interpolation
- Session names must be validated to avoid invalid or unsafe tmux targets
- v1 assumes a trusted local environment; user auth can be added later as a separate dashboard concern

## v1 Scope

### In Scope

- List current tmux sessions
- Create a new tmux session
- Open a browser terminal tab attached to an existing session
- Close a browser tab without affecting tmux
- Kill a tmux session from the dashboard
- Reflect out-of-band tmux changes on refresh/poll

### Out of Scope

- Database persistence
- Multi-user collaboration
- Rich tmux metadata beyond basic fields
- Complex workspace save/restore
- Non-tmux dashboard modules

## Testing Strategy

### Unit Tests

- Parse and normalize tmux session list output
- Validate session creation and kill command argument generation
- Validate runtime registry behavior for attach/detach bookkeeping

### Integration Tests

- Create session, list session, attach, detach, and kill flow
- Verify tab close does not kill session
- Verify kill event closes attached terminal tabs

### Manual Verification

- Open terminal tab, start a long-running command, close browser, reopen dashboard, confirm session still exists
- Kill session from dashboard while tab is open and verify the tab exits cleanly

## Implementation Guidance

- Keep modules small and separable so future dashboard features can be added without coupling them to terminal streaming
- Do not persist duplicate session truth in browser or server storage
- Treat browser storage only as UI convenience, never as lifecycle authority
