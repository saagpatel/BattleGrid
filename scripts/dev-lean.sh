#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LEAN_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/battlegrid-lean.XXXXXX")"
LEAN_CARGO_TARGET_DIR="$LEAN_TMP_DIR/cargo-target"
LEAN_VITE_CACHE_DIR="$LEAN_TMP_DIR/vite-cache"

SERVER_PID=""
CLIENT_PID=""
_LEAN_CLEANED=0

cleanup() {
  local exit_code=$?
  if [[ "$_LEAN_CLEANED" -eq 1 ]]; then
    return
  fi
  _LEAN_CLEANED=1

  set +e
  if [[ -n "$CLIENT_PID" ]] && kill -0 "$CLIENT_PID" 2>/dev/null; then
    kill "$CLIENT_PID"
  fi
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
  fi
  wait "$CLIENT_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true

  rm -rf "$LEAN_TMP_DIR"
  "$ROOT_DIR/scripts/clean-heavy.sh" >/dev/null 2>&1 || true

  echo "Lean dev cleanup completed."
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

if [[ ! -d "$ROOT_DIR/client/node_modules" ]]; then
  echo "client/node_modules missing; installing client dependencies..."
  pnpm --prefix "$ROOT_DIR/client" install
fi

echo "Lean cache dir: $LEAN_TMP_DIR"

CARGO_TARGET_DIR="$LEAN_CARGO_TARGET_DIR" make build-wasm

CARGO_TARGET_DIR="$LEAN_CARGO_TARGET_DIR" cargo run -p battleground-server &
SERVER_PID=$!

# Uses pnpm exec to avoid PATH issues when the repo path contains ':'.
VITE_CACHE_DIR="$LEAN_VITE_CACHE_DIR" pnpm --prefix "$ROOT_DIR/client" exec vite &
CLIENT_PID=$!

echo "Server: http://localhost:3001  |  Client: http://localhost:5173"
wait
