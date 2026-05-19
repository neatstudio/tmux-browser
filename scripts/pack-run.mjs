#!/usr/bin/env node
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const releaseDir = join(rootDir, "release");
const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
const projectName = "tmux-ui";
const version = packageJson.version ?? "0.0.0";
const versionOutputFile = join(releaseDir, `${projectName}-${version}.run`);
const releaseOutputFile = join(releaseDir, "release.run");
const payloadMarker = "__TMUX_UI_PAYLOAD_BELOW__";
const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: rootDir,
  encoding: "utf8"
}).stdout.trim();
const builtAt = new Date().toISOString();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function writeExecutable(path, content) {
  writeFileSync(path, content, "utf8");
  chmodSync(path, 0o755);
}

function stripMacExtendedAttributes(path) {
  if (process.platform !== "darwin") {
    return;
  }

  spawnSync("xattr", ["-cr", path], {
    cwd: rootDir,
    stdio: "ignore"
  });
}

function createInstallScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

load_node_runtime() {
  export NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"
  local node_version="\${TMUX_UI_NODE_VERSION:-22}"

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return
  fi

  if command -v nvm >/dev/null 2>&1; then
    nvm install "$node_version"
    nvm use "$node_version"
  fi
}

require_install_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    missing+=("$1")
  fi
}

check_native_build_requirements() {
  local missing=()

  require_install_command make
  require_install_command g++
  require_install_command python3

  if [[ "\${#missing[@]}" -gt 0 ]]; then
    echo "Missing native build tools required by node-pty: \${missing[*]}" >&2
    echo "Install them first, then rerun this command." >&2
    echo "Debian/Ubuntu: apt-get update && apt-get install -y build-essential python3" >&2
    echo "RHEL/CentOS: dnf groupinstall -y 'Development Tools' && dnf install -y python3" >&2
    exit 1
  fi
}

load_node_runtime
check_native_build_requirements
npm ci --omit=dev
`;
}

function createStartScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

load_node_runtime() {
  export NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"
  local node_version="\${TMUX_UI_NODE_VERSION:-22}"

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return
  fi

  if command -v nvm >/dev/null 2>&1; then
    nvm install "$node_version"
    nvm use "$node_version"
  fi
}

detect_tailscale_host_with_ip() {
  if ! command -v ip >/dev/null 2>&1; then
    return
  fi

  ip -o -4 addr show scope global | awk '{ print $4 }' | cut -d/ -f1 | awk '/^100\\./ { print; exit }'
}

detect_tailscale_host_with_ifconfig() {
  if ! command -v ifconfig >/dev/null 2>&1; then
    return
  fi

  ifconfig 2>/dev/null | awk '/inet / { print $2 }' | awk '/^100\\./ { print; exit }'
}

detect_tailscale_host() {
  local host
  host="$(detect_tailscale_host_with_ip)"

  if [[ -z "$host" ]]; then
    host="$(detect_tailscale_host_with_ifconfig)"
  fi

  if [[ -z "$host" ]]; then
    echo "No Tailscale 100.x address found. Set HOST explicitly if you want another bind address." >&2
    echo "Example: HOST=0.0.0.0 PORT=\${PORT:-3000} $0" >&2
    exit 1
  fi

  echo "$host"
}

load_node_runtime
HOST="\${HOST:-}"
if [[ -z "$HOST" ]]; then
  HOST="$(detect_tailscale_host)"
fi
export HOST
export PORT="\${PORT:-3000}"
export TMUX_UI_COMMIT="\${TMUX_UI_COMMIT:-${commit || "unknown"}}"
export TMUX_UI_BUILT_AT="\${TMUX_UI_BUILT_AT:-${builtAt}}"
echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] Starting tmux-ui from $(pwd) on http://$HOST:$PORT"
exec node dist/server/index.js
`;
}

function createDeployReadme() {
  return `# tmux-ui run release

This package contains the built app and lockfile. It intentionally does not
vendor node_modules because node-pty is a native module and must be installed
on the target server OS/architecture.

Requirements on the target server:

- Node.js 20+
- npm
- tmux
- git, optional for git status display
- python3, make, and g++, if node-pty must build from source

Run:

\`\`\`bash
chmod +x tmux-ui.run
./tmux-ui.run install
./tmux-ui.run restart
\`\`\`

On Linux hosts with systemd, use service mode to keep tmux-ui running without a
keeper tmux window:

\`\`\`bash
./tmux-ui.run service-install
./tmux-ui.run service-status
\`\`\`

The default install directory is \`~/.tmux-ui\`.
The default tmux session used by \`restart\` is \`tmux-ui\`.
The default systemd service name is \`tmux-ui\`.
The server binds to the first Tailscale IPv4 address matching \`100.*\` unless
\`HOST\` is set explicitly.
`;
}

function createStub() {
  return `#!/usr/bin/env bash
set -euo pipefail

APP_HOME="\${TMUX_UI_HOME:-$HOME/.tmux-ui}"
APP_SESSION="\${TMUX_UI_SESSION:-tmux-ui}"
SERVICE_NAME="\${TMUX_UI_SERVICE_NAME:-tmux-ui}"
SYSTEMD_UNIT_PATH="\${TMUX_UI_SYSTEMD_UNIT:-/etc/systemd/system/$SERVICE_NAME.service}"
LAUNCHD_LABEL="\${TMUX_UI_LAUNCHD_LABEL:-com.neatstudio.$SERVICE_NAME}"
LAUNCHD_PLIST_PATH="\${TMUX_UI_LAUNCHD_PLIST:-$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist}"
PID_FILE="\${APP_HOME}/tmux-ui.pid"
APP_BIN_DIR="$APP_HOME/bin"
USER_BIN_DIR="\${TMUX_UI_USER_BIN:-$HOME/.local/bin}"
CLI_NAME="\${TMUX_UI_CLI_NAME:-tmux-ui}"
LEGACY_APP_HOME="\${TMUX_UI_LEGACY_HOME:-$HOME/.local/share/gemm4-node}"
COMMAND="\${1:-help}"
MARKER="${payloadMarker}"

archive_line() {
  awk "/^\${MARKER}$/ { print NR + 1; exit 0; }" "$0"
}

extract_payload() {
  local line
  line="$(archive_line)"

  if [[ -z "$line" ]]; then
    echo "Cannot find embedded payload marker" >&2
    exit 1
  fi

  mkdir -p "$APP_HOME"
  rm -rf "$APP_HOME/dist"
  rm -f "$APP_HOME/package.json" "$APP_HOME/package-lock.json"
  rm -f "$APP_HOME/start.sh" "$APP_HOME/install.sh" "$APP_HOME/README_DEPLOY.md"
  tail -n +"$line" "$0" | tar -xzf - -C "$APP_HOME"
  chmod +x "$APP_HOME/start.sh" "$APP_HOME/install.sh" 2>/dev/null || true
}

ensure_user_bin_on_path() {
  local profile
  local path_line='export PATH="$HOME/.local/bin:$PATH"'
  local profiles=("$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile")

  for profile in "\${profiles[@]}"; do
    if [[ -f "$profile" ]] && grep -F '$HOME/.local/bin' "$profile" >/dev/null 2>&1; then
      return
    fi
  done

  for profile in "\${profiles[@]}"; do
    if [[ -f "$profile" ]]; then
      printf '\\n# Added by tmux-ui installer\\n%s\\n' "$path_line" >> "$profile"
      return
    fi
  done

  printf '# Added by tmux-ui installer\\n%s\\n' "$path_line" > "$HOME/.profile"
}

install_cli_entrypoint() {
  mkdir -p "$APP_BIN_DIR" "$USER_BIN_DIR"
  cp "$0" "$APP_BIN_DIR/$CLI_NAME"
  chmod +x "$APP_BIN_DIR/$CLI_NAME"
  ln -sfn "$APP_BIN_DIR/$CLI_NAME" "$USER_BIN_DIR/$CLI_NAME"
  ensure_user_bin_on_path
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_node_runtime() {
  export NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"
  local node_version="\${TMUX_UI_NODE_VERSION:-22}"

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi

  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return
  fi

  if command -v nvm >/dev/null 2>&1; then
    nvm install "$node_version"
    nvm use "$node_version"
  fi
}

show_help() {
  cat <<'HELP'
tmux-ui run release

Commands:
  help         Show this help
  install      Extract and install production npm dependencies
  start        Extract and start the server, installing deps if missing
  restart      Extract, install if needed, and restart inside a tmux-ui tmux session
  stop         Stop the tmux-ui service started by restart
  service-install  Install systemd/launchd service
  service-start    Start systemd/launchd service
  service-restart  Restart systemd/launchd service
  service-status   Show systemd/launchd service status
  service-stop     Stop systemd/launchd service
  service-uninstall Stop and remove systemd/launchd service
  uninstall    Stop tmux-ui and remove the install directory
  extract      Extract files only
  dir          Print install directory

Environment:
  TMUX_UI_HOME      Install directory, default: $HOME/.tmux-ui
  TMUX_UI_SESSION   tmux session for restart/stop, default: tmux-ui
  TMUX_UI_SERVICE_NAME systemd service name, default: tmux-ui
  TMUX_UI_SYSTEMD_UNIT systemd unit path, default: /etc/systemd/system/$SERVICE_NAME.service
  TMUX_UI_LAUNCHD_LABEL macOS launchd label, default: com.neatstudio.$SERVICE_NAME
  TMUX_UI_LAUNCHD_PLIST macOS launchd plist path, default: ~/Library/LaunchAgents/$LAUNCHD_LABEL.plist
  HOST              Bind host for start, default: first Tailscale 100.x address
  PORT              Bind port for start, default: 3000

No command defaults to help. Use "start" or "restart" explicitly to run the server.
HELP
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

stop_pid_file_process() {
  if [[ ! -f "$PID_FILE" ]]; then
    return
  fi

  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"

  if is_pid_running "$pid"; then
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi

  rm -f "$PID_FILE"
}

stop_legacy_app_processes() {
  if [[ "$LEGACY_APP_HOME" == "$APP_HOME" ]]; then
    return
  fi

  if [[ ! -d "$LEGACY_APP_HOME" ]]; then
    return
  fi

  local pid
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue

    local cwd
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"

    if [[ "$cwd" == "$LEGACY_APP_HOME" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < <(pgrep -f "node dist/server/index.js" 2>/dev/null || true)
}

stop_port_processes() {
  local port="\${PORT:-3000}"

  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  local pid
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue

    local command_line
    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"

    if [[ "$command_line" == *"dist/server/index.js"* ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done < <(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
}

stop_systemd_service_if_present() {
  if ! command -v systemctl >/dev/null 2>&1; then
    return
  fi

  if [[ -f "$SYSTEMD_UNIT_PATH" ]]; then
    systemctl stop "$SERVICE_NAME.service" 2>/dev/null || true
  fi
}

is_macos() {
  [[ "$(uname -s)" == "Darwin" ]]
}

stop_launchd_service_if_present() {
  if ! is_macos || ! command -v launchctl >/dev/null 2>&1; then
    return
  fi

  if [[ -f "$LAUNCHD_PLIST_PATH" ]]; then
    launchctl bootout "gui/$(id -u)" "$LAUNCHD_PLIST_PATH" 2>/dev/null || true
  fi
}

write_systemd_unit() {
  require_command systemctl

  local unit_dir port_value
  unit_dir="$(dirname "$SYSTEMD_UNIT_PATH")"
  port_value="\${PORT:-3000}"
  mkdir -p "$unit_dir"

  {
    cat <<UNIT
[Unit]
Description=tmux-ui browser dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_HOME
Environment=HOME=$HOME
Environment=NVM_DIR=$NVM_DIR
Environment=PORT=$port_value
UNIT
    if [[ -n "\${HOST:-}" ]]; then
      printf 'Environment=HOST=%s\\n' "$HOST"
    fi
    cat <<UNIT
ExecStart=$APP_HOME/start.sh
Restart=always
RestartSec=2
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
UNIT
  } > "$SYSTEMD_UNIT_PATH"

  systemctl daemon-reload
}

write_launchd_plist() {
  local plist_dir port_value host_value
  plist_dir="$(dirname "$LAUNCHD_PLIST_PATH")"
  port_value="\${PORT:-3000}"
  host_value="\${HOST:-}"
  mkdir -p "$plist_dir"

  cat > "$LAUNCHD_PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LAUNCHD_LABEL</string>
  <key>WorkingDirectory</key>
  <string>$APP_HOME</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP_HOME/start.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>NVM_DIR</key>
    <string>$NVM_DIR</string>
    <key>PORT</key>
    <string>$port_value</string>
PLIST

  if [[ -n "$host_value" ]]; then
    cat >> "$LAUNCHD_PLIST_PATH" <<PLIST
    <key>HOST</key>
    <string>$host_value</string>
PLIST
  fi

  cat >> "$LAUNCHD_PLIST_PATH" <<PLIST
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$APP_HOME/tmux-ui.log</string>
  <key>StandardErrorPath</key>
  <string>$APP_HOME/tmux-ui.err.log</string>
</dict>
</plist>
PLIST
}

install_launchd_service() {
  load_node_runtime
  require_command node
  require_command npm
  require_command launchctl
  extract_payload
  install_cli_entrypoint

  if [[ ! -d "$APP_HOME/node_modules" ]]; then
    "$APP_HOME/install.sh"
  fi

  stop_server
  write_launchd_plist
  launchctl bootout "gui/$(id -u)" "$LAUNCHD_PLIST_PATH" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_PLIST_PATH"
  launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL"
  print_launchd_status
}

start_launchd_service() {
  require_command launchctl
  bootstrap_launchd_service_if_needed
  launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL"
  print_launchd_status
}

stop_launchd_service() {
  require_command launchctl
  launchctl bootout "gui/$(id -u)" "$LAUNCHD_PLIST_PATH" 2>/dev/null || true
  echo "Stopped launchd service $LAUNCHD_LABEL"
}

status_launchd_service() {
  require_command launchctl
  print_launchd_status
}

uninstall_launchd_service() {
  require_command launchctl
  launchctl bootout "gui/$(id -u)" "$LAUNCHD_PLIST_PATH" 2>/dev/null || true
  rm -f "$LAUNCHD_PLIST_PATH"
  echo "Removed $LAUNCHD_PLIST_PATH"
}

bootstrap_launchd_service_if_needed() {
  if launchctl print "gui/$(id -u)/$LAUNCHD_LABEL" >/dev/null 2>&1; then
    return
  fi

  if [[ ! -f "$LAUNCHD_PLIST_PATH" ]]; then
    echo "launchd plist not found: $LAUNCHD_PLIST_PATH" >&2
    echo "Run service-install first." >&2
    exit 1
  fi

  launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_PLIST_PATH"
}

print_launchd_status() {
  local output state pid runs
  output="$(launchctl print "gui/$(id -u)/$LAUNCHD_LABEL" 2>/dev/null || true)"

  if [[ -z "$output" ]]; then
    echo "launchd service $LAUNCHD_LABEL is not loaded"
    echo "plist: $LAUNCHD_PLIST_PATH"
    return 3
  fi

  state="$(printf '%s\n' "$output" | awk -F'= ' '/state =/ { print $2; exit }')"
  pid="$(printf '%s\n' "$output" | awk -F'= ' '/pid =/ { print $2; exit }')"
  runs="$(printf '%s\n' "$output" | awk -F'= ' '/runs =/ { print $2; exit }')"

  echo "launchd service: $LAUNCHD_LABEL"
  echo "state: \${state:-unknown}"
  echo "pid: \${pid:-none}"
  echo "runs: \${runs:-unknown}"
  echo "plist: $LAUNCHD_PLIST_PATH"
  echo "logs: $APP_HOME/tmux-ui.log"
  echo "errors: $APP_HOME/tmux-ui.err.log"
}

install_service() {
  if is_macos; then
    install_launchd_service
    return
  fi

  load_node_runtime
  require_command node
  require_command npm
  require_command tmux
  require_command systemctl
  extract_payload
  install_cli_entrypoint

  if [[ ! -d "$APP_HOME/node_modules" ]]; then
    "$APP_HOME/install.sh"
  fi

  stop_server
  write_systemd_unit
  systemctl enable "$SERVICE_NAME.service"
  systemctl restart "$SERVICE_NAME.service"
  systemctl status "$SERVICE_NAME.service" --no-pager || true
}

start_service() {
  if is_macos; then
    start_launchd_service
    return
  fi

  require_command systemctl
  systemctl start "$SERVICE_NAME.service"
  systemctl status "$SERVICE_NAME.service" --no-pager || true
}

stop_service() {
  if is_macos; then
    stop_launchd_service
    return
  fi

  require_command systemctl
  systemctl stop "$SERVICE_NAME.service"
}

status_service() {
  if is_macos; then
    status_launchd_service
    return
  fi

  require_command systemctl
  systemctl status "$SERVICE_NAME.service" --no-pager
}

uninstall_service() {
  if is_macos; then
    uninstall_launchd_service
    return
  fi

  require_command systemctl
  systemctl stop "$SERVICE_NAME.service" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME.service" 2>/dev/null || true
  rm -f "$SYSTEMD_UNIT_PATH"
  systemctl daemon-reload
  echo "Removed $SYSTEMD_UNIT_PATH"
}

ensure_tmux_session() {
  if tmux has-session -t "$APP_SESSION" 2>/dev/null; then
    return
  fi

  tmux new-session -d -s "$APP_SESSION" -c "$HOME"
}

start_server_in_tmux() {
  ensure_tmux_session
  tmux respawn-pane -k -t "$APP_SESSION" -c "$APP_HOME" "PORT='\${PORT:-3000}' ./start.sh"
  tmux ls
}

stop_server() {
  stop_systemd_service_if_present
  stop_launchd_service_if_present

  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$APP_SESSION" 2>/dev/null; then
    tmux send-keys -t "$APP_SESSION" C-c
  fi

  stop_pid_file_process
  stop_legacy_app_processes
  stop_port_processes
  sleep 1
}

restart_server() {
  require_command node
  require_command npm
  require_command tmux
  extract_payload

  if [[ ! -d "$APP_HOME/node_modules" ]]; then
    "$APP_HOME/install.sh"
  fi

  stop_server
  start_server_in_tmux
}

uninstall_server() {
  if is_macos && [[ -f "$LAUNCHD_PLIST_PATH" ]]; then
    uninstall_service
  elif command -v systemctl >/dev/null 2>&1 && [[ -f "$SYSTEMD_UNIT_PATH" ]]; then
    uninstall_service
  fi

  stop_server
  if [[ -L "$USER_BIN_DIR/$CLI_NAME" ]] && [[ "$(readlink "$USER_BIN_DIR/$CLI_NAME" 2>/dev/null || true)" == "$APP_BIN_DIR/$CLI_NAME" ]]; then
    rm -f "$USER_BIN_DIR/$CLI_NAME"
  fi
  rm -rf "$APP_HOME"
  echo "Removed $APP_HOME"
}

case "$COMMAND" in
  install)
    load_node_runtime
    require_command npm
    extract_payload
    install_cli_entrypoint
    "$APP_HOME/install.sh"
    ;;
  start)
    load_node_runtime
    require_command node
    require_command npm
    require_command tmux
    extract_payload
    install_cli_entrypoint

    if [[ ! -d "$APP_HOME/node_modules" ]]; then
      "$APP_HOME/install.sh"
    fi

    if [[ -z "\${TMUX:-}" ]]; then
      echo "Not running inside tmux. Starting tmux-ui in tmux session '$APP_SESSION' instead."
      start_server_in_tmux
    else
      "$APP_HOME/start.sh"
    fi
    ;;
  restart)
    load_node_runtime
    install_cli_entrypoint
    restart_server
    ;;
  service-install)
    install_service
    ;;
  service-start)
    start_service
    ;;
  service-restart)
    install_service
    ;;
  service-status)
    status_service
    ;;
  service-stop)
    stop_service
    ;;
  service-uninstall)
    uninstall_service
    ;;
  stop)
    stop_server
    ;;
  uninstall)
    uninstall_server
    ;;
  extract)
    extract_payload
    install_cli_entrypoint
    ;;
  dir)
    echo "$APP_HOME"
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    show_help >&2
    exit 1
    ;;
esac

exit 0
${payloadMarker}
`;
}

run("npm", ["run", "build"]);

mkdirSync(releaseDir, { recursive: true });

const stageDir = mkdtempSync(join(tmpdir(), `${projectName}-release-`));
const payloadDir = join(stageDir, "payload");
const payloadArchive = join(stageDir, "payload.tar.gz");

try {
  mkdirSync(payloadDir, { recursive: true });
  cpSync(join(rootDir, "dist"), join(payloadDir, "dist"), { recursive: true });
  cpSync(join(rootDir, "package.json"), join(payloadDir, "package.json"));
  cpSync(join(rootDir, "package-lock.json"), join(payloadDir, "package-lock.json"));
  stripMacExtendedAttributes(payloadDir);

  writeExecutable(join(payloadDir, "install.sh"), createInstallScript());
  writeExecutable(join(payloadDir, "start.sh"), createStartScript());
  writeFileSync(join(payloadDir, "README_DEPLOY.md"), createDeployReadme());

  run("tar", ["--format", "ustar", "-czf", payloadArchive, "-C", payloadDir, "."], {
    env: {
      ...process.env,
      COPYFILE_DISABLE: "1"
    }
  });

  writeFileSync(versionOutputFile, createStub(), "utf8");
  appendFileSync(versionOutputFile, readFileSync(payloadArchive));
  chmodSync(versionOutputFile, 0o755);
  copyFileSync(versionOutputFile, releaseOutputFile);
  chmodSync(releaseOutputFile, 0o755);

  console.log(`Created ${versionOutputFile}`);
  console.log(`Updated ${releaseOutputFile}`);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
