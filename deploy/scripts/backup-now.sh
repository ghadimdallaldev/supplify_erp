#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "preprod" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
source "$(dirname "$0")/common.sh"
require docker
require date
ensure_paths

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

ts="$(date +%Y%m%d_%H%M%S)"
file="$BACKUP_DIR/backup_${POSTGRES_DB}_${ts}.dump"

echo "Creating backup: $file"
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
  sh -lc "pg_dump -U '${POSTGRES_USER:-supplify}' -d '${POSTGRES_DB:-supplify}' -Fc" > "$file"

echo "Backup created: $file"

"$(dirname "$0")/rotate-backups.sh"

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  require aws
  key="${BACKUP_S3_PREFIX:-$PROJECT_NAME}/$(basename "$file")"
  echo "Uploading to s3://${BACKUP_S3_BUCKET}/${key}"
  aws s3 cp "$file" "s3://${BACKUP_S3_BUCKET}/${key}"
  echo "Upload complete."
fi
