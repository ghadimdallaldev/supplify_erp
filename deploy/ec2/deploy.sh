#!/usr/bin/env bash
# Build and start the full Supplify production stack.
# Run from repo root: ./deploy/ec2/deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/deploy/docker"
ENV_FILE="$COMPOSE_DIR/.env"

cd "$REPO_ROOT"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy from .env.production.example and configure."
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

if [ "${POSTGRES_PASSWORD:-CHANGE_ME}" = "CHANGE_ME" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "ERROR: Set secrets in $ENV_FILE before deploying."
  exit 1
fi

echo "=== Supplify Production Deploy ==="
echo "PUBLIC_URL: ${PUBLIC_URL:-not set}"

export COMPOSE_FILE="$COMPOSE_DIR/docker-compose.prod.yml"
export COMPOSE_PROJECT_NAME=supplify-prod

echo "Building images (this may take 15-30 minutes on first run)..."
docker compose --env-file "$ENV_FILE" build --parallel

echo "Starting full stack (migrations run automatically on first start)..."
docker compose --env-file "$ENV_FILE" up -d

echo ""
echo "=== Deploy complete ==="
echo "  App:       ${PUBLIC_URL:-http://localhost}"
echo "  GraphQL:   ${PUBLIC_URL:-http://localhost}/graphql"
echo "  Keycloak:  ${PUBLIC_URL:-http://localhost}/auth"
echo ""
echo "Logs:  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f"
echo "Stop:  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down"
