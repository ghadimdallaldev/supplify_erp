#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "preprod" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
source "$(dirname "$0")/common.sh"
require ls
ensure_paths

latest="$(ls -1t "$BACKUP_DIR"/backup_*.dump 2>/dev/null | head -n 1 || true)"
if [[ -z "$latest" ]]; then
  echo "No backups found in $BACKUP_DIR"
  exit 1
fi

"$(dirname "$0")/restore-from-file.sh" "$latest"
