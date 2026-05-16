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
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
const outputFile = join(releaseDir, `${projectName}-${version}-${stamp}.run`);
const latestOutputFile = join(releaseDir, `${projectName}.run`);
const tmuxCompatOutputFile = join(releaseDir, "tmux.run");
const payloadMarker = "__TMUX_UI_PAYLOAD_BELOW__";

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

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
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

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi
}

detect_tailscale_host() {
  if ! command -v ip >/dev/null 2>&1; then
    echo "Missing required command: ip. Set HOST explicitly or install iproute2." >&2
    exit 1
  fi

  local host
  host="$(ip -o -4 addr show scope global | awk '{ print $4 }' | cut -d/ -f1 | awk '/^100\\./ { print; exit }')"

  if [[ -z "$host" ]]; then
    echo "No Tailscale 100.x address found. Set HOST explicitly if you want another bind address." >&2
    echo "Example: HOST=0.0.0.0 PORT=\${PORT:-3000} $0" >&2
    exit 1
  fi

  echo "$host"
}

load_node_runtime
export HOST="\${HOST:-$(detect_tailscale_host)}"
export PORT="\${PORT:-3000}"
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
./tmux-ui.run start
\`\`\`

The default install directory is \`~/.tmux-ui\`.
The default tmux session used by \`restart\` is \`tmux-ui\`.
The server binds to the first Tailscale IPv4 address matching \`100.*\` unless
\`HOST\` is set explicitly.
`;
}

function createStub() {
  return `#!/usr/bin/env bash
set -euo pipefail

APP_HOME="\${TMUX_UI_HOME:-$HOME/.tmux-ui}"
APP_SESSION="\${TMUX_UI_SESSION:-tmux-ui}"
PID_FILE="\${APP_HOME}/tmux-ui.pid"
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

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_node_runtime() {
  export NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"

  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
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
  uninstall    Stop tmux-ui and remove the install directory
  extract      Extract files only
  dir          Print install directory

Environment:
  TMUX_UI_HOME      Install directory, default: $HOME/.tmux-ui
  TMUX_UI_SESSION   tmux session for restart/stop, default: tmux-ui
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

ensure_tmux_session() {
  if tmux has-session -t "$APP_SESSION" 2>/dev/null; then
    return
  fi

  tmux new-session -d -s "$APP_SESSION"
}

stop_server() {
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$APP_SESSION" 2>/dev/null; then
    tmux send-keys -t "$APP_SESSION" C-c
  fi

  stop_pid_file_process
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
  ensure_tmux_session
  tmux send-keys -t "$APP_SESSION" "cd '$APP_HOME' && PORT='\${PORT:-3000}' HOST='\${HOST:-}' ./start.sh" C-m
  tmux ls
}

uninstall_server() {
  stop_server
  rm -rf "$APP_HOME"
  echo "Removed $APP_HOME"
}

case "$COMMAND" in
  install)
    load_node_runtime
    require_command npm
    extract_payload
    "$APP_HOME/install.sh"
    ;;
  start)
    load_node_runtime
    require_command node
    require_command npm
    require_command tmux
    extract_payload

    if [[ ! -d "$APP_HOME/node_modules" ]]; then
      "$APP_HOME/install.sh"
    fi

    "$APP_HOME/start.sh"
    ;;
  restart)
    load_node_runtime
    restart_server
    ;;
  stop)
    stop_server
    ;;
  uninstall)
    uninstall_server
    ;;
  extract)
    extract_payload
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

  writeFileSync(outputFile, createStub(), "utf8");
  appendFileSync(outputFile, readFileSync(payloadArchive));
  chmodSync(outputFile, 0o755);
  copyFileSync(outputFile, latestOutputFile);
  chmodSync(latestOutputFile, 0o755);
  copyFileSync(outputFile, tmuxCompatOutputFile);
  chmodSync(tmuxCompatOutputFile, 0o755);

  console.log(`Created ${outputFile}`);
  console.log(`Updated ${latestOutputFile}`);
  console.log(`Updated ${tmuxCompatOutputFile}`);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
