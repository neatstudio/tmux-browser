#!/usr/bin/env sh
set -eu

DEFAULT_INSTALL_URL="https://github.com/neatstudio/tmux-browser/releases/latest/download/release.run"
INSTALL_URL="${TMUX_UI_INSTALL_URL:-${TMUX_UI_UPGRADE_URL:-$DEFAULT_INSTALL_URL}}"
KEEP_RUN_FILE=0
RUN_MODE="default"

die() {
  printf 'tmux-ui install: %s\n' "$*" >&2
  exit 1
}

show_help() {
  cat <<'EOF'
tmux-ui installer

Downloads the latest GitHub Release run file and executes it.

Usage:
  curl -fsSL https://github.com/neatstudio/tmux-browser/releases/latest/download/install.sh | sh
  curl -fsSL https://github.com/neatstudio/tmux-browser/releases/latest/download/install.sh | sh -s -- [options]
  sh install.sh [options]

Options:
  --service, --service-install  Install/update as a systemd or launchd service
  --install-only, --no-start     Install/update files without starting tmux-ui
  --restart                     Install/update and restart; this is the default
  --start                       Install/update and start
  --upgrade-url URL             Download run file from URL instead of latest release
  --install-url URL             Alias for --upgrade-url
  --keep                        Keep the downloaded run file and print its path
  -h, --help                    Show this help

Pass-through:
  Use "--" before run-file arguments to call the downloaded run file directly:
    sh install.sh -- service-status

Default run-file command:
  install restart
EOF
}

download_run_file() {
  if command -v mktemp >/dev/null 2>&1; then
    run_file="$(mktemp "${TMPDIR:-/tmp}/tmux-ui-install.XXXXXX.run")"
  else
    run_file="${TMPDIR:-/tmp}/tmux-ui-install.$$.run"
    : > "$run_file"
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fL "$INSTALL_URL" -o "$run_file"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$run_file" "$INSTALL_URL"
  else
    die "missing curl or wget; cannot download $INSTALL_URL"
  fi

  chmod +x "$run_file"
}

cleanup() {
  if [ "${KEEP_RUN_FILE:-0}" != "1" ] && [ -n "${run_file:-}" ]; then
    rm -f "$run_file"
  fi
}

trap cleanup EXIT HUP INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      show_help
      exit 0
      ;;
    --service|--service-install)
      RUN_MODE="service"
      shift
      ;;
    --install-only|--no-start)
      RUN_MODE="install"
      shift
      ;;
    --restart)
      RUN_MODE="restart"
      shift
      ;;
    --start)
      RUN_MODE="start"
      shift
      ;;
    --upgrade-url|--install-url)
      option_name="$1"
      shift
      [ "$#" -gt 0 ] || die "$option_name requires a URL"
      INSTALL_URL="$1"
      shift
      ;;
    --keep)
      KEEP_RUN_FILE=1
      shift
      ;;
    --)
      shift
      RUN_MODE="custom"
      break
      ;;
    -*)
      die "unknown option: $1"
      ;;
    *)
      RUN_MODE="custom"
      break
      ;;
  esac
done

case "$RUN_MODE" in
  default|restart)
    set -- install restart
    ;;
  service)
    set -- service-install
    ;;
  install)
    set -- install
    ;;
  start)
    set -- install start
    ;;
  custom)
    [ "$#" -gt 0 ] || die "pass-through mode requires a run-file command"
    ;;
  *)
    die "invalid run mode: $RUN_MODE"
    ;;
esac

printf 'Downloading tmux-ui from %s\n' "$INSTALL_URL"
download_run_file

if [ "$KEEP_RUN_FILE" = "1" ]; then
  printf 'Downloaded run file: %s\n' "$run_file"
fi

"$run_file" "$@"
