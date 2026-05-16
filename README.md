# tmux-ui

Lightweight browser UI for listing tmux sessions, opening browser terminal tabs,
creating sessions, configuring per-session terminal rendering, and killing
sessions from the UI.

## Prerequisites

- Node.js 20+
- npm 11+
- `tmux` installed and available on `PATH`

## Scripts

- `npm run dev:server` starts the server entrypoint in watch mode
- `npm run dev:client` starts the Vite client dev server
- `npm run build` builds the server and client bundles
- `npm run pack:run` builds a standalone `.run` installer under `release/`
- `npm run publish` uploads an existing `release/tmux.run` to explicit targets
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

This serves the built dashboard on all interfaces at `http://0.0.0.0:3000`,
so it can be reached through LAN or Tailscale using the machine's reachable IP
or MagicDNS name. To bind to localhost only, run `HOST=127.0.0.1 npm run start`.

For split development:

```bash
npm run dev:server
npm run dev:client
```

## Run File

Build a standalone run file:

```bash
npm run pack:run
```

This creates:

- `release/release.run`, stable filename for local publish/server upload
- `release/tmux-ui-<version>.run`, versioned artifact for GitHub Releases

The run file defaults to installing into `~/.tmux-ui`:

```bash
./release/release.run help
./release/release.run install
./release/release.run start
./release/release.run restart
./release/release.run uninstall
```

`restart` runs the server inside a dedicated tmux session named `tmux-ui`.
The default bind host is the first Tailscale IPv4 address matching `100.*`.
Set `HOST` or `PORT` explicitly to override:

```bash
HOST=0.0.0.0 PORT=3000 ./release/release.run start
```

Publish an existing run file to one or more servers:

```bash
npm run publish -- --target tw0:/root/tmux --install --restart
```

Without `--target`, `publish` reads `.tmux-ui.publish.json` when present. That
file is ignored by Git so private server names do not enter the public repo.

On GitHub, pushing to `main` creates tag `v<package.json version>` when it does
not already exist. That tag builds the same two run files and publishes them as
a GitHub Release.

## tmux Lifecycle Rules

- The dashboard session list comes from real `tmux list-sessions`
- Opening a browser tab attaches to a tmux session
- Closing a browser tab does not kill the tmux session
- Refreshing or closing the browser does not kill the tmux session
- Clicking `Kill` in the dashboard sends `tmux kill-session -t <name>`
- Clicking `Kill` in a session page asks for confirmation before killing
- If a session is open in a browser tab when it is killed, that browser terminal view closes
