# PTY Streaming Terminal Design

**Date:** 2026-04-21

**Status:** Draft approved in conversation, written for implementation planning

## Goal

Replace the current `capture-pane` snapshot bridge with a true streaming terminal bridge so browser tabs render tmux output with correct cursor behavior, lower CPU overhead, and better support for interactive full-screen programs.

## Why This Change

The current bridge polls `tmux capture-pane` and reconstructs a screen frame in the browser. That approach is fundamentally weaker on the exact dimensions the product cares about:

- It does repeated whole-screen work even when the user only types a few bytes
- It is prone to cursor drift because the browser frame is reconstructed from snapshots rather than terminal events
- It does not model scroll regions, alternate screen usage, or terminal redraw behavior as accurately as a real terminal stream
- It scales worse when multiple tabs are open because each tab keeps polling

The new design treats tmux like a real terminal peer and forwards a byte stream into `xterm.js`.

## Non-Goals

- Changing the dashboard session lifecycle rules
- Persisting browser tab state on the server
- Building multi-user authorization
- Adding historical terminal playback outside tmux

## Lifecycle Semantics

- `tmux` remains the only durable session truth
- Opening a browser terminal tab creates a temporary PTY-backed attachment to the tmux session
- Closing a terminal tab detaches that PTY-backed attachment only
- Refreshing or closing the browser detaches active viewers only
- Killing a session from the dashboard sends `tmux kill-session -t <name>` and closes all viewers attached to that session
- Sessions created or killed outside the dashboard continue to appear through regular tmux discovery

## Approaches Considered

### A. `PTY + tmux attach-session` streaming

Create a real pseudo-terminal on the server, run `tmux attach-session -t <name>` inside it, and stream PTY input/output over WebSocket.

**Pros**

- Best terminal fidelity
- Event-driven rather than polling
- Lowest steady-state CPU cost for idle tabs
- Correct handling for cursor motion, alternate screen, `vim`, `top`, `less`, and shell redraws

**Cons**

- Requires a server-side PTY dependency
- Needs careful cleanup on disconnect

### B. `tmux control mode`

Run tmux in control mode and translate tmux events into browser state plus terminal writes.

**Pros**

- Can expose richer tmux metadata
- Avoids attaching a visible client in the ordinary way

**Cons**

- Much more implementation complexity
- Requires custom interpretation of tmux control messages
- Higher product risk for no immediate user benefit

### C. `capture-pane` polling

Keep the current model and try to optimize frame normalization.

**Pros**

- Minimal code churn

**Cons**

- Still wrong at the architectural level for performance and terminal fidelity
- Polling remains the dominant cost
- Cursor and full-screen correctness remain fragile

## Recommendation

Use approach A: `PTY + tmux attach-session` streaming.

This is the best fit for the user's stated priority order: performance first, then correctness, then feature extensibility. It removes polling from active terminal rendering and limits server work to actual terminal traffic.

## Architecture

### Components

1. **Dashboard session layer**
   - Continues to list, create, and kill sessions using tmux CLI commands
   - Remains independent of terminal rendering internals

2. **Terminal socket layer**
   - Owns WebSocket connections per open browser terminal tab
   - Accepts `attach`, `input`, `resize`, and disconnect events

3. **PTY terminal bridge**
   - Creates one PTY per open browser tab
   - Runs `tmux attach-session -t <name>` inside that PTY
   - Streams PTY output directly to the browser
   - Writes browser input directly into the PTY
   - Applies terminal resize to the PTY so tmux gets correct dimensions

4. **Attachment registry**
   - Tracks which browser tab IDs are attached to which session names
   - Lets the dashboard close all affected viewers when a session is killed
   - Stays in memory only

## Data Flow

### Open Session

1. Browser opens a terminal tab.
2. Browser WebSocket sends `attach` with tab ID, session name, cols, and rows.
3. Server validates that the target tmux session exists.
4. Server creates a PTY and launches `tmux attach-session -t <name>`.
5. PTY output is forwarded to the browser as raw terminal data.

### User Input

1. `xterm.js` emits input bytes.
2. Browser forwards them over WebSocket.
3. Server writes them to the PTY stdin unchanged.
4. Tmux and the shell handle input normally.

### Resize

1. Browser measures terminal size changes.
2. Browser sends new cols and rows.
3. Server resizes the PTY.
4. Attached tmux client redraws through normal terminal behavior.

### Close Tab or Browser

1. Browser tab closes or WebSocket disconnects.
2. Server kills only the PTY process for that viewer.
3. Attachment registry entry is removed.
4. Underlying tmux session keeps running.

### Kill Session from Dashboard

1. Dashboard sends kill request for a session.
2. Server runs `tmux kill-session -t <name>`.
3. Server notifies and closes all attached viewers for that session.
4. Browser removes those tabs and returns focus to the dashboard or another open tab.

## Performance Model

### CPU

- Idle session tabs consume almost no work beyond an open socket and PTY wait state
- No screen polling loop
- No repeated frame diffing or screen reconstruction

### Memory

- One PTY exists only while a browser tab for that session is open
- Closing a tab releases the PTY
- No server-side persistence for terminal history

### Network

- Send terminal bytes, not whole-screen snapshots
- Network traffic scales with actual terminal activity
- Idle tabs stay quiet

## Error Handling

### Missing tmux Session at Attach Time

- Refuse the attach
- Return a clear terminal error and close that viewer

### PTY Launch Failure

- Return a terminal error to the browser
- Do not create a dangling registry record

### tmux Session Dies While Attached

- PTY exits
- Server emits close for that viewer
- Session disappears from the next dashboard refresh

### Browser Disconnect

- PTY is closed immediately
- No kill command is sent to tmux

## Testing Strategy

### Unit Tests

- Registry bookkeeping for attach and detach
- WebSocket controller behavior for close and error paths

### Integration Tests

- Attach to an existing session and verify stream forwarding
- Resize flow updates PTY dimensions
- Tab close detaches without killing the session
- Dashboard kill closes all active viewers for that session

### Manual Verification

- Open a shell prompt and confirm cursor placement matches native tmux behavior
- Run `vim`, `top`, and `less` and verify full-screen redraw correctness
- Start a long-running command, close the browser, reopen the dashboard, and confirm the session still exists

## Rollout Notes

- Remove the polling snapshot path rather than keeping two active terminal implementations
- Preserve the existing dashboard and tab lifecycle semantics
- Treat terminal bridge replacement as an internal refactor with no change to the tmux session truth model
