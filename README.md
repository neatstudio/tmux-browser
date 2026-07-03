# tmux-ui

[简体中文](README.zh-CN.md)

Lightweight browser UI for listing tmux sessions, opening browser terminal tabs,
creating sessions, configuring per-session terminal rendering, and killing
sessions from the UI.

## Requirements

- Source development needs Node.js/npm and `tmux` on `PATH`.
- Packaged `.run install` auto-installs nvm when Node is missing, installs Node
  22 through nvm, and installs `tmux` through Homebrew, apt, dnf, yum, apk, or
  pacman when one of those package managers is available.

## Scripts

- `npm run dev:server` starts the server entrypoint in watch mode
- `npm run dev:client` starts the Vite client dev server
- `npm run build` builds the server and client bundles
- `npm run pack:run` builds a standalone `.run` installer under `release/`
- `npm run publish` uploads an existing `release/release.run` to explicit targets
- `npm run start` runs the built server
- `npm run test` runs the test suite
- `npm run test:watch` runs tests in watch mode

## API Reference

Third-party tools can call tmux-ui over the trusted Tailscale/private network.
See [docs/api.md](docs/api.md) for the complete HTTP and WebSocket API list,
request bodies, and response data structures.

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

The development `npm run start` command still follows your environment. For
packaged `.run` installs, tmux-ui auto-binds to the first `100.*` Tailscale IP
when available, then falls back to `127.0.0.1`. Set `HOST=100.x.y.z` explicitly
when you want a specific private interface. `HOST=0.0.0.0` is rejected because it
is too easy to expose terminal control beyond the intended internal network.

For split development:

```bash
npm run dev:server
npm run dev:client
```

## Run File

Build a standalone run file:

```bash
npm version patch --no-git-tag-version
npm run pack:run
```

This creates:

- `release/release.run`, stable filename for local publish/server upload
- `release/tmux-ui-<version>.run`, versioned artifact for GitHub Releases

Preview the release notes before publishing:

```bash
npm run release:notes
npm run release:notes -- --out release/release-notes.md --zh-out release/release-notes.zh-CN.md
```

Release notes list every commit from the previous `v<version>` tag to the
current build, grouped by area and repeated in a complete `All Commits` section.
The default console output includes English and Chinese sections. Use
`--zh-out` when you want a separate Chinese markdown file.

The run file defaults to installing into `~/.tmux-ui`:

```bash
./release/release.run help
./release/release.run install
./release/release.run start
./release/release.run restart
./release/release.run service-install
./release/release.run uninstall
```

For every publishable build, bump the patch version before packing. The
dashboard and `/api/health` expose `version`, `commit`, and `builtAt`, so the
browser title and health checks can tell whether the running server is current:

```bash
curl -s http://<host>:3000/api/health
```

Download and run a GitHub Release build:

```bash
curl -L -o tmux.run https://github.com/neatstudio/tmux-browser/releases/latest/download/release.run
chmod +x tmux.run
./tmux.run help
./tmux.run install
```

`./tmux.run` is the bootstrap file you downloaded. During `install`, tmux-ui
copies the run file into `~/.tmux-ui/bin/tmux-ui` and links it as
`~/.local/bin/tmux-ui` when possible. If `~/.local/bin` is not writable, it
tries `/usr/local/bin`. The installer also updates a common shell profile when
the chosen bin directory is not already on `PATH`.

After install, use the stable `tmux-ui` command:

```bash
tmux-ui help
tmux-ui start
tmux-ui restart
tmux-ui stop
tmux-ui upgrade
tmux-ui uninstall
```

If your current shell still says `tmux-ui: command not found`, restart the
shell or run the `source ...` command printed by the installer. For a temporary
one-shell fix, run:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

If `start` is run outside tmux, the script automatically starts tmux-ui inside
the dedicated `tmux-ui` tmux session so closing the terminal does not stop the
server. When already inside tmux, `start` runs in the current pane.

For a clean long-running restart, use `restart`:

```bash
tmux-ui restart
```

That command extracts the app into `~/.tmux-ui`, installs production
dependencies if needed, and starts the server inside a dedicated tmux session
named `tmux-ui`. Stop or remove it with:

```bash
tmux-ui stop
tmux-ui uninstall
```

Use `tmux-ui upgrade` to download the latest GitHub Release `release.run` and
reinstall it in place. If tmux-ui was installed as a service, `upgrade` keeps the
service mode and restarts through service install; otherwise it runs `install`
and `restart`.

On Linux/systemd servers, prefer service mode when you do not want a keeper
tmux session:

```bash
tmux-ui service-install
tmux-ui service-status
tmux-ui service-start
tmux-ui service-restart
tmux-ui service-stop
tmux-ui service-uninstall
```

The default unit is `/etc/systemd/system/tmux-ui.service`. Override the service
name with `TMUX_UI_SERVICE_NAME` or the unit path with `TMUX_UI_SYSTEMD_UNIT`.
If you have installed service mode, these native commands are useful for
checking whether the service exists and whether it is running:

```bash
systemctl status tmux-ui
systemctl is-enabled tmux-ui
systemctl is-active tmux-ui
journalctl -u tmux-ui -n 100 --no-pager
systemctl start tmux-ui
systemctl restart tmux-ui
systemctl stop tmux-ui
```

On macOS/local, the same service commands install a user launchd service:

```bash
tmux-ui service-install
tmux-ui service-status
tmux-ui service-start
tmux-ui service-restart
tmux-ui service-stop
tmux-ui service-uninstall
```

The default launchd plist is
`~/Library/LaunchAgents/com.neatstudio.tmux-ui.plist`. Logs are written to
`~/.tmux-ui/tmux-ui.log` and `~/.tmux-ui/tmux-ui.err.log`.
If you have installed service mode, use these native launchd commands to check
or operate it:

```bash
launchctl print "gui/$(id -u)/com.neatstudio.tmux-ui"
launchctl kickstart -k "gui/$(id -u)/com.neatstudio.tmux-ui"
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.neatstudio.tmux-ui.plist"
tail -n 100 ~/.tmux-ui/tmux-ui.log
tail -n 100 ~/.tmux-ui/tmux-ui.err.log
```

Packaged `.run` installs auto-bind to the first `100.*` Tailscale IP when
available, then fall back to `127.0.0.1`. Set `HOST` or `PORT` explicitly to
override, but use a specific private IP. `HOST=0.0.0.0` is rejected:

```bash
HOST=100.x.y.z PORT=3000 ./release/release.run start
```

Publish an existing run file to one or more servers:

```bash
npm run publish -- --target server-a:/root/tmux --install --restart
```

Without `--target`, `publish` reads `.tmux-ui.publish.json` when present. That
file is ignored by Git so private server names do not enter the public repo.
Copy `.tmux-ui.publish.json.example` to `.tmux-ui.publish.json` for local
multi-server publishing:

```bash
cp .tmux-ui.publish.json.example .tmux-ui.publish.json
```

Publish targets must use SSH hosts that are already usable from this machine.
In practice, each host name in the target list must be resolvable from your
local `~/.ssh/config` or by normal SSH hostname resolution. For example, a target
like `server-a:/root/tmux` expects this to work first:

```bash
ssh server-a
```

On GitHub, pushing to `main` creates tag `v<package.json version>` when it does
not already exist. That tag builds the same two run files and publishes them as
a GitHub Release.

## Kanban Projects

Open `/?view=kanban` to create project-scoped agent sessions. A project defines
the project name, path, optional SSH server, and agents such as `claude`,
`codex`, or `kiro`. Each agent gets a stable tmux session name:
`<project>-<agent>`.

For local projects, tmux-ui creates the agent session in the project path and
optionally starts the configured command. For remote projects, tmux-ui creates a
local wrapper session with the same stable name; that wrapper SSHes to the
server and attaches to or creates the same named tmux session on the remote
host. This keeps browser tabs openable from the local tmux-ui while still giving
remote agents a predictable resume name.

## Agent Hook Events

tmux-ui can accept explicit events from Codex, Claude, or other agent hooks.
This is more reliable than screen parsing for states such as waiting for
approval, blocked tasks, or failed commands.

Hook requests from `127.0.0.1`, `::1`, or Tailscale `100.64.0.0/10` do not
require a token. Other sources require a token. Setting one is still recommended
when you want explicit protection in every environment:

```bash
export TMUX_UI_HOOK_TOKEN='change-me'
tmux-ui restart
```

Install Codex/Claude hooks:

```bash
tmux-ui hooks-install
```

Uninstall hooks installed by tmux-ui:

```bash
tmux-ui hooks-uninstall
```

`hooks-install` merges a Codex `PermissionRequest` hook into
`~/.codex/hooks.json` and a Claude `Notification(permission_prompt|idle_prompt)`
hook into `~/.claude/settings.json`. Existing hooks are preserved.

For other tools, call the helper manually from that tool's hook system:

```bash
echo "Approve file edit?" | \
  TMUX_UI_HOOK_SOURCE=codex \
  TMUX_UI_HOOK_EVENT_TYPE=approval-required \
  TMUX_UI_HOOK_STATUS=waiting \
  TMUX_UI_HOOK_TITLE='Need confirmation' \
  ~/.tmux-ui/bin/tmux-ui-hook
```

The helper infers the tmux session from the current tmux environment. Outside
tmux, set `TMUX_UI_SESSION_NAME=<session>` explicitly. The server records the
event in the timeline and pushes it over the global websocket; `waiting`,
`blocked`, `need-input`, and `failed` events appear in Action Center.

If the service is not listening on `127.0.0.1:3000`, set
`TMUX_UI_HOOK_URL=http://100.x.y.z:3000/api/hooks/events` in the hook
environment.

## tmux Restoration

tmux-ui can optionally install and manage `tmux-resurrect` plus
`tmux-continuum` so tmux sessions can be saved and restored after a reboot or an
unexpected exit. This is not part of the default `install` command because it
modifies `~/.tmux.conf`, installs TPM plugins under `~/.tmux/plugins`, and needs
GitHub access during plugin installation.

```bash
tmux-ui tmux-install
tmux-ui tmux-status
tmux-ui tmux-save
tmux-ui tmux-restore
tmux-ui tmux-update
```

What this adds:

- TPM at `~/.tmux/plugins/tpm`
- `tmux-resurrect` and `tmux-continuum`
- a managed block in `~/.tmux.conf`
- automatic tmux saves every 15 minutes
- automatic restore when tmux starts
- manual save with `Ctrl-b` then `Ctrl-s`
- manual restore with `Ctrl-b` then `Ctrl-r`

When tmux restoration is installed, tmux-ui also attempts a safe automatic
restore before starting the server: it only restores when tmux currently has no
sessions. Set `TMUX_UI_TMUX_AUTO_RESTORE=0` to disable that behavior.

Important limitation: tmux-resurrect cannot restore process memory. It can
restore sessions, windows, panes, layouts, current directories, pane contents,
and restart some commands, but an interrupted process must support its own
resume/checkpoint behavior.

## Image Uploads

In a terminal session page, paste or drag an image into the terminal. tmux-ui
uploads it to the server and inserts the saved absolute file path into the
current tmux input line without pressing Enter.

Uploaded images are stored under:

```text
~/.tmux-ui/uploads/<session-name>/
```

The server accepts PNG, JPEG, GIF, and WebP by image signature instead of only
trusting the filename or browser MIME type. Uploads are capped at 10MB per file.
Old upload files are cleaned during upload; the default retention is 7 days and
the default total upload budget is 1GB.

## tmux Lifecycle Rules

- The dashboard session list comes from real `tmux list-sessions`
- Opening a browser tab attaches to a tmux session
- Closing a browser tab does not kill the tmux session
- Refreshing or closing the browser does not kill the tmux session
- Clicking `Kill` in the dashboard sends `tmux kill-session -t <name>`
- Clicking `Kill` in a session page asks for confirmation before killing
- If a session is open in a browser tab when it is killed, that browser terminal view closes
