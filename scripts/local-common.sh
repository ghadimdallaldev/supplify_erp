#!/usr/bin/env bash
# Shared helpers for scripts/run-local.sh (local Docker stack only).
set -euo pipefail

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

# wait_healthy CONTAINER_NAME [MAX_ATTEMPTS=60] [SLEEP_SECS=3]
wait_healthy() {
  local container="$1"
  local max="${2:-60}"
  local sleep_sec="${3:-3}"
  echo -n "Waiting for ${container} to be healthy"
  for _ in $(seq 1 "$max"); do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "")
    if [ "$status" = "healthy" ]; then
      echo " ✓"
      return 0
    fi
    echo -n "."
    sleep "$sleep_sec"
  done
  echo " TIMEOUT"
  echo "--- Last 20 log lines for ${container} ---"
  docker logs "$container" --tail=20 2>&1 || true
  return 1
}
