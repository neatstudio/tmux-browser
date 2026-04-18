# Browser Tmux Dashboard

Lightweight browser dashboard for listing tmux sessions, opening browser terminal tabs, creating sessions, and killing sessions from the UI.

## Prerequisites

- Node.js 20+
- npm 11+
- `tmux` installed and available on `PATH`
- `script` available on `PATH` for the terminal PTY bridge

## Scripts

- `npm run dev:server` starts the server entrypoint in watch mode
- `npm run dev:client` starts the Vite client dev server
- `npm run build` builds the server and client bundles
- `npm run start` runs the built server
- `npm run test` runs the test suite
- `npm run test:watch` runs tests in watch mode

## Install

```bash
npm install
```

## Run

For the simplest local run:

```bash
npm run build
npm run start
```

This serves the built dashboard at `http://127.0.0.1:3000`.

For split development:

```bash
npm run dev:server
npm run dev:client
```

## tmux Lifecycle Rules

- The dashboard session list comes from real `tmux list-sessions`
- Opening a browser tab attaches to a tmux session
- Closing a browser tab does not kill the tmux session
- Refreshing or closing the browser does not kill the tmux session
- Clicking `Kill` in the dashboard sends `tmux kill-session -t <name>`
- If a session is open in a browser tab when it is killed, that browser terminal view closes
