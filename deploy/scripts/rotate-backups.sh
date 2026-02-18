#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "preprod" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
source "$(dirname "$0")/common.sh"
require find
ensure_paths

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

days="${BACKUP_RETENTION_DAYS:-14}"
echo "Rotating backups older than ${days} days in $BACKUP_DIR"
find "$BACKUP_DIR" -type f -name "backup_*.dump" -mtime "+$days" -print -delete || true
echo "Rotation done."
