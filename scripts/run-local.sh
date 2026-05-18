#!/usr/bin/env bash
# Run the full Supplify stack locally via Docker Compose.
#
# Usage (from repo root):
#   ./scripts/run-local.sh          # up --build (default)
#   ./scripts/run-local.sh up       # same
#   ./scripts/run-local.sh down     # stop and remove containers
#   ./scripts/run-local.sh up --logs   # start then stream all container logs
#   ./scripts/run-local.sh logs api    # follow one service only
#   ./scripts/run-local.sh status   # container + HTTP health summary
#   ./scripts/run-local.sh seed     # run DB seed in the api container
#
# Windows:  scripts\run-local.cmd up
# macOS/Linux / Git Bash:  ./scripts/run-local.sh up
# Any OS with Node:  node scripts/run-local.mjs up   (or pnpm local:up after installing pnpm)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/docker/.env"
ENV_EXAMPLE="$REPO_ROOT/docker/.env.example"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"

# shellcheck source=../deploy/scripts/_common.sh
source "$REPO_ROOT/deploy/scripts/_common.sh"

dc() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require docker
docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose plugin is required (docker compose version)."
  exit 1
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -qE ":${port}[[:space:]]"
    return
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -qE "[.:]${port}[[:space:]]"
    return
  fi
  (echo >/dev/tcp/127.0.0.1/"$port") 2>/dev/null
}

our_container_on_port() {
  local port="$1"
  local name="$2"
  docker ps --filter "name=^/${name}$" --format '{{.Ports}}' 2>/dev/null \
    | grep -q ":${port}->" || return 1
}

patch_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    fi
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ ! -f "$ENV_EXAMPLE" ]]; then
      echo "Missing $ENV_EXAMPLE"
      exit 1
    fi
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "Created $ENV_FILE from example."
  fi

  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a

  local changed=0

  if port_in_use "${POSTGRES_PORT:-5432}" && ! our_container_on_port "${POSTGRES_PORT:-5432}" supplify-postgres; then
    echo "Port ${POSTGRES_PORT:-5432} is busy — using 5433 for Postgres."
    patch_env_var POSTGRES_PORT 5433
    changed=1
  fi

  if port_in_use "${APP_PORT:-80}" && ! our_container_on_port "${APP_PORT:-80}" supplify-nginx; then
    echo "Port ${APP_PORT:-80} is busy — using 8080 for the app (nginx)."
    patch_env_var APP_PORT 8080
    patch_env_var VITE_API_URL "http://localhost:8080"
    patch_env_var WEB_ORIGIN "http://localhost:8080"
    changed=1
  fi

  if port_in_use "${KEYCLOAK_PORT:-8180}" && ! our_container_on_port "${KEYCLOAK_PORT:-8180}" supplify-keycloak; then
    echo "Port ${KEYCLOAK_PORT:-8180} is busy — using 8181 for Keycloak."
    patch_env_var KEYCLOAK_PORT 8181
    patch_env_var VITE_KEYCLOAK_URL "http://localhost:8181"
    changed=1
  fi

  if [[ "$changed" -eq 1 ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$ENV_FILE"
    set +a
  fi
}

load_urls() {
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
  APP_URL="${WEB_ORIGIN:-http://localhost}"
  KC_URL="http://localhost:${KEYCLOAK_PORT:-8180}"
  MINIO_URL="http://localhost:${MINIO_CONSOLE_PORT:-9001}"
}

http_ok() {
  local url="$1"
  curl -fsS -o /dev/null -m 5 "$url" 2>/dev/null
}

cmd_up() {
  local follow_logs=1
  local build_flag=(--build)
  local log_services=(api)

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --logs|-f|--follow) follow_logs=1; shift ;;
      --no-logs) follow_logs=0; shift ;;
      --all-logs) log_services=(); shift ;;
      --no-build) build_flag=(); shift ;;
      api|web|nginx|keycloak|postgres|redis|minio) log_services=("$1"); shift ;;
      *) shift ;;
    esac
  done

  ensure_env
  echo "Starting Supplify stack (Docker full profile)..."
  dc up -d "${build_flag[@]}" --profile full

  echo ""
  echo "Waiting for core services..."
  wait_healthy supplify-postgres 40 3 || true
  wait_healthy supplify-redis 30 2 || true
  wait_healthy supplify-api 60 5
  wait_healthy supplify-web 40 3
  wait_healthy supplify-nginx 30 3

  load_urls
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  Supplify is running locally"
  echo "══════════════════════════════════════════════════════════"
  echo "  App (nginx):     ${APP_URL}"
  echo "  API health:      ${APP_URL}/health"
  echo "  Keycloak:        ${KC_URL}  (realm: Supplify)"
  echo "  Keycloak admin:  ${KC_URL}/admin  (admin / see docker/.env)"
  echo "  MinIO console:   ${MINIO_URL}"
  echo ""
  echo "  Logs:    ./scripts/run-local.sh logs"
  echo "  Stop:    ./scripts/run-local.sh down"
  echo "  Seed DB: ./scripts/run-local.sh seed"
  echo "══════════════════════════════════════════════════════════"

  if ! http_ok "${APP_URL}/health"; then
    echo ""
    echo "WARN: ${APP_URL}/health did not respond yet — stack may still be warming up."
    echo "     Check: ./scripts/run-local.sh status"
  fi

  if [[ "$follow_logs" -eq 1 ]]; then
    echo ""
    echo "Following API logs (Ctrl+C stops watching; app keeps running)..."
    echo "  Tip: ./scripts/run-local.sh up --all-logs  for every service"
    if [[ ${#log_services[@]} -gt 0 ]]; then
      dc logs -f "${log_services[@]}"
    else
      dc logs -f
    fi
  fi
}

cmd_down() {
  ensure_env
  dc down "$@"
  echo "Stack stopped."
}

cmd_logs() {
  ensure_env
  dc logs -f "$@"
}

cmd_status() {
  ensure_env
  load_urls
  echo "Containers:"
  dc ps
  echo ""
  echo "HTTP checks:"
  check_http() {
    local label="$1"
    local url="$2"
    if http_ok "$url"; then
      echo "  ${label}: OK  (${url})"
    else
      echo "  ${label}: not ready  (${url})"
    fi
  }
  check_http nginx "${APP_URL}/nginx-health"
  check_http api "${APP_URL}/health"
  check_http keycloak "${KC_URL}/realms/Supplify"
}

cmd_seed() {
  ensure_env
  if ! docker inspect supplify-api >/dev/null 2>&1; then
    echo "API container is not running. Start the stack first: ./scripts/run-local.sh up"
    exit 1
  fi
  echo "Running full feature seed (migrations + prod-like data + chats + Keycloak)..."
  docker exec -e ALLOW_PRODLIKE_SEED=true -e KEYCLOAK_BASE_URL=http://keycloak:8080 -e KEYCLOAK_ADMIN_PASSWORD=admin \
    supplify-api node apps/api/scripts/seed-full.mjs
  echo "Bootstrap finished. See seed-full.mjs output for login emails."
}

main() {
  local cmd="${1:-up}"
  shift || true

  case "$cmd" in
    up|start)
      cmd_up "$@"
      ;;
    down|stop)
      cmd_down "$@"
      ;;
    logs)
      cmd_logs "$@"
      ;;
    ps|status)
      cmd_status
      ;;
    seed)
      cmd_seed
      ;;
    infra)
      ensure_env
      node "$REPO_ROOT/scripts/dev-infra.mjs"
      ;;
    dev)
      ensure_env
      node "$REPO_ROOT/scripts/dev-native.mjs" "$@"
      ;;
    restart)
      ensure_env
      dc restart "$@"
      ;;
    build)
      ensure_env
      dc build "$@"
      ;;
    -h|--help|help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      ;;
    *)
      echo "Unknown command: $cmd"
      echo "Run: ./scripts/run-local.sh --help"
      exit 1
      ;;
  esac
}

main "$@"
