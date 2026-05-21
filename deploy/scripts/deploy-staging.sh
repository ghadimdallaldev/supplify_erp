#!/usr/bin/env bash
# One-command staging deploy. Run as root (or sudo) from the repo root:
#   sudo ./deploy/scripts/deploy-staging.sh
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
echo "║   Supplify — Staging Deploy              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Phase 1: Bootstrap ────────────────────────────────────────────────────────
echo "▶ Phase 1: Bootstrap"
install_docker
ensure_swap

# ── Phase 2: Environment setup ───────────────────────────────────────────────
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
  echo "  Edit $ENV_FILE to set a custom domain, then re-run this script."
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

if [ "${PUBLIC_URL:-http://localhost}" = "http://localhost" ]; then
  echo "  WARN: PUBLIC_URL is http://localhost — Keycloak logins will not work from a browser."
  echo "  Set PUBLIC_URL in $ENV_FILE and re-run."
fi

mkdir -p "${BACKUP_DIR:-/opt/supplify/backups-staging}"

# ── Phase 3: Build images ─────────────────────────────────────────────────────
echo ""
echo "▶ Phase 3: Building Docker images"
cd "$REPO_ROOT"

echo "  Building backend (supplify-backend:staging)..."
docker build -t "$BACKEND_IMAGE" -f apps/api/Dockerfile .

echo "  Building frontend (supplify-frontend:staging)..."
docker build -t "$FRONTEND_IMAGE" -f apps/web/Dockerfile \
  --build-arg "VITE_API_URL=${VITE_API_URL:-${PUBLIC_URL:-http://localhost}}" \
  --build-arg "VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL:-http://localhost:8180}" \
  --build-arg "VITE_KEYCLOAK_REALM=Supplify" \
  .

# ── Phase 4: Start infrastructure ────────────────────────────────────────────
echo ""
echo "▶ Phase 4: Starting infrastructure (postgres, redis, minio, keycloak)"
"${COMPOSE_CMD[@]}" up -d postgres redis minio keycloak

wait_healthy "supplify-staging-postgres" 60 3
wait_healthy "supplify-staging-redis"    30 3
wait_healthy "supplify-staging-minio"    60 3
# Keycloak may take up to 3 minutes on first boot — keycloak-init polls it internally

# ── Phase 5: Init & migrate ──────────────────────────────────────────────────
echo ""
echo "▶ Phase 5: Initialising MinIO, Keycloak, and running migrations"

echo "  Running minio-init (buckets: ${S3_BUCKETS:-${S3_BUCKET:-supplify}})..."
"${COMPOSE_CMD[@]}" run --rm minio-init

echo "  Running keycloak-init (this can take 2–3 minutes on first boot)..."
"${COMPOSE_CMD[@]}" run --rm keycloak-init

echo "  Running database migrations (54 SQL files + runtime migrators)..."
"${COMPOSE_CMD[@]}" run --rm migrate

# ── Phase 6: Start application ───────────────────────────────────────────────
echo ""
echo "▶ Phase 6: Starting application (backend, frontend, nginx, autoheal, backup)"
"${COMPOSE_CMD[@]}" up -d backend frontend nginx autoheal backup

echo ""
echo "  Waiting for backend to be healthy..."
wait_healthy "supplify-staging-backend" 60 5
echo "  Waiting for nginx to be healthy..."
wait_healthy "supplify-staging-nginx"   30 3

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Staging deploy complete!               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  App:       ${PUBLIC_URL:-http://localhost}"
echo "  Keycloak:  ${VITE_KEYCLOAK_URL:-http://localhost:8180}"
echo "  MinIO:     http://localhost:9001  (user: ${MINIO_ROOT_USER:-minioadmin})"
echo ""
echo "  Logs:   docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f"
echo "  Stop:   docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down"
echo ""
echo "Streaming logs for 20 seconds (Ctrl-C to stop)..."
timeout 20 "${COMPOSE_CMD[@]}" logs -f --tail=10 || true
