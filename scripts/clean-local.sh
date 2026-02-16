#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Full local cleanup for reproducible local artifacts and caches.
rm -rf \
  target \
  client/node_modules \
  client/dist \
  client/src/wasm/pkg \
  client/.vite \
  client/.cache \
  client/.turbo \
  client/node_modules/.vite \
  client/node_modules/.cache

# Clean up temporary lean-dev cache directories created under /tmp.
rm -rf "${TMPDIR:-/tmp}"/battlegrid-lean.*

echo "Removed local reproducible artifacts and caches."
