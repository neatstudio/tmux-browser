#!/usr/bin/env bash
set -euo pipefail

endpoint="${TMUX_UI_HOOK_URL:-http://127.0.0.1:${PORT:-3000}/api/hooks/events}"
token="${TMUX_UI_HOOK_TOKEN:-}"
source="${TMUX_UI_HOOK_SOURCE:-custom}"
event_type="${TMUX_UI_HOOK_EVENT_TYPE:-event}"
status="${TMUX_UI_HOOK_STATUS:-info}"
severity="${TMUX_UI_HOOK_SEVERITY:-info}"
title="${TMUX_UI_HOOK_TITLE:-}"
task_id="${TMUX_UI_HOOK_TASK_ID:-}"
session_name="${TMUX_UI_SESSION_NAME:-${TMUX_UI_SESSION:-}}"
body=""

if [[ -z "$session_name" && -n "${TMUX:-}" ]] && command -v tmux >/dev/null 2>&1; then
  session_name="$(tmux display-message -p '#S' 2>/dev/null || true)"
fi

if [[ -z "$session_name" ]]; then
  echo "TMUX_UI_SESSION_NAME or TMUX_UI_SESSION is required outside tmux" >&2
  exit 2
fi

if [[ -t 0 ]]; then
  body="${TMUX_UI_HOOK_BODY:-}"
else
  body="$(cat)"
fi

if [[ -z "$title" ]]; then
  title="$source $event_type"
fi

json_escape() {
  node -e 'let input=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", c => input += c); process.stdin.on("end", () => process.stdout.write(JSON.stringify(input)));'
}

payload="$(
  {
    printf '{'
    printf '"source":%s,' "$(printf '%s' "$source" | json_escape)"
    printf '"sessionName":%s,' "$(printf '%s' "$session_name" | json_escape)"
    printf '"cwd":%s,' "$(printf '%s' "${PWD:-}" | json_escape)"
    printf '"eventType":%s,' "$(printf '%s' "$event_type" | json_escape)"
    printf '"status":%s,' "$(printf '%s' "$status" | json_escape)"
    printf '"severity":%s,' "$(printf '%s' "$severity" | json_escape)"
    printf '"title":%s,' "$(printf '%s' "$title" | json_escape)"
    printf '"body":%s,' "$(printf '%s' "$body" | json_escape)"
    printf '"taskId":%s' "$(printf '%s' "$task_id" | json_escape)"
    printf '}'
  }
)"

curl_args=(-fsS -X POST "$endpoint" -H "Content-Type: application/json")

if [[ -n "$token" ]]; then
  curl_args+=(-H "Authorization: Bearer $token")
fi

curl "${curl_args[@]}" --data-binary "$payload" >/dev/null
