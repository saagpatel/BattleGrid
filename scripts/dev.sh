#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVER_PID=""
CLIENT_PID=""
_DEV_CLEANED=0

cleanup() {
  local exit_code=$?
  if [[ "$_DEV_CLEANED" -eq 1 ]]; then
    return
  fi
  _DEV_CLEANED=1

  set +e
  if [[ -n "$CLIENT_PID" ]] && kill -0 "$CLIENT_PID" 2>/dev/null; then
    kill "$CLIENT_PID"
  fi
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
  fi
  wait "$CLIENT_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

if [[ ! -d "$ROOT_DIR/client/node_modules" ]]; then
  echo "client/node_modules missing; installing client dependencies..."
  "$ROOT_DIR/scripts/pnpm-safe.sh" --prefix client install
fi

make build-wasm

"$ROOT_DIR/scripts/cargo-safe.sh" run -p battleground-server &
SERVER_PID=$!

# Uses a safe wrapper so client tooling still works when the repo path contains ':'.
"$ROOT_DIR/scripts/client-safe.sh" vite &
CLIENT_PID=$!

echo "Server: http://localhost:3001  |  Client: http://localhost:5173"
wait
