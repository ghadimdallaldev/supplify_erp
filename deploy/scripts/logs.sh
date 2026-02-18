#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "preprod" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
source "$(dirname "$0")/common.sh"
require docker
ensure_paths
svc="${1:-}"
if [[ -z "$svc" ]]; then
  dc logs -f --tail=200
else
  dc logs -f --tail=200 "$svc"
fi
