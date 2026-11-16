#!/usr/bin/env bash
# Start the game server, and on WSL pop the game open in the Windows browser.
#
#   ./run.sh                 # 127.0.0.1:8080, closes when the last tab leaves
#   PORT=9000 ./run.sh       # another port
#   HOST=0.0.0.0 ./run.sh    # expose the game on the LAN
#   ./run.sh --no-autoclose  # extra flags are forwarded to server.py
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
IDLE="${IDLE:-120}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"

die() { printf '[run] %s\n' "$*" >&2; exit 1; }

# --host/--port must be ours to read, or the URL we probe and open would point
# at the wrong place. Everything else is forwarded to server.py untouched.
EXTRA_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) exec "$PYTHON" "$ROOT/server.py" "$@" ;;
    --host)    [[ $# -ge 2 ]] || die "--host needs a value"; HOST="$2"; shift 2 ;;
    --host=*)  HOST="${1#*=}"; shift ;;
    --port)    [[ $# -ge 2 ]] || die "--port needs a value"; PORT="$2"; shift 2 ;;
    --port=*)  PORT="${1#*=}"; shift ;;
    *)         EXTRA_ARGS+=("$1"); shift ;;
  esac
done

# HOST and PORT end up in a URL and in a PowerShell command line, so keep them
# boring. Local development never needs shell metacharacters here.
[[ "$HOST" =~ ^[A-Za-z0-9._:-]+$ ]] || die "HOST contains unsupported characters: $HOST"
[[ "$PORT" =~ ^[0-9]+$ ]] || die "PORT must be a number, got: $PORT"
(( PORT >= 1 && PORT <= 65535 )) || die "PORT out of range: $PORT"

command -v "$PYTHON" >/dev/null 2>&1 || die "$PYTHON not found; install python3 first."

case "$HOST" in
  0.0.0.0|::|"") URL_HOST="127.0.0.1" ;;  # wildcard binds are not browser addresses
  *)             URL_HOST="$HOST" ;;
esac
URL="http://${URL_HOST}:${PORT}/"

"$PYTHON" "$ROOT/server.py" --host "$HOST" --port "$PORT" --idle "$IDLE" "${EXTRA_ARGS[@]}" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

probe() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null --max-time 1 "$URL" 2>/dev/null
  else
    (exec 3<>"/dev/tcp/${URL_HOST}/${PORT}") 2>/dev/null
  fi
}

open_browser() {
  # On WSL the Linux "default browser" is a fiction; hand the URL to Windows.
  if grep -qi microsoft /proc/version 2>/dev/null && command -v powershell.exe >/dev/null 2>&1; then
    (cd /mnt/c 2>/dev/null || cd /; powershell.exe -NoProfile -Command "Start-Process '$URL'") >/dev/null 2>&1 && return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 && return 0
  fi
  printf '[run] open this yourself: %s\n' "$URL"
}

# Give the socket a moment; opening the browser first would just show an error.
for _ in $(seq 1 50); do
  probe && break
  kill -0 "$SERVER_PID" 2>/dev/null || die "server exited during startup (see the message above)."
  sleep 0.2
done

if [[ "$OPEN_BROWSER" != "0" ]]; then
  open_browser
fi

printf '[run] %s — Ctrl+C to stop.\n' "$URL"
wait "$SERVER_PID" || true
