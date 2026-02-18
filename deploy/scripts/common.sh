#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${SUPPLIFY_ROOT:-/opt/supplify}"
SUPPLIFY_ENV="${SUPPLIFY_ENV:-prod}"

case "$SUPPLIFY_ENV" in
  dev|preprod|prod) ;;
  *) echo "Invalid SUPPLIFY_ENV: $SUPPLIFY_ENV (use dev|preprod|prod)"; exit 1 ;;
esac

if [[ "$SUPPLIFY_ENV" == "prod" ]]; then
  COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.prod.yml"
  ENV_FILE="$ROOT_DIR/env/.env"
  BACKUP_DIR="$ROOT_DIR/backups"
  PROJECT_NAME="supplify"
  ENV_EXAMPLE="$ROOT_DIR/deploy/env/.env.example"
else
  COMPOSE_FILE="$ROOT_DIR/deploy/docker-compose.$SUPPLIFY_ENV.yml"
  ENV_FILE="$ROOT_DIR/env/.env.$SUPPLIFY_ENV"
  BACKUP_DIR="$ROOT_DIR/backups-$SUPPLIFY_ENV"
  PROJECT_NAME="supplify-$SUPPLIFY_ENV"
  ENV_EXAMPLE="$ROOT_DIR/deploy/env/.env.$SUPPLIFY_ENV.example"
fi

POSTGRES_CONTAINER="${PROJECT_NAME}-postgres"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

ensure_paths() {
  mkdir -p "$BACKUP_DIR"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing env file at $ENV_FILE"
    echo "Create it from: $ENV_EXAMPLE"
    exit 1
  fi
}

dc() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}
