#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$ROOT_DIR"
TMP_LINK_DIR=""

cleanup() {
  if [[ -n "$TMP_LINK_DIR" && -d "$TMP_LINK_DIR" ]]; then
    rm -rf "$TMP_LINK_DIR"
  fi
}
trap cleanup EXIT INT TERM

if [[ "$ROOT_DIR" == *:* ]]; then
  TMP_LINK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/battlegrid-cargo-link.XXXXXX")"
  ln -s "$ROOT_DIR" "$TMP_LINK_DIR/repo"
  WORK_DIR="$TMP_LINK_DIR/repo"
fi

cd "$WORK_DIR"

if [[ -n "${CARGO_TARGET_DIR:-}" && "${CARGO_TARGET_DIR}" != *:* ]]; then
  export CARGO_TARGET_DIR
elif [[ "$ROOT_DIR" == *:* ]]; then
  export CARGO_TARGET_DIR="${TMPDIR:-/tmp}/battlegrid-cargo-target"
fi

exec cargo "$@"
