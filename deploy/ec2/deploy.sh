#!/usr/bin/env bash
# Build images and start the Supplify production stack on EC2.
# Run from repo root: ./deploy/ec2/deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${SUPPLIFY_ROOT:-/opt/supplify}/env/.env"
COMPOSE_FILE="$REPO_ROOT/deploy/docker-compose.prod.yml"

cd "$REPO_ROOT"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — run bootstrap.sh or copy deploy/env/.env.example"
  exit 1
fi

set -a && source "$ENV_FILE" && set +a

if [ "${POSTGRES_PASSWORD:-change_me}" = "change_me" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "ERROR: Set POSTGRES_PASSWORD in $ENV_FILE before deploying."
  exit 1
fi

BACKEND_IMAGE="${BACKEND_IMAGE:-supplify-backend:prod}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-supplify-frontend:prod}"

echo "=== Supplify Production Deploy ==="
echo "PUBLIC_URL: ${PUBLIC_URL:-not set}"

echo "Building backend image..."
docker build -t "$BACKEND_IMAGE" -f apps/api/Dockerfile .

echo "Building frontend image..."
docker build -t "$FRONTEND_IMAGE" -f apps/web/Dockerfile \
  --build-arg "VITE_API_URL=${VITE_API_URL:-${PUBLIC_URL:-http://localhost}}" .

echo "Running database migrations..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate

echo "Starting stack..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

echo ""
echo "=== Deploy complete ==="
echo "  App:  ${PUBLIC_URL:-http://localhost}"
echo ""
echo "Logs:  docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f"
echo "Stop:  docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down"
