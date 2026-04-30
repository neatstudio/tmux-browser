# HarmonyOS Mobile Tmux Manager Design

**Date:** 2026-04-30

**Status:** Design approved in conversation; user delegated remaining planning and first-version implementation without further product questions

## Goal

Build a HarmonyOS-first native mobile client for the existing `gemm4` tmux manager. The app should let the user manage tmux sessions and open one live native terminal viewer from a phone, while reusing the current `gemm4` HTTP and WebSocket APIs unchanged.

## Platform Priority

1. HarmonyOS first
2. Android second

The first version should be implemented with HarmonyOS ArkTS and ArkUI. Android reuse should remain possible through clean module boundaries, but it is not part of the first delivery.

## Product Scope

### In Scope

- Save and edit a manually entered backend Base URL.
- List tmux sessions from the existing `GET /api/sessions` endpoint.
- Create tmux sessions through the existing `POST /api/sessions` endpoint.
- Kill tmux sessions through the existing `DELETE /api/sessions/:name` endpoint.
- Open one session at a time in a native terminal screen.
- Connect to the existing `/ws/terminal` endpoint.
- Use the existing `attach`, `input`, `resize`, and `scroll` client messages.
- Render terminal output natively without WebView or xterm.js.
- Provide a configurable mobile shortcut bar for high-frequency terminal keys.
- Disconnecting the mobile viewer must not kill the underlying tmux session.

### Out of Scope For First Version

- Authentication or authorization.
- Backend protocol changes.
- WebView-hosted terminal rendering.
- Multiple simultaneous live terminal viewers.
- Complete TUI compatibility.
- Android implementation.
- A database or mobile-side session lifecycle authority.

## Security Boundary

The first version assumes use on a trusted network, VPN, or private tunnel. It does not add authentication. The backend must not be exposed directly to the public internet without an external protection layer.

The mobile app stores a Base URL and optionally reconnects to it. It does not manage credentials, tokens, or login state in v1.

## Existing Backend Contract

The mobile app must treat the current `gemm4` server as the source of truth and keep the protocol unchanged.

### HTTP

- `GET /api/sessions`
- `POST /api/sessions`
- `DELETE /api/sessions/:name`

### WebSocket

Endpoint:

- `/ws/terminal`

Client messages:

- `attach`: `{ type, tabId, sessionName, cols, rows }`
- `input`: `{ type, data }`
- `resize`: `{ type, cols, rows }`
- `scroll`: `{ type, lines }`

Server messages:

- `output`: `{ type, data }`
- `session-exit`: `{ type }`
- `error`: `{ type, message }`

## Recommended Architecture

Use a pure ArkTS and ArkUI client first. Implement the terminal engine as a replaceable ArkTS module. Do not introduce a Native/XComponent rendering path until profiling shows ArkTS is not good enough.

### Components

1. **ConnectionProfileStore**
   - Stores the backend Base URL.
   - Normalizes trailing slashes and validates basic URL shape.
   - Persists locally on the device.

2. **SessionApiClient**
   - Calls the existing session HTTP endpoints.
   - Maps backend responses into app session records.
   - Surfaces connection, timeout, and server errors clearly.

3. **TerminalSocketClient**
   - Connects to `/ws/terminal` under the configured Base URL.
   - Sends existing protocol messages without changing their shape.
   - Emits output, exit, error, and connection state events to the terminal screen.

4. **TerminalCore**
   - Pure ArkTS terminal parser and screen model.
   - Accepts output strings from the socket client.
   - Maintains a screen buffer, cursor state, style state, scrollback, and dirty row ranges.
   - Exposes a small interface so the parser can be replaced later if a mature ArkTS-compatible terminal engine appears.

5. **TerminalView**
   - ArkUI-native terminal rendering surface.
   - Renders the screen buffer without routing each character through broad app state.
   - Batches redraws to the display frame and only redraws dirty areas where practical.

6. **ShortcutBar**
   - Configurable row of terminal keys.
   - Converts key actions into terminal byte sequences and sends them through `input`.
   - Defaults include `Esc`, `Ctrl`, `Tab`, arrow keys, `Ctrl+C`, `Ctrl+D`, tmux prefix, `PageUp`, and `PageDown`.

7. **Session Screens**
   - Session list home screen.
   - Session create flow.
   - Session kill confirmation.
   - Full-screen terminal viewer.

## User Experience

### Session First Home

The app opens to a session management screen. The top area shows the active Base URL and connection state. The main area lists sessions with:

- name
- attached or detached status
- current command
- current path
- recent activity
- pane and window counts where available

Tapping a session opens its terminal. Secondary actions such as kill live in a menu or long-press action, with confirmation before destructive operations.

### Terminal Screen

Opening a session moves to a full-screen terminal view. The top bar stays minimal:

- back
- session name
- connection state
- disconnect action

The terminal occupies the main area. The bottom area contains the shortcut bar and cooperates with the soft keyboard.

### Single Live Viewer

The first version keeps only one live WebSocket and PTY viewer. Returning from a terminal closes the viewer connection. Opening another session creates a new viewer. This must only detach the mobile client; it must never kill the tmux session.

## TerminalCore Scope

The first version targets a usable shell, not complete terminal emulation.

### Required In V1

- printable text
- newline and carriage return
- backspace behavior
- cursor movement basics
- clear screen and clear line basics
- SGR colors and text attributes used by common shell prompts
- basic scrollback
- resize handling
- dirty row tracking for efficient rendering

### Designed For Later

- alternate screen
- fuller TUI support for `vim`, `less`, and `top`
- wide character and combining character correctness
- mouse and touch mapping
- tmux copy-mode refinements
- complete modified key encoding
- truecolor and richer style handling

## Data Flow

### Load Sessions

1. App reads the saved Base URL.
2. App calls `GET /api/sessions`.
3. App renders session records on the home screen.
4. User can manually refresh.

### Create Session

1. User enters a session name.
2. App calls `POST /api/sessions`.
3. App refreshes the list.
4. App may open the new session immediately.

### Open Terminal

1. Terminal screen measures available dimensions.
2. App computes `cols` and `rows` from font metrics.
3. App opens `/ws/terminal`.
4. App sends `attach` with generated `tabId`, session name, `cols`, and `rows`.
5. `output.data` goes to `TerminalCore.write(data)`.
6. `TerminalView` redraws dirty rows on the next frame.

### Input

1. Soft keyboard text and shortcut bar actions become terminal byte sequences.
2. App sends `input` messages with the byte data.
3. The backend writes those bytes to the PTY attached to tmux.

### Resize

1. Orientation, keyboard, or layout changes update available terminal size.
2. App recomputes `cols` and `rows`.
3. App sends `resize`.
4. TerminalCore adjusts its buffer model.

### Scroll

1. PageUp/PageDown or scroll gestures send the existing `scroll` message.
2. The backend delegates scrolling behavior to tmux copy-mode.

## Performance Model

- Do not put terminal output into broad page or app state.
- Batch socket output into TerminalCore writes.
- Track dirty rows rather than re-rendering the full buffer for every byte.
- Render on frame cadence.
- Keep only one active socket in v1.
- Keep the first implementation pure ArkTS; introduce Native/XComponent only after profiling demonstrates a real bottleneck.

## Error Handling

### Invalid Or Missing Base URL

Show a configuration state with a clear message and let the user edit the Base URL.

### Session List Failure

Keep the user on the home screen, show the error, and provide retry.

### Attach Failure

Show the terminal error, close the viewer connection, and return to the session list.

### Socket Close

If the socket closes unexpectedly, show a disconnected state. Closing the viewer must not call `DELETE /api/sessions/:name`.

### Session Exit

On `session-exit`, close the terminal viewer and refresh the session list.

### Kill Session

Require confirmation. After success, refresh the session list. If the killed session is the current viewer, close that viewer.

## Testing Strategy

### Unit Tests

- TerminalCore parsing for representative ANSI sequences.
- Screen buffer updates, cursor moves, clear screen, colors, scrollback, and resize.
- Shortcut action to byte sequence conversion.
- Base URL normalization and validation.

### Protocol Tests

- SessionApiClient calls correct endpoints.
- TerminalSocketClient sends the existing attach/input/resize/scroll messages.
- TerminalSocketClient handles output, error, session-exit, and close events.

### Manual Verification

- Connect to a running `gemm4` backend.
- List sessions and compare with the web manager.
- Create a session and confirm it appears in tmux.
- Open a terminal, run shell commands, and verify output and prompt behavior.
- Send `Ctrl+C`, `Ctrl+D`, `Esc`, `Tab`, arrows, tmux prefix, PageUp, and PageDown.
- Leave terminal screen and confirm tmux session remains alive.
- Kill a session and confirm it is removed from tmux.
- Test backend unreachable, wrong Base URL, and network disconnect.

## Acceptance Criteria

- The app can connect to a manually configured `gemm4` backend.
- The app can manage tmux sessions using the existing backend APIs.
- The app can open one native terminal viewer at a time.
- Basic shell interaction works from a phone.
- Shortcut keys needed for common terminal work are available.
- Disconnecting the app viewer does not kill tmux.
- The first version does not require backend protocol changes.
- The implementation keeps TerminalCore replaceable and does not couple network code to rendering internals.
