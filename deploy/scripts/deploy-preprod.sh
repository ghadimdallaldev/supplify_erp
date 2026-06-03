#!/usr/bin/env bash
# One-command pre-production deploy (uses staging compose/env files on disk).
#   sudo ./deploy/scripts/deploy-preprod.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV="staging"
ENV_FILE="$REPO_ROOT/deploy/env/.env.staging"
ENV_EXAMPLE="$REPO_ROOT/deploy/env/.env.staging.example"
COMPOSE_FILE="$REPO_ROOT/deploy/docker-compose.staging.yml"
BACKEND_IMAGE="supplify-backend:staging"
FRONTEND_IMAGE="supplify-frontend:staging"
COMPOSE_CMD=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

# shellcheck source=_common.sh
source "$SCRIPT_DIR/_common.sh"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Supplify — Pre-Production Deploy       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

echo "▶ Phase 1: Bootstrap"
install_docker
ensure_swap

echo ""
echo "▶ Phase 2: Environment setup"
mkdir -p "$REPO_ROOT/deploy/env"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  PG_PASS=$(gen_secret)
  SESSION_SEC=$(gen_secret)
  MINIO_PASS=$(gen_secret)
  KC_PASS=$(gen_secret)

  IMDS_TOKEN=$(curl -sf --max-time 2 -X PUT \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
    http://169.254.169.254/latest/api/token 2>/dev/null || true)
  PUBLIC_IP=$(curl -sf --max-time 3 \
    ${IMDS_TOKEN:+-H "X-aws-ec2-metadata-token: $IMDS_TOKEN"} \
    http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "localhost")

  sed -i \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SEC}|" \
    -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_PASS}|" \
    -e "s|^KEYCLOAK_ADMIN_PASSWORD=.*|KEYCLOAK_ADMIN_PASSWORD=${KC_PASS}|" \
    -e "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=${MINIO_PASS}|" \
    -e "s|postgresql://supplify:change_me@|postgresql://supplify:${PG_PASS}@|" \
    -e "s|^PUBLIC_URL=.*|PUBLIC_URL=http://${PUBLIC_IP}|" \
    -e "s|^VITE_API_URL=.*|VITE_API_URL=http://${PUBLIC_IP}|" \
    -e "s|^VITE_KEYCLOAK_URL=.*|VITE_KEYCLOAK_URL=http://${PUBLIC_IP}:8180|" \
    -e "s|^WEB_ORIGIN=.*|WEB_ORIGIN=http://${PUBLIC_IP}|" \
    "$ENV_FILE"

  echo "  Created $ENV_FILE with auto-generated secrets."
  echo "  Public URL set to: http://${PUBLIC_IP}"
fi

sed -i \
  -e "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${BACKEND_IMAGE}|" \
  -e "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${FRONTEND_IMAGE}|" \
  "$ENV_FILE"

apply_vapid_env "$ENV_FILE"
apply_minio_public_url "$ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mkdir -p "${BACKUP_DIR:-/opt/supplify/backups-staging}"

echo ""
echo "▶ Phase 3: Building Docker images"
cd "$REPO_ROOT"

docker build -t "$BACKEND_IMAGE" -f apps/api/Dockerfile .
docker build -t "$FRONTEND_IMAGE" -f apps/web/Dockerfile \
  --build-arg "VITE_API_URL=${VITE_API_URL:-${PUBLIC_URL:-http://localhost}}" \
  --build-arg "VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL:-http://localhost:8180}" \
  --build-arg "VITE_KEYCLOAK_REALM=Supplify" \
  .

echo ""
echo "▶ Phase 4: Starting infrastructure"
"${COMPOSE_CMD[@]}" up -d postgres redis minio keycloak

wait_healthy "supplify-staging-postgres" 60 3
wait_healthy "supplify-staging-redis"    30 3
wait_healthy "supplify-staging-minio"    60 3

echo ""
echo "▶ Phase 5: Init & migrate"
echo "  Running minio-init (buckets: ${S3_BUCKETS:-${S3_BUCKET:-supplify}})..."
"${COMPOSE_CMD[@]}" run --rm minio-init
"${COMPOSE_CMD[@]}" run --rm keycloak-init
echo "  Running database migrations, tenant role backfill, and RBAC system role sync..."
"${COMPOSE_CMD[@]}" run --rm migrate

echo ""
echo "▶ Phase 6: Starting application"
"${COMPOSE_CMD[@]}" up -d backend frontend nginx autoheal backup

wait_healthy "supplify-staging-backend" 60 5
wait_healthy "supplify-staging-nginx"   30 3

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Pre-production deploy complete!        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  App: ${PUBLIC_URL:-http://localhost}"
