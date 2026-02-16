#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Heavy build artifacts only; keeps dependency caches like client/node_modules.
rm -rf \
  target \
  client/dist \
  client/src/wasm/pkg \
  client/.vite \
  client/.cache \
  client/.turbo \
  client/node_modules/.vite \
  client/node_modules/.cache

echo "Removed heavy build artifacts."
