#!/bin/bash
set -euo pipefail

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    docker compose logs --tail=200 || true
  fi
  docker compose down || true
  exit "$exit_code"
}

trap cleanup EXIT

docker compose up --build -d

until [[ "$(docker inspect -f '{{.State.Health.Status}}' battlegrid-battlegrid-1 2>/dev/null || true)" == "healthy" ]]; do
  sleep 1
done

PLAYWRIGHT_BASE_URL=http://localhost:8080 \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
"$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/client-safe.sh" playwright test --config=playwright.config.ts
