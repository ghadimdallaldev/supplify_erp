#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "preprod" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
source "$(dirname "$0")/common.sh"
require docker
ensure_paths

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "=== Supplify ($SUPPLIFY_ENV) Docker status ==="
dc ps || true
echo
echo "=== Backend health ==="
curl -fsS "http://127.0.0.1:${BACKEND_PORT:-3000}/health" && echo " OK" || echo " FAIL"
echo
echo "=== Frontend health ==="
curl -fsS "http://127.0.0.1:${FRONTEND_PORT:-3001}/" >/dev/null && echo " OK" || echo " FAIL"
echo
echo "=== Postgres health ==="
docker exec "$POSTGRES_CONTAINER" sh -lc "pg_isready -U '${POSTGRES_USER:-supplify}' -d '${POSTGRES_DB:-supplify}' -h 127.0.0.1" && echo " OK" || echo " FAIL"
