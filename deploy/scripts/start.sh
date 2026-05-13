#!/usr/bin/env bash
set -euo pipefail
env_arg="${1:-}"
if [[ "$env_arg" == "dev" || "$env_arg" == "staging" || "$env_arg" == "prod" ]]; then export SUPPLIFY_ENV="$env_arg"; shift; fi
source "$(dirname "$0")/common.sh"
require docker
ensure_paths
dc up -d
echo "Supplify ($SUPPLIFY_ENV) started."
