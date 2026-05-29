#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "staging" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
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

if [[ -n "${BACKUP_REMOTE_URL:-}" ]]; then
  echo "BACKUP_REMOTE_URL is set — copy $file to your remote backup target (Railway volume, rsync, etc.)."
  echo "AWS S3 upload was removed; configure your own off-site backup workflow."
fi
