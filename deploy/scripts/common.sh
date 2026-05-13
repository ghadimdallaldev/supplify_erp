#!/usr/bin/env bash
# Shared paths for day-2 ops scripts (logs, backup, status).
set -euo pipefail

REPO_ROOT="${SUPPLIFY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SUPPLIFY_ENV="${SUPPLIFY_ENV:-prod}"

case "$SUPPLIFY_ENV" in
  dev|staging|prod) ;;
  *)
    echo "Invalid SUPPLIFY_ENV: $SUPPLIFY_ENV (use dev|staging|prod)"
    exit 1
    ;;
esac

ENV_FILE="$REPO_ROOT/deploy/env/.env.$SUPPLIFY_ENV"
COMPOSE_FILE="$REPO_ROOT/deploy/docker-compose.$SUPPLIFY_ENV.yml"

case "$SUPPLIFY_ENV" in
  prod) POSTGRES_CONTAINER="supplify-postgres" ;;
  dev) POSTGRES_CONTAINER="supplify-dev-postgres" ;;
  staging) POSTGRES_CONTAINER="supplify-staging-postgres" ;;
esac

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

ensure_paths() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file: $ENV_FILE"
    echo "Run deploy/scripts/deploy-${SUPPLIFY_ENV}.sh first, or copy from deploy/env/.env.${SUPPLIFY_ENV}.example"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  mkdir -p "${BACKUP_DIR:-/opt/supplify/backups}"
}

dc() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}
