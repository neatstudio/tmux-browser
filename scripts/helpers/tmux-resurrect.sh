#!/usr/bin/env bash
set -euo pipefail

PLUGINS_DIR="${HOME}/.tmux/plugins"
TPM_DIR="${PLUGINS_DIR}/tpm"
RESURRECT_DIR="${PLUGINS_DIR}/tmux-resurrect"
CONTINUUM_DIR="${PLUGINS_DIR}/tmux-continuum"
TMUX_CONF="${HOME}/.tmux.conf"
DRY_RUN=0
UPDATE=0
BOOTSTRAP_SESSION=""

usage() {
  cat <<'USAGE'
Install and configure tmux session restoration.

Usage:
  ./tmux-resurrect.sh [install] [--dry-run] [--update]
  ./tmux-resurrect.sh restore [--dry-run]
  ./tmux-resurrect.sh restore-if-empty [--dry-run]
  ./tmux-resurrect.sh save [--dry-run]
  ./tmux-resurrect.sh status
  ./tmux-resurrect.sh --help

What this installs:
  - tmux plugin manager: ~/.tmux/plugins/tpm
  - tmux-resurrect
  - tmux-continuum

Install behavior:
  - default: install only missing pieces and skip already installed plugins
  - --update: update TPM and installed plugins explicitly

What this configures:
  - automatic save every 15 minutes
  - automatic restore when tmux starts
  - manual save:    Ctrl-b then Ctrl-s
  - manual restore: Ctrl-b then Ctrl-r

After a reboot:
  1. Open a terminal.
  2. Run: ./tmux-resurrect.sh restore
  3. Run: tmux attach

Important limitation:
  tmux can restore layouts, panes, directories, and restart some commands.
  It cannot restore the memory state of a process after a machine reboot.
USAGE
}

resurrect_script() {
  local name="$1"
  printf '%s/scripts/%s.sh\n' "${RESURRECT_DIR}" "${name}"
}

require_resurrect_script() {
  local script="$1"

  if [[ ! -x "${script}" ]]; then
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      printf '[dry-run] would require executable tmux-resurrect script: %s\n' "${script}"
      return
    fi

    printf 'error: tmux-resurrect script not found or not executable: %s\n' "${script}" >&2
    printf 'run this first: %s install\n' "$0" >&2
    exit 1
  fi
}

run() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] %q' "$1"
    shift
    if [[ $# -gt 0 ]]; then
      printf ' %q' "$@"
    fi
    printf '\n'
  else
    "$@"
  fi
}

require_command() {
  local name="$1"

  if ! command -v "${name}" >/dev/null 2>&1; then
    printf 'error: required command not found: %s\n' "${name}" >&2
    exit 1
  fi
}

backup_tmux_conf() {
  if [[ ! -f "${TMUX_CONF}" ]]; then
    return
  fi

  local backup="${TMUX_CONF}.bak.$(date +%Y%m%d-%H%M%S)"
  printf 'Backing up existing %s to %s\n' "${TMUX_CONF}" "${backup}"
  run cp "${TMUX_CONF}" "${backup}"
}

generated_tmux_conf() {
  local marker_begin="# >>> tmux-resurrect-continuum >>>"
  local marker_end="# <<< tmux-resurrect-continuum <<<"
  local tmp_base

  tmp_base="$(mktemp)"

  if [[ -f "${TMUX_CONF}" ]]; then
    sed "/${marker_begin}/,/${marker_end}/d" "${TMUX_CONF}" |
      awk 'NF { for (i = 1; i <= blank; i++) print ""; blank = 0; print; next } { blank++ }' >"${tmp_base}"
  fi

  if [[ -s "${tmp_base}" ]]; then
    cat "${tmp_base}"
    printf '\n\n'
  fi

  rm -f "${tmp_base}"

  cat <<'TMUXCONF'
# >>> tmux-resurrect-continuum >>>
# Plugin manager must stay near the end of this file.
set-environment -g TMUX_PLUGIN_MANAGER_PATH '~/.tmux/plugins/'
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'

# Save tmux state every 15 minutes and restore it when tmux starts.
set -g @continuum-save-interval '15'
set -g @continuum-restore 'on'

# Capture pane contents in saved sessions. Disable this if saves become too large.
set -g @resurrect-capture-pane-contents 'on'

# Start TPM. Keep this line at the bottom of the plugin block.
run '~/.tmux/plugins/tpm/tpm'
# <<< tmux-resurrect-continuum <<<
TMUXCONF
}

install_tpm() {
  if [[ -d "${TPM_DIR}/.git" ]]; then
    if [[ "${UPDATE}" -eq 1 ]]; then
      printf 'Updating TPM at %s\n' "${TPM_DIR}"
      run git -C "${TPM_DIR}" pull --ff-only
    else
      printf 'TPM already installed at %s; skipping.\n' "${TPM_DIR}"
    fi
    return
  fi

  if [[ -e "${TPM_DIR}" ]]; then
    printf 'error: %s exists but is not a git checkout; move it aside and rerun install.\n' "${TPM_DIR}" >&2
    exit 1
  fi

  printf 'Installing TPM to %s\n' "${TPM_DIR}"
  run mkdir -p "$(dirname "${TPM_DIR}")"
  run git clone https://github.com/tmux-plugins/tpm "${TPM_DIR}"
}

write_tmux_conf_block() {
  local tmp_file

  tmp_file="$(mktemp)"
  generated_tmux_conf >"${tmp_file}"

  if [[ -f "${TMUX_CONF}" ]] && cmp -s "${tmp_file}" "${TMUX_CONF}"; then
    printf 'tmux restoration config already present; skipping config write.\n'
    rm -f "${tmp_file}"
    return
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] would backup and write tmux restoration config to %s\n' "${TMUX_CONF}"
    printf '[dry-run] would write generated config to %s\n' "${TMUX_CONF}"
    rm -f "${tmp_file}"
  else
    backup_tmux_conf
    printf 'Writing tmux restoration config to %s\n' "${TMUX_CONF}"
    mv "${tmp_file}" "${TMUX_CONF}"
  fi
}

required_plugins_installed() {
  [[ -x "$(resurrect_script restore)" && -d "${CONTINUUM_DIR}/.git" ]]
}

start_tmux_for_tpm() {
  BOOTSTRAP_SESSION=""

  if tmux list-sessions >/dev/null 2>&1; then
    return
  fi

  BOOTSTRAP_SESSION="tpm-bootstrap-$$"
  printf 'Starting temporary tmux session %s for TPM.\n' "${BOOTSTRAP_SESSION}"
  tmux new-session -d -s "${BOOTSTRAP_SESSION}"
}

stop_tmux_bootstrap() {
  if [[ -z "${BOOTSTRAP_SESSION}" ]]; then
    return
  fi

  printf 'Removing temporary tmux session %s.\n' "${BOOTSTRAP_SESSION}"
  tmux kill-session -t "${BOOTSTRAP_SESSION}" >/dev/null 2>&1 || true
  BOOTSTRAP_SESSION=""
}

prepare_tmux_for_tpm() {
  start_tmux_for_tpm
  printf 'Preparing tmux server environment for TPM.\n'
  tmux set-environment -g TMUX_PLUGIN_MANAGER_PATH "${PLUGINS_DIR}/"
  tmux source-file "${TMUX_CONF}"
}

install_plugins() {
  local installer="${TPM_DIR}/bin/install_plugins"
  local install_status=0

  if required_plugins_installed; then
    printf 'Required tmux plugins already installed; skipping plugin install.\n'
    return
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] would install tmux plugins using %s\n' "${installer}"
    return
  fi

  if [[ ! -x "${installer}" ]]; then
    printf 'error: TPM installer not found or not executable: %s\n' "${installer}" >&2
    exit 1
  fi

  prepare_tmux_for_tpm

  printf 'Installing tmux plugins from %s\n' "${TMUX_CONF}"
  if "${installer}"; then
    install_status=0
  else
    install_status=$?
  fi

  stop_tmux_bootstrap

  return "${install_status}"
}

update_plugins() {
  local updater="${TPM_DIR}/bin/update_plugins"
  local update_status=0

  if [[ "${UPDATE}" -eq 0 ]]; then
    return
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    printf '[dry-run] would update tmux plugins using %s all\n' "${updater}"
    return
  fi

  if [[ ! -x "${updater}" ]]; then
    printf 'error: TPM updater not found or not executable: %s\n' "${updater}" >&2
    exit 1
  fi

  prepare_tmux_for_tpm

  printf 'Updating tmux plugins.\n'
  if "${updater}" all; then
    update_status=0
  else
    update_status=$?
  fi

  stop_tmux_bootstrap

  return "${update_status}"
}

ensure_tmux_server() {
  if tmux list-sessions >/dev/null 2>&1; then
    return
  fi

  printf 'Starting detached tmux server for restore.\n'
  run tmux new-session -d -s restore-bootstrap
}

save_sessions() {
  local script
  script="$(resurrect_script save)"

  require_command tmux
  require_resurrect_script "${script}"

  if ! tmux list-sessions >/dev/null 2>&1; then
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      printf '[dry-run] would require a running tmux server before saving sessions.\n'
      return
    fi

    printf 'error: no tmux server is running; start tmux before saving sessions.\n' >&2
    exit 1
  fi

  printf 'Saving current tmux state.\n'
  run "${script}"
}

restore_sessions() {
  local script
  script="$(resurrect_script restore)"

  require_command tmux
  require_resurrect_script "${script}"
  ensure_tmux_server

  printf 'Restoring tmux state.\n'
  run "${script}"

  cat <<'RESTORE'

Restore command finished.

Attach to tmux:
  tmux attach

If you created many sessions before reboot, check them with:
  tmux list-sessions
RESTORE
}

restore_sessions_if_empty() {
  require_command tmux

  if tmux list-sessions >/dev/null 2>&1; then
    printf 'tmux already has sessions; skipping automatic restore.\n'
    return
  fi

  if [[ ! -x "$(resurrect_script restore)" ]]; then
    printf 'tmux-resurrect is not installed; skipping automatic restore.\n'
    return
  fi

  restore_sessions
}

status() {
  local save_dir="${HOME}/.tmux/resurrect"

  printf 'tmux: '
  if command -v tmux >/dev/null 2>&1; then
    tmux -V
  else
    printf 'not installed\n'
  fi

  printf 'TPM: %s\n' "${TPM_DIR}"
  if [[ -d "${TPM_DIR}/.git" ]]; then
    printf '  installed\n'
  else
    printf '  not installed\n'
  fi

  printf 'tmux-resurrect: %s\n' "${RESURRECT_DIR}"
  if [[ -x "$(resurrect_script restore)" ]]; then
    printf '  installed\n'
  else
    printf '  not installed\n'
  fi

  printf 'tmux-continuum: %s\n' "${CONTINUUM_DIR}"
  if [[ -d "${CONTINUUM_DIR}" ]]; then
    printf '  installed\n'
  else
    printf '  not installed\n'
  fi

  printf 'tmux sessions:\n'
  if command -v tmux >/dev/null 2>&1 && tmux list-sessions >/dev/null 2>&1; then
    tmux list-sessions
  else
    printf '  none\n'
  fi

  printf 'latest saved state:\n'
  if [[ -d "${save_dir}" ]]; then
    find "${save_dir}" -maxdepth 1 -type f -name 'tmux_resurrect_*' -print | sort | tail -n 1 | sed 's/^/  /'
  else
    printf '  none\n'
  fi
}

reload_tmux_if_running() {
  if ! pgrep -x tmux >/dev/null 2>&1; then
    printf 'tmux is not currently running; config will load on next tmux start.\n'
    return
  fi

  printf 'Reloading tmux config in running tmux server.\n'
  run tmux source-file "${TMUX_CONF}"
}

print_next_steps() {
  cat <<'NEXT'

Done.

Try it now:
  tmux new -s restore-test
  mkdir -p ~/tmux-restore-test
  cd ~/tmux-restore-test
  echo "hello from tmux" > marker.txt

Save manually:
  Press Ctrl-b then Ctrl-s

Restore manually after reboot or after starting tmux:
  Press Ctrl-b then Ctrl-r

Typical reboot recovery:
  1. Start Terminal.
  2. Run: tmux
  3. Wait a moment for tmux-continuum automatic restore.
  4. If the session is not restored, press Ctrl-b then Ctrl-r.

Remember:
  This restores tmux layout and restarts some commands. It does not restore
  a process that was halfway through work unless that process supports its own
  checkpoint/resume behavior.
NEXT
}

main() {
  local command="install"

  if [[ $# -gt 0 && "$1" != --* ]]; then
    command="$1"
    shift
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN=1
        ;;
      --update)
        UPDATE=1
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        printf 'error: unknown argument: %s\n\n' "$1" >&2
        usage >&2
        exit 1
        ;;
    esac
    shift
  done

  require_command tmux

  case "${command}" in
    install)
      require_command git
      require_command sed
      require_command mktemp

      printf 'tmux version: '
      tmux -V

      install_tpm
      write_tmux_conf_block
      install_plugins
      update_plugins
      reload_tmux_if_running
      print_next_steps
      ;;
    restore)
      restore_sessions
      ;;
    restore-if-empty)
      restore_sessions_if_empty
      ;;
    save)
      save_sessions
      ;;
    status)
      status
      ;;
    *)
      printf 'error: unknown command: %s\n\n' "${command}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
