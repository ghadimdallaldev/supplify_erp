#!/usr/bin/env bash
# Run SQL migrations for apps/api (used by docker-compose migrate service and EC2 deploy).
set -euo pipefail

env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "preprod" || "$env_arg" == "prod" ]]; then
  export SUPPLIFY_ENV="$env_arg"
  shift
fi

source "$(dirname "$0")/common.sh"
require docker
ensure_paths

echo "Running API database migrations..."
dc run --rm migrate
