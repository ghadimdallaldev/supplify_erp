#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "staging" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
source "$(dirname "$0")/common.sh"
require docker
ensure_paths

file="${1:-}"
if [[ -z "$file" || ! -f "$file" ]]; then
  echo "Usage: restore-from-file.sh [dev|staging|prod] /path/to/backup_xxx.dump"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Restoring from backup: $file"
echo "Stopping frontend/backend..."
dc stop frontend backend || true

echo "Terminating active DB connections..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
  sh -lc "psql -U '${POSTGRES_USER:-supplify}' -d postgres -c \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB:-supplify}' AND pid <> pg_backend_pid();\""

echo "Dropping and recreating database ${POSTGRES_DB:-supplify}..."
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
  sh -lc "psql -U '${POSTGRES_USER:-supplify}' -d postgres -c \"DROP DATABASE IF EXISTS \\\"${POSTGRES_DB:-supplify}\\\";\" && psql -U '${POSTGRES_USER:-supplify}' -d postgres -c \"CREATE DATABASE \\\"${POSTGRES_DB:-supplify}\\\";\""

echo "Restoring data..."
cat "$file" | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
  sh -lc "pg_restore -U '${POSTGRES_USER:-supplify}' -d '${POSTGRES_DB:-supplify}' --clean --if-exists"

echo "Starting frontend/backend..."
dc start backend frontend

echo "Restore complete."
