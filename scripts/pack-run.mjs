#!/usr/bin/env node
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
const tmuxResurrectSource = join(rootDir, "scripts", "helpers", "tmux-resurrect.sh");
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

function cleanupOldRunFiles() {
  if (!existsSync(releaseDir)) {
    return;
  }

  for (const entry of readdirSync(releaseDir)) {
    if (
      (entry.startsWith(`${projectName}-`) && entry.endsWith(".run")) ||
      entry === "tmux-ui.run" ||
      entry === "tmux.run" ||
      entry === "gemm4-node-latest.run"
    ) {
      rmSync(join(releaseDir, entry), { force: true });
    }
  }
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
  NVM_INSTALL_VERSION="\${TMUX_UI_NVM_VERSION:-v0.40.4}"

  prepend_path_if_dir() {
    local directory="$1"
    [[ -d "$directory" ]] || return 0

    case ":$PATH:" in
      *":$directory:"*) ;;
      *) PATH="$directory:$PATH" ;;
    esac
  }

  prepend_path_if_dir "$HOME/.local/bin"
  prepend_path_if_dir "$HOME/.hermes/node/bin"
  prepend_path_if_dir "/opt/homebrew/bin"
  prepend_path_if_dir "/opt/homebrew/sbin"
  prepend_path_if_dir "/usr/local/bin"
  prepend_path_if_dir "/usr/local/sbin"

  local version_dir
  for version_dir in "$NVM_DIR"/versions/node/v"$node_version"*/bin; do
    prepend_path_if_dir "$version_dir"
  done

  export PATH

  install_nvm_if_missing() {
    if [[ -s "$NVM_DIR/nvm.sh" ]]; then
      return
    fi

    local install_url="https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_INSTALL_VERSION/install.sh"
    echo "Installing nvm $NVM_INSTALL_VERSION into $NVM_DIR"
    mkdir -p "$NVM_DIR"

    if command -v curl >/dev/null 2>&1; then
      PROFILE=/dev/null curl -fsSL "$install_url" | bash
      return
    fi

    if command -v wget >/dev/null 2>&1; then
      PROFILE=/dev/null wget -qO- "$install_url" | bash
      return
    fi

    echo "Missing curl or wget; cannot install nvm automatically." >&2
    exit 1
  }

  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    install_nvm_if_missing
  fi

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
    nvm alias default "$node_version" >/dev/null 2>&1 || true
    return
  fi

  echo "nvm installation failed; node/npm are still unavailable." >&2
  exit 1
}

run_privileged() {
  if [[ "\${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "Need root privileges to install: $*" >&2
  exit 1
}

install_system_packages() {
  if command -v brew >/dev/null 2>&1; then
    brew install "$@"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    run_privileged apt-get update
    run_privileged apt-get install -y "$@"
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y "$@"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    run_privileged yum install -y "$@"
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    run_privileged apk add --no-cache "$@"
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    run_privileged pacman -Sy --noconfirm "$@"
    return
  fi

  echo "No supported package manager found for installing: $*" >&2
  exit 1
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
    echo "Installing native build tools required by node-pty: \${missing[*]}"

    if command -v apt-get >/dev/null 2>&1; then
      install_system_packages build-essential python3
    elif command -v dnf >/dev/null 2>&1; then
      run_privileged dnf groupinstall -y "Development Tools" || true
      install_system_packages python3 gcc-c++ make
    elif command -v yum >/dev/null 2>&1; then
      run_privileged yum groupinstall -y "Development Tools" || true
      install_system_packages python3 gcc-c++ make
    elif command -v apk >/dev/null 2>&1; then
      install_system_packages build-base python3
    elif command -v pacman >/dev/null 2>&1; then
      install_system_packages base-devel python
    elif command -v brew >/dev/null 2>&1; then
      install_system_packages python
    else
      echo "Missing native build tools required by node-pty: \${missing[*]}" >&2
      exit 1
    fi
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

TMUX_UI_TMUX_AUTO_RESTORE="\${TMUX_UI_TMUX_AUTO_RESTORE:-1}"

load_node_runtime() {
  export NVM_DIR="\${NVM_DIR:-$HOME/.nvm}"
  local node_version="\${TMUX_UI_NODE_VERSION:-22}"
  NVM_INSTALL_VERSION="\${TMUX_UI_NVM_VERSION:-v0.40.4}"

  prepend_path_if_dir() {
    local directory="$1"
    [[ -d "$directory" ]] || return 0

    case ":$PATH:" in
      *":$directory:"*) ;;
      *) PATH="$directory:$PATH" ;;
    esac
  }

  prepend_path_if_dir "$HOME/.local/bin"
  prepend_path_if_dir "$HOME/.hermes/node/bin"
  prepend_path_if_dir "/opt/homebrew/bin"
  prepend_path_if_dir "/opt/homebrew/sbin"
  prepend_path_if_dir "/usr/local/bin"
  prepend_path_if_dir "/usr/local/sbin"

  local version_dir
  for version_dir in "$NVM_DIR"/versions/node/v"$node_version"*/bin; do
    prepend_path_if_dir "$version_dir"
  done

  export PATH

  install_nvm_if_missing() {
    if [[ -s "$NVM_DIR/nvm.sh" ]]; then
      return
    fi

    local install_url="https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_INSTALL_VERSION/install.sh"
    echo "Installing nvm $NVM_INSTALL_VERSION into $NVM_DIR"
    mkdir -p "$NVM_DIR"

    if command -v curl >/dev/null 2>&1; then
      PROFILE=/dev/null curl -fsSL "$install_url" | bash
      return
    fi

    if command -v wget >/dev/null 2>&1; then
      PROFILE=/dev/null wget -qO- "$install_url" | bash
      return
    fi

    echo "Missing curl or wget; cannot install nvm automatically." >&2
    exit 1
  }

  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    install_nvm_if_missing
  fi

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
    nvm alias default "$node_version" >/dev/null 2>&1 || true
    return
  fi

  echo "nvm installation failed; node/npm are still unavailable." >&2
  exit 1
}

run_privileged() {
  if [[ "\${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "Need root privileges to install: $*" >&2
  exit 1
}

install_system_packages() {
  if command -v brew >/dev/null 2>&1; then
    brew install "$@"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    run_privileged apt-get update
    run_privileged apt-get install -y "$@"
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y "$@"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    run_privileged yum install -y "$@"
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    run_privileged apk add --no-cache "$@"
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    run_privileged pacman -Sy --noconfirm "$@"
    return
  fi

  echo "No supported package manager found for installing: $*" >&2
  exit 1
}

ensure_tmux_available() {
  if command -v tmux >/dev/null 2>&1; then
    return
  fi

  echo "tmux not found; installing tmux."
  install_system_packages tmux
}

reject_wildcard_host() {
  if [[ "$1" == "0.0.0.0" ]]; then
    echo "HOST=0.0.0.0 is not allowed. Use 127.0.0.1 or a specific private interface IP." >&2
    exit 1
  fi
}

detect_tailscale_host_with_ip() {
  command -v ip >/dev/null 2>&1 || return 1
  ip -o -4 addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | awk '/^100\\./ { print; exit }'
}

detect_tailscale_host_with_ifconfig() {
  command -v ifconfig >/dev/null 2>&1 || return 1
  ifconfig 2>/dev/null | awk '/inet / { print $2 }' | awk '/^100\\./ { print; exit }'
}

detect_tailscale_host() {
  detect_tailscale_host_with_ip || detect_tailscale_host_with_ifconfig || true
}

detect_bind_host() {
  if [[ -n "\${HOST:-}" ]]; then
    echo "$HOST"
    return
  fi

  local detected_host
  detected_host="$(detect_tailscale_host)"

  if [[ -n "$detected_host" ]]; then
    echo "$detected_host"
    return
  fi

  echo "127.0.0.1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

load_node_runtime
ensure_tmux_available
if [[ "$TMUX_UI_TMUX_AUTO_RESTORE" != "0" && -x "./tmux-resurrect.sh" ]]; then
  ./tmux-resurrect.sh restore-if-empty || true
fi
HOST="$(detect_bind_host)"
reject_wildcard_host "$HOST"
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
The server auto-binds to the first \`100.*\` Tailscale IP when available, unless
\`HOST\` is set explicitly. It falls back to \`127.0.0.1\`. Wildcard binding with
\`HOST=0.0.0.0\` is rejected; choose a specific private IP instead.

Optional tmux restoration:

\`\`\`bash
./tmux-ui.run tmux-install
./tmux-ui.run tmux-status
./tmux-ui.run tmux-save
./tmux-ui.run tmux-restore
\`\`\`

tmux-resurrect restores tmux sessions, panes, layouts, directories, and pane
contents. It cannot restore process memory after a reboot or crash.
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
ORIGINAL_PATH="\${PATH:-}"
TMUX_UI_PROFILE_UPDATED=""
TMUX_UI_UPGRADE_URL="\${TMUX_UI_UPGRADE_URL:-https://github.com/neatstudio/tmux-browser/releases/latest/download/release.run}"

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

path_contains_dir_in() {
  local search_path="$1"
  local directory="$2"

  case ":$search_path:" in
    *":$directory:"*) return 0 ;;
    *) return 1 ;;
  esac
}

path_contains_dir() {
  path_contains_dir_in "$PATH" "$1"
}

original_path_contains_dir() {
  path_contains_dir_in "$ORIGINAL_PATH" "$1"
}

ensure_user_bin_on_path() {
  local bin_dir="$1"
  local profile
  local path_line
  local grep_token
  local profiles=("$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile")

  TMUX_UI_PROFILE_UPDATED=""

  if original_path_contains_dir "$bin_dir"; then
    return
  fi

  if [[ "$bin_dir" == "$HOME/.local/bin" ]]; then
    path_line='export PATH="$HOME/.local/bin:$PATH"'
    grep_token='$HOME/.local/bin'
  else
    path_line="export PATH=\\"$bin_dir:\\$PATH\\""
    grep_token="$bin_dir"
  fi

  for profile in "\${profiles[@]}"; do
    if [[ -f "$profile" ]] && grep -F "$grep_token" "$profile" >/dev/null 2>&1; then
      TMUX_UI_PROFILE_UPDATED="$profile"
      return
    fi
  done

  for profile in "\${profiles[@]}"; do
    if [[ -f "$profile" ]]; then
      printf '\\n# Added by tmux-ui installer\\n%s\\n' "$path_line" >> "$profile"
      TMUX_UI_PROFILE_UPDATED="$profile"
      return
    fi
  done

  printf '# Added by tmux-ui installer\\n%s\\n' "$path_line" > "$HOME/.profile"
  TMUX_UI_PROFILE_UPDATED="$HOME/.profile"
}

prepare_cli_bin_dir() {
  local directory="$1"

  mkdir -p "$directory" 2>/dev/null || return 1
  [[ -d "$directory" && -w "$directory" ]]
}

same_file() {
  [[ -e "$1" && -e "$2" ]] || return 1

  if command -v realpath >/dev/null 2>&1; then
    [[ "$(realpath "$1")" == "$(realpath "$2")" ]]
    return
  fi

  [[ "$1" -ef "$2" ]]
}

choose_cli_bin_dir() {
  local candidate

  if [[ -n "\${TMUX_UI_USER_BIN:-}" ]]; then
    if prepare_cli_bin_dir "$TMUX_UI_USER_BIN"; then
      echo "$TMUX_UI_USER_BIN"
      return
    fi

    echo "Cannot write TMUX_UI_USER_BIN: $TMUX_UI_USER_BIN" >&2
    exit 1
  fi

  for candidate in "$HOME/.local/bin" "/usr/local/bin"; do
    if prepare_cli_bin_dir "$candidate"; then
      echo "$candidate"
      return
    fi
  done

  echo "Cannot install CLI into $HOME/.local/bin or /usr/local/bin." >&2
  echo "Create a writable bin directory and rerun with TMUX_UI_USER_BIN=/path/to/bin $0 install" >&2
  echo "Or link manually after install: sudo ln -s $APP_BIN_DIR/$CLI_NAME /usr/local/bin/$CLI_NAME" >&2
  exit 1
}

install_cli_entrypoint() {
  local link_path script_source_path

  USER_BIN_DIR="$(choose_cli_bin_dir)"
  link_path="$USER_BIN_DIR/$CLI_NAME"
  script_source_path="$0"

  mkdir -p "$APP_BIN_DIR"
  if ! same_file "$script_source_path" "$APP_BIN_DIR/$CLI_NAME"; then
    cp "$script_source_path" "$APP_BIN_DIR/$CLI_NAME"
  fi
  chmod +x "$APP_BIN_DIR/$CLI_NAME"

  if [[ -e "$link_path" && ! -L "$link_path" ]]; then
    echo "$link_path already exists and is not a symlink." >&2
    echo "Set TMUX_UI_CLI_NAME or TMUX_UI_USER_BIN to choose another CLI path." >&2
    exit 1
  fi

  ln -sfn "$APP_BIN_DIR/$CLI_NAME" "$link_path"
  ensure_user_bin_on_path "$USER_BIN_DIR"

  echo "Installed CLI: $USER_BIN_DIR/$CLI_NAME"
  echo "Run commands with: $CLI_NAME restart"

  if ! original_path_contains_dir "$USER_BIN_DIR"; then
    echo "PATH does not currently include $USER_BIN_DIR."
    if [[ -n "$TMUX_UI_PROFILE_UPDATED" ]]; then
      echo "Restart your shell or run: source \\"$TMUX_UI_PROFILE_UPDATED\\""
    else
      echo "Add it for this shell with: export PATH=\\"$USER_BIN_DIR:\\$PATH\\""
    fi
  fi
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
  NVM_INSTALL_VERSION="\${TMUX_UI_NVM_VERSION:-v0.40.4}"

  prepend_path_if_dir() {
    local directory="$1"
    [[ -d "$directory" ]] || return 0

    case ":$PATH:" in
      *":$directory:"*) ;;
      *) PATH="$directory:$PATH" ;;
    esac
  }

  prepend_path_if_dir "$HOME/.local/bin"
  prepend_path_if_dir "$HOME/.hermes/node/bin"
  prepend_path_if_dir "/opt/homebrew/bin"
  prepend_path_if_dir "/opt/homebrew/sbin"
  prepend_path_if_dir "/usr/local/bin"
  prepend_path_if_dir "/usr/local/sbin"

  local version_dir
  for version_dir in "$NVM_DIR"/versions/node/v"$node_version"*/bin; do
    prepend_path_if_dir "$version_dir"
  done

  export PATH

  install_nvm_if_missing() {
    if [[ -s "$NVM_DIR/nvm.sh" ]]; then
      return
    fi

    local install_url="https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_INSTALL_VERSION/install.sh"
    echo "Installing nvm $NVM_INSTALL_VERSION into $NVM_DIR"
    mkdir -p "$NVM_DIR"

    if command -v curl >/dev/null 2>&1; then
      PROFILE=/dev/null curl -fsSL "$install_url" | bash
      return
    fi

    if command -v wget >/dev/null 2>&1; then
      PROFILE=/dev/null wget -qO- "$install_url" | bash
      return
    fi

    echo "Missing curl or wget; cannot install nvm automatically." >&2
    exit 1
  }

  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    install_nvm_if_missing
  fi

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
    nvm alias default "$node_version" >/dev/null 2>&1 || true
    return
  fi

  echo "nvm installation failed; node/npm are still unavailable." >&2
  exit 1
}

run_privileged() {
  if [[ "\${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "Need root privileges to install: $*" >&2
  exit 1
}

install_system_packages() {
  if command -v brew >/dev/null 2>&1; then
    brew install "$@"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    run_privileged apt-get update
    run_privileged apt-get install -y "$@"
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    run_privileged dnf install -y "$@"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    run_privileged yum install -y "$@"
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    run_privileged apk add --no-cache "$@"
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    run_privileged pacman -Sy --noconfirm "$@"
    return
  fi

  echo "No supported package manager found for installing: $*" >&2
  exit 1
}

ensure_tmux_available() {
  if command -v tmux >/dev/null 2>&1; then
    return
  fi

  echo "tmux not found; installing tmux."
  install_system_packages tmux
}

show_help() {
  cat <<'HELP'
tmux-ui run release

Commands:
  help         Show this help
  install      Extract and install production npm dependencies
  start        Extract and start the server, installing deps if missing
  restart      Extract, install if needed, and restart inside a tmux-ui tmux session
  upgrade      Download/install latest tmux-ui run file
  stop         Stop the tmux-ui service started by restart
  service-install  Install systemd/launchd service
  service-start    Start systemd/launchd service
  service-restart  Restart systemd/launchd service
  service-status   Show systemd/launchd service status
  service-stop     Stop systemd/launchd service
  service-uninstall Stop and remove systemd/launchd service
  tmux-install  Install tmux-resurrect and tmux-continuum
  tmux-status   Show tmux resurrection status
  tmux-save     Save tmux sessions now
  tmux-restore  Restore saved tmux sessions
  tmux-update   Update tmux resurrection plugins
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
  TMUX_UI_TMUX_AUTO_RESTORE set to 0 to disable automatic restore when tmux is empty
  TMUX_UI_UPGRADE_URL latest release.run URL for upgrade
  HOST              Bind host for start. Defaults to the first 100.* Tailscale IP, then 127.0.0.1. 0.0.0.0 is rejected.
  PORT              Bind port for start, default: 3000

No command defaults to help. Use "start" or "restart" explicitly to run the server.
HELP
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

run_tmux_resurrect() {
  extract_payload

  if [[ ! -x "$APP_HOME/tmux-resurrect.sh" ]]; then
    echo "tmux resurrection helper not found in $APP_HOME" >&2
    exit 1
  fi

  "$APP_HOME/tmux-resurrect.sh" "$@"
}

install_tmux_resurrection() {
  run_tmux_resurrect install "$@"
}

restore_tmux_if_empty() {
  run_tmux_resurrect restore-if-empty
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
Environment=PATH=$HOME/.local/bin:$HOME/.hermes/node/bin:$NVM_DIR/versions/node/v22/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
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
    <key>PATH</key>
    <string>$HOME/.local/bin:$HOME/.hermes/node/bin:$NVM_DIR/versions/node/v22/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin</string>
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

wait_for_systemd_active() {
  local attempt

  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if systemctl is-active --quiet "$SERVICE_NAME.service" && wait_for_http_health_once; then
      systemctl status "$SERVICE_NAME.service" --no-pager
      return
    fi
    sleep 1
  done

  systemctl status "$SERVICE_NAME.service" --no-pager || true
  journalctl -u "$SERVICE_NAME.service" -n 80 --no-pager || true
  exit 1
}

wait_for_launchd_running() {
  local attempt

  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if is_launchd_running && wait_for_http_health_once; then
      print_launchd_status
      return
    fi
    sleep 1
  done

  print_launchd_status || true
  tail -n 80 "$APP_HOME/tmux-ui.log" 2>/dev/null || true
  tail -n 80 "$APP_HOME/tmux-ui.err.log" 2>/dev/null || true
  exit 1
}

wait_for_http_health_once() {
  local host port
  host="\${HOST:-}"
  port="\${PORT:-3000}"

  [[ "$host" == "0.0.0.0" ]] && host="127.0.0.1"
  [[ -n "$host" ]] || host="127.0.0.1"

  if command -v curl >/dev/null 2>&1; then
    curl -fsS "http://$host:$port/api/health" >/dev/null 2>&1
    return
  fi

  return 0
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
  wait_for_launchd_running
}

start_launchd_service() {
  require_command launchctl
  bootstrap_launchd_service_if_needed
  launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL"
  wait_for_launchd_running
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

is_launchd_running() {
  local output
  output="$(launchctl print "gui/$(id -u)/$LAUNCHD_LABEL" 2>/dev/null || true)"

  [[ "$output" == *"state = running"* ]] && [[ "$output" == *"pid ="* ]]
}

download_upgrade_run() {
  local upgrade_file
  upgrade_file="$(mktemp "\${TMPDIR:-/tmp}/tmux-ui-upgrade.XXXXXX.run")"

  echo "Downloading tmux-ui upgrade from $TMUX_UI_UPGRADE_URL" >&2
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$TMUX_UI_UPGRADE_URL" -o "$upgrade_file"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$upgrade_file" "$TMUX_UI_UPGRADE_URL"
  else
    echo "Missing curl or wget; cannot download upgrade." >&2
    exit 1
  fi

  chmod +x "$upgrade_file"
  echo "$upgrade_file"
}

upgrade_server() {
  local upgrade_file
  upgrade_file="$(download_upgrade_run)"

  if is_macos && [[ -f "$LAUNCHD_PLIST_PATH" ]]; then
    "$upgrade_file" service-install
    rm -f "$upgrade_file"
    return
  fi

  if command -v systemctl >/dev/null 2>&1 && [[ -f "$SYSTEMD_UNIT_PATH" ]]; then
    "$upgrade_file" service-install
    rm -f "$upgrade_file"
    return
  fi

  "$upgrade_file" install
  "$upgrade_file" restart
  rm -f "$upgrade_file"
}

install_service() {
  if is_macos; then
    install_launchd_service
    return
  fi

  load_node_runtime
  require_command node
  require_command npm
  ensure_tmux_available
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
  wait_for_systemd_active
}

start_service() {
  if is_macos; then
    start_launchd_service
    return
  fi

  require_command systemctl
  systemctl start "$SERVICE_NAME.service"
  wait_for_systemd_active
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
  tmux respawn-pane -k -t "$APP_SESSION" -c "$APP_HOME" "HOST='\${HOST:-}' PORT='\${PORT:-3000}' ./start.sh"
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
  ensure_tmux_available
  extract_payload

  if [[ ! -d "$APP_HOME/node_modules" ]]; then
    "$APP_HOME/install.sh"
  fi

  stop_server
  restore_tmux_if_empty || true
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
    ensure_tmux_available
    extract_payload
    install_cli_entrypoint
    "$APP_HOME/install.sh"
    ;;
  start)
    load_node_runtime
    require_command node
    require_command npm
    ensure_tmux_available
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
  upgrade)
    upgrade_server
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
  tmux-install)
    install_tmux_resurrection
    ;;
  tmux-update)
    run_tmux_resurrect install --update
    ;;
  tmux-status)
    run_tmux_resurrect status
    ;;
  tmux-save)
    run_tmux_resurrect save
    ;;
  tmux-restore)
    run_tmux_resurrect restore
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
cleanupOldRunFiles();

const stageDir = mkdtempSync(join(tmpdir(), `${projectName}-release-`));
const payloadDir = join(stageDir, "payload");
const payloadArchive = join(stageDir, "payload.tar.gz");

try {
  mkdirSync(payloadDir, { recursive: true });
  cpSync(join(rootDir, "dist"), join(payloadDir, "dist"), { recursive: true });
  cpSync(join(rootDir, "package.json"), join(payloadDir, "package.json"));
  cpSync(join(rootDir, "package-lock.json"), join(payloadDir, "package-lock.json"));
  if (!existsSync(tmuxResurrectSource)) {
    throw new Error(`Missing tmux resurrection helper: ${tmuxResurrectSource}`);
  }
  cpSync(tmuxResurrectSource, join(payloadDir, "tmux-resurrect.sh"));
  stripMacExtendedAttributes(payloadDir);

  writeExecutable(join(payloadDir, "install.sh"), createInstallScript());
  writeExecutable(join(payloadDir, "start.sh"), createStartScript());
  chmodSync(join(payloadDir, "tmux-resurrect.sh"), 0o755);
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
