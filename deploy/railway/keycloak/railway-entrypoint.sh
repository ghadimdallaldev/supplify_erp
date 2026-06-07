#!/usr/bin/env bash
# Railway Keycloak entrypoint: wait for Postgres, create DB "keycloak" if missing, set KC_DB_*.
# Link the Postgres plugin to this service (PGHOST/PGUSER/PGPASSWORD refs) — see keycloak.env.
set -euo pipefail

RAILWAY_ENTRYPOINT_VERSION=3
echo "Keycloak railway-entrypoint.sh v${RAILWAY_ENTRYPOINT_VERSION}" >&2

KEYCLOAK_DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"
KEYCLOAK_DB_ADMIN="${KEYCLOAK_DB_ADMIN:-${PGDATABASE:-railway}}"

parse_jdbc_url() {
  local url="$1"
  if [[ "$url" =~ jdbc:postgresql://([^:/@]+):([0-9]+)/([^?]+) ]]; then
    export _PG_HOST="${BASH_REMATCH[1]}"
    export _PG_PORT="${BASH_REMATCH[2]}"
    export _PG_DB="${BASH_REMATCH[3]}"
    return 0
  fi
  if [[ "$url" =~ jdbc:postgresql://([^:/@]+)/([^?]+) ]]; then
    export _PG_HOST="${BASH_REMATCH[1]}"
    export _PG_PORT="5432"
    export _PG_DB="${BASH_REMATCH[2]}"
    return 0
  fi
  return 1
}

parse_database_url() {
  local url="$1"
  if [[ "$url" =~ postgres(ql)?://([^:/@]+)(:([^@]*))?@([^:/@]+)(:([0-9]+))?/([^?]+) ]]; then
    export _PG_USER="${BASH_REMATCH[2]}"
    export _PG_PASS="${BASH_REMATCH[4]:-}"
    export _PG_HOST="${BASH_REMATCH[5]}"
    export _PG_PORT="${BASH_REMATCH[7]:-5432}"
    export _PG_DB="${BASH_REMATCH[8]}"
    return 0
  fi
  return 1
}

resolve_postgres() {
  if [ -n "${KC_DB_URL:-}" ] && [ -n "${KC_DB_USERNAME:-}" ] && [ -n "${KC_DB_PASSWORD:-}" ]; then
    if [ -n "${PGHOST:-}" ]; then
      PG_HOST="$PGHOST"
      PG_PORT="${PGPORT:-5432}"
    elif parse_jdbc_url "$KC_DB_URL"; then
      PG_HOST="$_PG_HOST"
      PG_PORT="$_PG_PORT"
    elif parse_database_url "$KC_DB_URL"; then
      PG_HOST="$_PG_HOST"
      PG_PORT="$_PG_PORT"
    else
      echo "ERROR: KC_DB_URL is set but host cannot be resolved for database bootstrap."
      exit 1
    fi
    PG_USER="$KC_DB_USERNAME"
    PG_PASS="$KC_DB_PASSWORD"
    return 0
  fi

  PG_HOST="${PGHOST:-}"
  PG_PORT="${PGPORT:-5432}"
  PG_USER="${PGUSER:-${POSTGRES_USER:-}}"
  PG_PASS="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

  if [ -z "$PG_HOST" ] && [ -n "${DATABASE_URL:-}" ]; then
    if parse_database_url "$DATABASE_URL"; then
      PG_HOST="$_PG_HOST"
      PG_PORT="$_PG_PORT"
      PG_USER="${PG_USER:-$_PG_USER}"
      PG_PASS="${PG_PASS:-$_PG_PASS}"
      KEYCLOAK_DB_ADMIN="${KEYCLOAK_DB_ADMIN:-$_PG_DB}"
    fi
  fi

  if [ -z "$PG_HOST" ] || [ -z "$PG_USER" ] || [ -z "$PG_PASS" ]; then
    cat >&2 <<'EOF'
ERROR: Postgres is not linked to Keycloak.

On Railway, add reference variables to the Keycloak service (see deploy/railway/<env>/keycloak.env):
  PGHOST=${{Postgres-dev.PGHOST}}
  PGPORT=${{Postgres-dev.PGPORT}}
  PGUSER=${{Postgres-dev.PGUSER}}
  PGPASSWORD=${{Postgres-dev.PGPASSWORD}}

Or run: pnpm railway:keycloak:sync -- development

Do NOT set DATABASE_URL on Keycloak (API only).
EOF
    exit 1
  fi

  export KC_DB_USERNAME="$PG_USER"
  export KC_DB_PASSWORD="$PG_PASS"
  export KC_DB_URL="jdbc:postgresql://${PG_HOST}:${PG_PORT}/${KEYCLOAK_DB_NAME}"
}

wait_for_postgres() {
  local i
  for i in $(seq 1 90); do
    if PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$KEYCLOAK_DB_ADMIN" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "ERROR: Postgres not reachable at ${PG_HOST}:${PG_PORT} (admin db: ${KEYCLOAK_DB_ADMIN})" >&2
  exit 1
}

ensure_keycloak_database() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "WARN: psql missing; assuming database '${KEYCLOAK_DB_NAME}' already exists" >&2
    return 0
  fi

  wait_for_postgres

  PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$KEYCLOAK_DB_ADMIN" -v ON_ERROR_STOP=1 <<SQL
SELECT 'CREATE DATABASE ${KEYCLOAK_DB_NAME}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${KEYCLOAK_DB_NAME}')\gexec
SQL

  PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$KEYCLOAK_DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO public;
SQL

  echo "Keycloak database '${KEYCLOAK_DB_NAME}' ready at ${PG_HOST}:${PG_PORT}"
  echo "Keycloak JDBC (runtime): jdbc:postgresql://${PG_HOST}:${PG_PORT}/${KEYCLOAK_DB_NAME}"
}

optimized_build_is_postgres() {
  [ -f /opt/keycloak/conf/keycloak.conf ] && grep -qE '^db=postgres' /opt/keycloak/conf/keycloak.conf
}

ensure_postgres_optimized_build() {
  local metrics="${KC_METRICS_ENABLED:-false}"

  if optimized_build_is_postgres; then
    echo "Keycloak optimized build: postgres (ready)" >&2
    return 0
  fi

  echo "Keycloak optimized build missing or H2 — running kc.sh build --db=postgres (1-3 min)..." >&2
  JAVA_OPTS_APPEND="-Xms256m -Xmx768m -XX:+UseContainerSupport" \
    /opt/keycloak/bin/kc.sh build \
      --db=postgres \
      --health-enabled=true \
      --metrics-enabled="$metrics"

  if ! optimized_build_is_postgres; then
    echo "ERROR: kc.sh build did not produce db=postgres in /opt/keycloak/conf/keycloak.conf" >&2
    exit 1
  fi
  echo "Keycloak optimized build: postgres (complete)" >&2
}

strip_start_flags() {
  extra_args=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --optimized) shift ;;
      --db-url|--db-username|--db-password)
        shift 2
        ;;
      --db)
        shift 2
        ;;
      *) extra_args+=("$1"); shift ;;
    esac
  done
}

resolve_postgres
ensure_keycloak_database

if [ "${1:-}" = "start-dev" ]; then
  echo "ERROR: start-dev is forbidden on Railway. Use: start --import-realm" >&2
  exit 1
fi

if [ "${1:-}" = "start" ]; then
  shift
  strip_start_flags "$@"

  # Remove dashboard vars that conflict with CLI or are deprecated.
  unset KC_DB KC_PROXY KC_HEALTH_ENABLED KC_METRICS_ENABLED || true

  use_optimized="${KEYCLOAK_USE_OPTIMIZED:-false}"
  if [ "$use_optimized" = "true" ]; then
    ensure_postgres_optimized_build
    echo "Keycloak start mode: optimized + postgres" >&2
    exec /opt/keycloak/bin/kc.sh start --optimized \
      --db-url="$KC_DB_URL" \
      --db-username="$KC_DB_USERNAME" \
      --db-password="$KC_DB_PASSWORD" \
      "${extra_args[@]}"
  fi

  # Default on Railway dev: runtime postgres (avoids H2 baked into stale optimized images).
  echo "Keycloak start mode: runtime postgres (no --optimized)" >&2
  exec /opt/keycloak/bin/kc.sh start \
    --db=postgres \
    --db-url="$KC_DB_URL" \
    --db-username="$KC_DB_USERNAME" \
    --db-password="$KC_DB_PASSWORD" \
    --health-enabled=true \
    "${extra_args[@]}"
fi

exec /opt/keycloak/bin/kc.sh "$@"
