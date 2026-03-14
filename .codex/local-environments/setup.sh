#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "Preparing BattleGrid local environment..."

command -v cargo >/dev/null || {
  echo "cargo is required but not installed."
  exit 1
}

command -v pnpm >/dev/null || {
  echo "pnpm is required but not installed."
  exit 1
}

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "Installing wasm-pack..."
  cargo install wasm-pack
fi

pnpm --prefix client install
make build-wasm

echo "Environment ready."
