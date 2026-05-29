# EC2 Single-Command Deployment Implementation Plan

> **Archived — legacy only.** Current deploy path: **Railway** ([DEPLOYMENT_RAILWAY_ENVIRONMENTS.md](../../../DEPLOYMENT_RAILWAY_ENVIRONMENTS.md)).

> **For agentic workers:** Historical plan only — do not treat as active deployment work unless explicitly reviving VM deploy.

**Goal:** Three self-contained deploy scripts (`deploy-dev.sh`, `deploy-staging.sh`, `deploy-prod.sh`) that each bring up the full Supplify stack (postgres + redis + minio + keycloak + migrate + backend + frontend + nginx) on a fresh EC2 instance with one command.

**Architecture:** Each environment (dev/staging/prod) runs on its own EC2 instance. Each deploy script bootstraps Docker, generates secrets, builds images, starts infrastructure, runs all 54 SQL migrations + runtime migrators, creates the Keycloak realm, and starts the app. Three matching `docker-compose.{env}.yml` files contain all services. A `_common.sh` holds shared bootstrap helpers sourced by all three scripts.

**Tech Stack:** Bash, Docker Compose v2, PostgreSQL 16, Redis 7, MinIO, Keycloak 24, Node 22, nginx:alpine

---

## File Map

| File                                | Action  | Purpose                                                          |
| ----------------------------------- | ------- | ---------------------------------------------------------------- |
| `deploy/scripts/_common.sh`         | CREATE  | Docker install, swap creation, secret generation, health polling |
| `deploy/env/.env.dev.example`       | CREATE  | Complete dev env template                                        |
| `deploy/env/.env.staging.example`   | CREATE  | Complete staging env template                                    |
| `deploy/env/.env.prod.example`      | REPLACE | Complete prod env template (was missing many vars)               |
| `deploy/docker-compose.dev.yml`     | REPLACE | Full stack (was missing redis/minio/keycloak/migrate)            |
| `deploy/docker-compose.staging.yml` | CREATE  | Full stack for staging                                           |
| `deploy/docker-compose.prod.yml`    | REPLACE | Full stack (was missing redis/minio/keycloak)                    |
| `deploy/scripts/deploy-dev.sh`      | CREATE  | One-command dev deploy                                           |
| `deploy/scripts/deploy-staging.sh`  | CREATE  | One-command staging deploy                                       |
| `deploy/scripts/deploy-prod.sh`     | CREATE  | One-command prod deploy                                          |

---

## Task 1: Create `deploy/scripts/_common.sh`

**Files:**

- Create: `deploy/scripts/_common.sh`

- [ ] **Step 1: Write the file**

```bash
#!/usr/bin/env bash
# Shared helpers sourced by deploy-dev.sh, deploy-staging.sh, deploy-prod.sh
set -euo pipefail

gen_secret() {
  openssl rand -hex 32 2>/dev/null \
    || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker already installed — skipping."
    return
  fi
  echo "Installing Docker..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ca-certificates curl git jq openssl
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git jq openssl
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git jq openssl
  fi
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER" || true
  fi
  docker compose version >/dev/null 2>&1 || {
    echo "ERROR: Docker Compose plugin not found after install."
    exit 1
  }
  echo "Docker installed."
}

ensure_swap() {
  if [ -f /swapfile ]; then
    echo "Swap already exists — skipping."
    return
  fi
  local ram_mb
  ram_mb=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "99999")
  if [ "$ram_mb" -lt 8192 ]; then
    echo "Creating 4G swap (RAM: ${ram_mb}MB)..."
    fallocate -l 4G /swapfile 2>/dev/null \
      || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab \
      || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap created."
  fi
}

# wait_healthy CONTAINER_NAME [MAX_ATTEMPTS=60] [SLEEP_SECS=3]
wait_healthy() {
  local container="$1"
  local max="${2:-60}"
  local sleep_sec="${3:-3}"
  echo -n "Waiting for ${container} to be healthy"
  for i in $(seq 1 "$max"); do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "")
    if [ "$status" = "healthy" ]; then
      echo " ✓"
      return 0
    fi
    echo -n "."
    sleep "$sleep_sec"
  done
  echo " TIMEOUT"
  echo "--- Last 20 log lines for ${container} ---"
  docker logs "$container" --tail=20 2>&1 || true
  return 1
}
```

- [ ] **Step 2: Validate syntax**

```bash
bash -n deploy/scripts/_common.sh
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add deploy/scripts/_common.sh
git commit -m "feat(deploy): add _common.sh with Docker install, swap, and health-poll helpers"
```

---

## Task 2: Create env example files

**Files:**

- Create: `deploy/env/.env.dev.example`
- Create: `deploy/env/.env.staging.example`
- Replace: `deploy/env/.env.prod.example` (was `deploy/env/.env.example` — also create prod variant)

- [ ] **Step 1: Write `deploy/env/.env.dev.example`**

```bash
# ====== AUTO-GENERATED on first run by deploy-dev.sh ======
POSTGRES_PASSWORD=change_me
SESSION_SECRET=change_me
MINIO_ROOT_PASSWORD=change_me
KEYCLOAK_ADMIN_PASSWORD=change_me

# ====== PUBLIC URL — set your EC2 domain or IP ======
# Auto-detected from EC2 metadata on first run. Override here.
PUBLIC_URL=http://localhost

# ====== AUTO-DERIVED from PUBLIC_URL by deploy-dev.sh ======
VITE_API_URL=http://localhost
VITE_KEYCLOAK_URL=http://localhost:8180
WEB_ORIGIN=http://localhost

# ====== DATABASE ======
POSTGRES_DB=supplify
POSTGRES_USER=supplify
DATABASE_URL=postgresql://supplify:change_me@postgres:5432/supplify

# ====== KEYCLOAK ======
KEYCLOAK_ADMIN=admin
KEYCLOAK_REALM=Supplify
KEYCLOAK_CLIENT_ID=supplify-api
KEYCLOAK_CLIENT_SECRET=changeme

# ====== MINIO / S3 ======
MINIO_ROOT_USER=minioadmin
S3_BUCKET=supplify
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=change_me

# ====== REDIS ======
REDIS_URL=redis://redis:6379

# ====== PORTS ======
BACKEND_PORT=4000
HTTP_PORT=80
KEYCLOAK_PORT=8180

# ====== NODE ======
NODE_ENV=development

# ====== IMAGES (set automatically by deploy-dev.sh) ======
BACKEND_IMAGE=supplify-backend:dev
FRONTEND_IMAGE=supplify-frontend:dev

# ====== BACKUP ======
BACKUP_DIR=/opt/supplify/backups-dev
BACKUP_RETENTION_DAYS=14
BACKUP_S3_BUCKET=
BACKUP_S3_PREFIX=supplify-dev
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

- [ ] **Step 2: Write `deploy/env/.env.staging.example`**

```bash
# ====== AUTO-GENERATED on first run by deploy-staging.sh ======
POSTGRES_PASSWORD=change_me
SESSION_SECRET=change_me
MINIO_ROOT_PASSWORD=change_me
KEYCLOAK_ADMIN_PASSWORD=change_me

# ====== PUBLIC URL — set your staging domain ======
PUBLIC_URL=http://localhost

# ====== AUTO-DERIVED from PUBLIC_URL by deploy-staging.sh ======
VITE_API_URL=http://localhost
VITE_KEYCLOAK_URL=http://localhost:8180
WEB_ORIGIN=http://localhost

# ====== DATABASE ======
POSTGRES_DB=supplify
POSTGRES_USER=supplify
DATABASE_URL=postgresql://supplify:change_me@postgres:5432/supplify

# ====== KEYCLOAK ======
KEYCLOAK_ADMIN=admin
KEYCLOAK_REALM=Supplify
KEYCLOAK_CLIENT_ID=supplify-api
KEYCLOAK_CLIENT_SECRET=changeme

# ====== MINIO / S3 ======
MINIO_ROOT_USER=minioadmin
S3_BUCKET=supplify
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=change_me

# ====== REDIS ======
REDIS_URL=redis://redis:6379

# ====== PORTS ======
BACKEND_PORT=4000
HTTP_PORT=80
KEYCLOAK_PORT=8180

# ====== NODE ======
NODE_ENV=production

# ====== IMAGES (set automatically by deploy-staging.sh) ======
BACKEND_IMAGE=supplify-backend:staging
FRONTEND_IMAGE=supplify-frontend:staging

# ====== BACKUP ======
BACKUP_DIR=/opt/supplify/backups-staging
BACKUP_RETENTION_DAYS=14
BACKUP_S3_BUCKET=
BACKUP_S3_PREFIX=supplify-staging
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

- [ ] **Step 3: Write `deploy/env/.env.prod.example`**

```bash
# ====== REQUIRED — auto-generated on first run by deploy-prod.sh ======
POSTGRES_PASSWORD=change_me
SESSION_SECRET=change_me
MINIO_ROOT_PASSWORD=change_me
KEYCLOAK_ADMIN_PASSWORD=change_me

# ====== PUBLIC URL — set your production domain ======
PUBLIC_URL=http://localhost

# ====== AUTO-DERIVED from PUBLIC_URL by deploy-prod.sh ======
VITE_API_URL=http://localhost
VITE_KEYCLOAK_URL=http://localhost:8180
WEB_ORIGIN=http://localhost

# ====== DATABASE ======
POSTGRES_DB=supplify
POSTGRES_USER=supplify
DATABASE_URL=postgresql://supplify:change_me@postgres:5432/supplify

# ====== KEYCLOAK ======
KEYCLOAK_ADMIN=admin
KEYCLOAK_REALM=Supplify
KEYCLOAK_CLIENT_ID=supplify-api
# IMPORTANT: change this for production — also update in Keycloak admin console
KEYCLOAK_CLIENT_SECRET=changeme

# ====== MINIO / S3 ======
MINIO_ROOT_USER=minioadmin
S3_BUCKET=supplify
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=change_me

# ====== REDIS ======
REDIS_URL=redis://redis:6379

# ====== PORTS ======
BACKEND_PORT=4000
HTTP_PORT=80
KEYCLOAK_PORT=8180

# ====== NODE ======
NODE_ENV=production

# ====== IMAGES (set automatically by deploy-prod.sh) ======
BACKEND_IMAGE=supplify-backend:prod
FRONTEND_IMAGE=supplify-frontend:prod

# ====== BACKUP ======
BACKUP_DIR=/opt/supplify/backups
BACKUP_RETENTION_DAYS=14
BACKUP_S3_BUCKET=
BACKUP_S3_PREFIX=supplify
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

- [ ] **Step 4: Commit**

```bash
git add deploy/env/.env.dev.example deploy/env/.env.staging.example deploy/env/.env.prod.example
git commit -m "feat(deploy): add complete env example files for dev/staging/prod"
```

---

## Task 3: Write `deploy/docker-compose.dev.yml` (replace existing)

**Files:**

- Replace: `deploy/docker-compose.dev.yml`

The compose file path is `deploy/docker-compose.dev.yml`. Relative paths inside it resolve from the `deploy/` directory. So `../infra/db/init.sql` resolves to `infra/db/init.sql` in the repo root. The `env_file: ./env/.env.dev` resolves to `deploy/env/.env.dev`.

Important: inside multi-line `entrypoint` strings, use `$$VAR` and `$$(cmd)` — Docker Compose substitutes `$$` → `$` before passing to the container, preventing compose from trying to interpolate shell variables as compose variables.

- [ ] **Step 1: Write the file**

```yaml
version: '3.9'

name: supplify-dev

services:
  postgres:
    image: postgres:16-alpine
    container_name: supplify-dev-postgres
    env_file: ./env/.env.dev
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-supplify}
      POSTGRES_USER: ${POSTGRES_USER:-supplify}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - supplify_dev_pgdata:/var/lib/postgresql/data
      - ../infra/db/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'pg_isready -U ${POSTGRES_USER:-supplify} -d ${POSTGRES_DB:-supplify} -h 127.0.0.1',
        ]
      interval: 5s
      timeout: 5s
      retries: 20
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_dev_net

  redis:
    image: redis:7-alpine
    container_name: supplify-dev-redis
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped
    networks:
      - supplify_dev_net

  minio:
    image: minio/minio:latest
    container_name: supplify-dev-minio
    env_file: ./env/.env.dev
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - supplify_dev_minio:/data
    healthcheck:
      test: ['CMD-SHELL', 'curl -sf http://127.0.0.1:9000/minio/health/live || exit 1']
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 10s
    restart: unless-stopped
    networks:
      - supplify_dev_net

  minio-init:
    image: minio/mc:latest
    container_name: supplify-dev-minio-init
    env_file: ./env/.env.dev
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD 2>/dev/null; do sleep 2; done;
      mc mb local/${S3_BUCKET:-supplify} --ignore-existing;
      echo 'MinIO bucket ready';
      "
    depends_on:
      minio:
        condition: service_healthy
    restart: 'no'
    networks:
      - supplify_dev_net

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    container_name: supplify-dev-keycloak
    env_file: ./env/.env.dev
    environment:
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${POSTGRES_USER:-supplify}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
      KC_HOSTNAME_STRICT: 'false'
      KC_HOSTNAME_STRICT_HTTPS: 'false'
      KC_HTTP_ENABLED: 'true'
      KC_HEALTH_ENABLED: 'true'
    command:
      - start-dev
      - --import-realm
    volumes:
      - supplify_dev_keycloak:/opt/keycloak/data
      - ../infra/keycloak/realm-export.json:/opt/keycloak/data/import/Supplify-realm.json:ro
    ports:
      - '${KEYCLOAK_PORT:-8180}:8080'
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - supplify_dev_net

  keycloak-init:
    image: quay.io/keycloak/keycloak:24.0
    container_name: supplify-dev-keycloak-init
    env_file: ./env/.env.dev
    environment:
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      PUBLIC_URL: ${PUBLIC_URL:-http://localhost}
    entrypoint:
      - /bin/bash
      - -ec
      - |
        echo "Waiting for Keycloak admin API..."
        for i in $$(seq 1 90); do
          if /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://keycloak:8080 \
            --realm master \
            --user "$${KEYCLOAK_ADMIN}" \
            --password "$${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
            echo "Keycloak ready"
            break
          fi
          [ "$$i" -eq 90 ] && { echo "Timeout waiting for Keycloak"; exit 1; }
          sleep 2
        done
        if /opt/keycloak/bin/kcadm.sh get realms/Supplify >/dev/null 2>&1; then
          echo "Realm Supplify already exists"
        else
          /opt/keycloak/bin/kcadm.sh create realms -f /import/realm-export.json
          echo "Realm Supplify created"
        fi
        if [ -n "$${PUBLIC_URL:-}" ] && [ "$${PUBLIC_URL}" != "http://localhost" ]; then
          CLIENT_UUID=$$(/opt/keycloak/bin/kcadm.sh get clients -r Supplify \
            -q clientId=supplify-web --fields id 2>/dev/null | \
            sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -1)
          if [ -n "$$CLIENT_UUID" ]; then
            /opt/keycloak/bin/kcadm.sh update "clients/$${CLIENT_UUID}" -r Supplify \
              -s "redirectUris=[\"$${PUBLIC_URL}/*\",\"http://localhost/*\",\"http://localhost:5173/*\"]" \
              -s "webOrigins=[\"$${PUBLIC_URL}\",\"http://localhost\",\"http://localhost:5173\"]"
            echo "Updated Keycloak redirect URIs for $${PUBLIC_URL}"
          fi
        fi
    volumes:
      - ../infra/keycloak/realm-export.json:/import/realm-export.json:ro
    depends_on:
      keycloak:
        condition: service_started
    restart: 'no'
    networks:
      - supplify_dev_net

  migrate:
    image: ${BACKEND_IMAGE:-supplify-backend:dev}
    container_name: supplify-dev-migrate
    env_file: ./env/.env.dev
    environment:
      NODE_ENV: development
      DATABASE_URL: ${DATABASE_URL}
    entrypoint:
      - /bin/sh
      - -c
      - |
        node apps/api/scripts/run-migration.js || { echo "SQL migrations failed"; exit 1; }
        node --input-type=module -e "
        import { ensureStaffAppSchema, ensureReservationsSchema } from './apps/api/src/lib/migrator.js';
        try {
          await ensureStaffAppSchema();
          await ensureReservationsSchema();
          console.log('Runtime schema migrators complete');
        } catch (e) {
          console.error('Runtime migrator failed:', e.message);
          process.exit(1);
        }
        "
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'
    networks:
      - supplify_dev_net

  backend:
    image: ${BACKEND_IMAGE:-supplify-backend:dev}
    container_name: supplify-dev-backend
    env_file: ./env/.env.dev
    environment:
      NODE_ENV: development
      DATABASE_URL: ${DATABASE_URL}
      PORT: ${BACKEND_PORT:-4000}
      WEB_ORIGIN: ${WEB_ORIGIN:-http://localhost}
      SESSION_SECRET: ${SESSION_SECRET}
      KEYCLOAK_BASE_URL: http://keycloak:8080
      KEYCLOAK_REALM: Supplify
      KEYCLOAK_CLIENT_ID: ${KEYCLOAK_CLIENT_ID:-supplify-api}
      KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-changeme}
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: ${S3_BUCKET:-supplify}
      S3_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      S3_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
      keycloak-init:
        condition: service_completed_successfully
      migrate:
        condition: service_completed_successfully
    expose:
      - '${BACKEND_PORT:-4000}'
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'wget -qO- http://127.0.0.1:${BACKEND_PORT:-4000}/health >/dev/null 2>&1 || exit 1',
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_dev_net

  frontend:
    image: ${FRONTEND_IMAGE:-supplify-frontend:dev}
    container_name: supplify-dev-frontend
    expose:
      - '80'
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_dev_net

  nginx:
    image: nginx:alpine
    container_name: supplify-dev-nginx
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - '${HTTP_PORT:-80}:80'
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:80/nginx-health >/dev/null 2>&1 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_dev_net

  autoheal:
    image: willfarrell/autoheal:latest
    container_name: supplify-dev-autoheal
    environment:
      AUTOHEAL_CONTAINER_LABEL: autoheal
      AUTOHEAL_INTERVAL: 10
      AUTOHEAL_START_PERIOD: 30
      AUTOHEAL_DEFAULT_STOP_TIMEOUT: 10
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

  backup:
    image: postgres:16-alpine
    container_name: supplify-dev-backup
    env_file: ./env/.env.dev
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-supplify}
      POSTGRES_USER: ${POSTGRES_USER:-supplify}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      BACKUP_DIR: ${BACKUP_DIR:-/opt/supplify/backups-dev}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-14}
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-supplify-dev}
      AWS_REGION: ${AWS_REGION:-}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:-}
      AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN:-}
    volumes:
      - ${BACKUP_DIR:-/opt/supplify/backups-dev}:/backups
    entrypoint: ['/bin/sh', '-lc']
    command: >
      "apk add --no-cache bash tzdata aws-cli >/dev/null 2>&1 || true;
       echo 'Backup container ready. Use ./deploy/scripts/backup-now.sh to trigger.';
       tail -f /dev/null"
    restart: unless-stopped
    networks:
      - supplify_dev_net

volumes:
  supplify_dev_pgdata:
  supplify_dev_minio:
  supplify_dev_keycloak:

networks:
  supplify_dev_net:
    driver: bridge
```

- [ ] **Step 2: Validate compose syntax**

Create a minimal test env file, then validate:

```bash
cp deploy/env/.env.dev.example /tmp/.env.dev.test
# Fill in required vars so compose can parse substitutions
sed -i 's/change_me/testvalue123/g' /tmp/.env.dev.test
# Point to the test env
docker compose --env-file /tmp/.env.dev.test -f deploy/docker-compose.dev.yml config --quiet
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.dev.yml
git commit -m "feat(deploy): rebuild docker-compose.dev.yml with full stack (redis, minio, keycloak, migrate)"
```

---

## Task 4: Write `deploy/docker-compose.staging.yml` (new file)

**Files:**

- Create: `deploy/docker-compose.staging.yml`

Identical structure to dev but with `staging` substituted throughout for all names, volumes, network, and env file path. NODE_ENV is `production`.

- [ ] **Step 1: Write the file**

```yaml
version: '3.9'

name: supplify-staging

services:
  postgres:
    image: postgres:16-alpine
    container_name: supplify-staging-postgres
    env_file: ./env/.env.staging
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-supplify}
      POSTGRES_USER: ${POSTGRES_USER:-supplify}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - supplify_staging_pgdata:/var/lib/postgresql/data
      - ../infra/db/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'pg_isready -U ${POSTGRES_USER:-supplify} -d ${POSTGRES_DB:-supplify} -h 127.0.0.1',
        ]
      interval: 5s
      timeout: 5s
      retries: 20
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_staging_net

  redis:
    image: redis:7-alpine
    container_name: supplify-staging-redis
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped
    networks:
      - supplify_staging_net

  minio:
    image: minio/minio:latest
    container_name: supplify-staging-minio
    env_file: ./env/.env.staging
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - supplify_staging_minio:/data
    healthcheck:
      test: ['CMD-SHELL', 'curl -sf http://127.0.0.1:9000/minio/health/live || exit 1']
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 10s
    restart: unless-stopped
    networks:
      - supplify_staging_net

  minio-init:
    image: minio/mc:latest
    container_name: supplify-staging-minio-init
    env_file: ./env/.env.staging
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD 2>/dev/null; do sleep 2; done;
      mc mb local/${S3_BUCKET:-supplify} --ignore-existing;
      echo 'MinIO bucket ready';
      "
    depends_on:
      minio:
        condition: service_healthy
    restart: 'no'
    networks:
      - supplify_staging_net

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    container_name: supplify-staging-keycloak
    env_file: ./env/.env.staging
    environment:
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${POSTGRES_USER:-supplify}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
      KC_HOSTNAME_STRICT: 'false'
      KC_HOSTNAME_STRICT_HTTPS: 'false'
      KC_HTTP_ENABLED: 'true'
      KC_HEALTH_ENABLED: 'true'
    command:
      - start-dev
      - --import-realm
    volumes:
      - supplify_staging_keycloak:/opt/keycloak/data
      - ../infra/keycloak/realm-export.json:/opt/keycloak/data/import/Supplify-realm.json:ro
    ports:
      - '${KEYCLOAK_PORT:-8180}:8080'
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - supplify_staging_net

  keycloak-init:
    image: quay.io/keycloak/keycloak:24.0
    container_name: supplify-staging-keycloak-init
    env_file: ./env/.env.staging
    environment:
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      PUBLIC_URL: ${PUBLIC_URL:-http://localhost}
    entrypoint:
      - /bin/bash
      - -ec
      - |
        echo "Waiting for Keycloak admin API..."
        for i in $$(seq 1 90); do
          if /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://keycloak:8080 \
            --realm master \
            --user "$${KEYCLOAK_ADMIN}" \
            --password "$${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
            echo "Keycloak ready"
            break
          fi
          [ "$$i" -eq 90 ] && { echo "Timeout waiting for Keycloak"; exit 1; }
          sleep 2
        done
        if /opt/keycloak/bin/kcadm.sh get realms/Supplify >/dev/null 2>&1; then
          echo "Realm Supplify already exists"
        else
          /opt/keycloak/bin/kcadm.sh create realms -f /import/realm-export.json
          echo "Realm Supplify created"
        fi
        if [ -n "$${PUBLIC_URL:-}" ] && [ "$${PUBLIC_URL}" != "http://localhost" ]; then
          CLIENT_UUID=$$(/opt/keycloak/bin/kcadm.sh get clients -r Supplify \
            -q clientId=supplify-web --fields id 2>/dev/null | \
            sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -1)
          if [ -n "$$CLIENT_UUID" ]; then
            /opt/keycloak/bin/kcadm.sh update "clients/$${CLIENT_UUID}" -r Supplify \
              -s "redirectUris=[\"$${PUBLIC_URL}/*\",\"http://localhost/*\"]" \
              -s "webOrigins=[\"$${PUBLIC_URL}\",\"http://localhost\"]"
            echo "Updated Keycloak redirect URIs for $${PUBLIC_URL}"
          fi
        fi
    volumes:
      - ../infra/keycloak/realm-export.json:/import/realm-export.json:ro
    depends_on:
      keycloak:
        condition: service_started
    restart: 'no'
    networks:
      - supplify_staging_net

  migrate:
    image: ${BACKEND_IMAGE:-supplify-backend:staging}
    container_name: supplify-staging-migrate
    env_file: ./env/.env.staging
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
    entrypoint:
      - /bin/sh
      - -c
      - |
        node apps/api/scripts/run-migration.js || { echo "SQL migrations failed"; exit 1; }
        node --input-type=module -e "
        import { ensureStaffAppSchema, ensureReservationsSchema } from './apps/api/src/lib/migrator.js';
        try {
          await ensureStaffAppSchema();
          await ensureReservationsSchema();
          console.log('Runtime schema migrators complete');
        } catch (e) {
          console.error('Runtime migrator failed:', e.message);
          process.exit(1);
        }
        "
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'
    networks:
      - supplify_staging_net

  backend:
    image: ${BACKEND_IMAGE:-supplify-backend:staging}
    container_name: supplify-staging-backend
    env_file: ./env/.env.staging
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      PORT: ${BACKEND_PORT:-4000}
      WEB_ORIGIN: ${WEB_ORIGIN:-http://localhost}
      SESSION_SECRET: ${SESSION_SECRET}
      KEYCLOAK_BASE_URL: http://keycloak:8080
      KEYCLOAK_REALM: Supplify
      KEYCLOAK_CLIENT_ID: ${KEYCLOAK_CLIENT_ID:-supplify-api}
      KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-changeme}
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: ${S3_BUCKET:-supplify}
      S3_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      S3_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
      keycloak-init:
        condition: service_completed_successfully
      migrate:
        condition: service_completed_successfully
    expose:
      - '${BACKEND_PORT:-4000}'
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'wget -qO- http://127.0.0.1:${BACKEND_PORT:-4000}/health >/dev/null 2>&1 || exit 1',
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_staging_net

  frontend:
    image: ${FRONTEND_IMAGE:-supplify-frontend:staging}
    container_name: supplify-staging-frontend
    expose:
      - '80'
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_staging_net

  nginx:
    image: nginx:alpine
    container_name: supplify-staging-nginx
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - '${HTTP_PORT:-80}:80'
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:80/nginx-health >/dev/null 2>&1 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_staging_net

  autoheal:
    image: willfarrell/autoheal:latest
    container_name: supplify-staging-autoheal
    environment:
      AUTOHEAL_CONTAINER_LABEL: autoheal
      AUTOHEAL_INTERVAL: 10
      AUTOHEAL_START_PERIOD: 30
      AUTOHEAL_DEFAULT_STOP_TIMEOUT: 10
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

  backup:
    image: postgres:16-alpine
    container_name: supplify-staging-backup
    env_file: ./env/.env.staging
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-supplify}
      POSTGRES_USER: ${POSTGRES_USER:-supplify}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      BACKUP_DIR: ${BACKUP_DIR:-/opt/supplify/backups-staging}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-14}
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-supplify-staging}
      AWS_REGION: ${AWS_REGION:-}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:-}
      AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN:-}
    volumes:
      - ${BACKUP_DIR:-/opt/supplify/backups-staging}:/backups
    entrypoint: ['/bin/sh', '-lc']
    command: >
      "apk add --no-cache bash tzdata aws-cli >/dev/null 2>&1 || true;
       echo 'Backup container ready. Use ./deploy/scripts/backup-now.sh to trigger.';
       tail -f /dev/null"
    restart: unless-stopped
    networks:
      - supplify_staging_net

volumes:
  supplify_staging_pgdata:
  supplify_staging_minio:
  supplify_staging_keycloak:

networks:
  supplify_staging_net:
    driver: bridge
```

- [ ] **Step 2: Validate compose syntax**

```bash
cp deploy/env/.env.staging.example /tmp/.env.staging.test
sed -i 's/change_me/testvalue123/g' /tmp/.env.staging.test
docker compose --env-file /tmp/.env.staging.test -f deploy/docker-compose.staging.yml config --quiet
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.staging.yml
git commit -m "feat(deploy): add docker-compose.staging.yml with full stack"
```

---

## Task 5: Replace `deploy/docker-compose.prod.yml`

**Files:**

- Replace: `deploy/docker-compose.prod.yml`

Same structure as staging but uses `prod` throughout (no suffix on volumes/network for prod), `POSTGRES_USER:-supplify` defaults, prod image tags, and backup dir `/opt/supplify/backups`.

- [ ] **Step 1: Write the file**

```yaml
version: '3.9'

name: supplify

services:
  postgres:
    image: postgres:16-alpine
    container_name: supplify-postgres
    env_file: ./env/.env.prod
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-supplify}
      POSTGRES_USER: ${POSTGRES_USER:-supplify}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - supplify_pgdata:/var/lib/postgresql/data
      - ../infra/db/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'pg_isready -U ${POSTGRES_USER:-supplify} -d ${POSTGRES_DB:-supplify} -h 127.0.0.1',
        ]
      interval: 5s
      timeout: 5s
      retries: 20
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_net

  redis:
    image: redis:7-alpine
    container_name: supplify-redis
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped
    networks:
      - supplify_net

  minio:
    image: minio/minio:latest
    container_name: supplify-minio
    env_file: ./env/.env.prod
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"
    ports:
      - '9000:9000'
      - '9001:9001'
    volumes:
      - supplify_minio:/data
    healthcheck:
      test: ['CMD-SHELL', 'curl -sf http://127.0.0.1:9000/minio/health/live || exit 1']
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 10s
    restart: unless-stopped
    networks:
      - supplify_net

  minio-init:
    image: minio/mc:latest
    container_name: supplify-minio-init
    env_file: ./env/.env.prod
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    entrypoint: >
      /bin/sh -c "
      until mc alias set local http://minio:9000 $$MINIO_ROOT_USER $$MINIO_ROOT_PASSWORD 2>/dev/null; do sleep 2; done;
      mc mb local/${S3_BUCKET:-supplify} --ignore-existing;
      echo 'MinIO bucket ready';
      "
    depends_on:
      minio:
        condition: service_healthy
    restart: 'no'
    networks:
      - supplify_net

  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    container_name: supplify-keycloak
    env_file: ./env/.env.prod
    environment:
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: ${POSTGRES_USER:-supplify}
      KC_DB_PASSWORD: ${POSTGRES_PASSWORD}
      KC_HOSTNAME_STRICT: 'false'
      KC_HOSTNAME_STRICT_HTTPS: 'false'
      KC_HTTP_ENABLED: 'true'
      KC_HEALTH_ENABLED: 'true'
    command:
      - start-dev
      - --import-realm
    volumes:
      - supplify_keycloak:/opt/keycloak/data
      - ../infra/keycloak/realm-export.json:/opt/keycloak/data/import/Supplify-realm.json:ro
    ports:
      - '${KEYCLOAK_PORT:-8180}:8080'
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - supplify_net

  keycloak-init:
    image: quay.io/keycloak/keycloak:24.0
    container_name: supplify-keycloak-init
    env_file: ./env/.env.prod
    environment:
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN:-admin}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      PUBLIC_URL: ${PUBLIC_URL:-http://localhost}
    entrypoint:
      - /bin/bash
      - -ec
      - |
        echo "Waiting for Keycloak admin API..."
        for i in $$(seq 1 90); do
          if /opt/keycloak/bin/kcadm.sh config credentials \
            --server http://keycloak:8080 \
            --realm master \
            --user "$${KEYCLOAK_ADMIN}" \
            --password "$${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
            echo "Keycloak ready"
            break
          fi
          [ "$$i" -eq 90 ] && { echo "Timeout waiting for Keycloak"; exit 1; }
          sleep 2
        done
        if /opt/keycloak/bin/kcadm.sh get realms/Supplify >/dev/null 2>&1; then
          echo "Realm Supplify already exists"
        else
          /opt/keycloak/bin/kcadm.sh create realms -f /import/realm-export.json
          echo "Realm Supplify created"
        fi
        if [ -n "$${PUBLIC_URL:-}" ] && [ "$${PUBLIC_URL}" != "http://localhost" ]; then
          CLIENT_UUID=$$(/opt/keycloak/bin/kcadm.sh get clients -r Supplify \
            -q clientId=supplify-web --fields id 2>/dev/null | \
            sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -1)
          if [ -n "$$CLIENT_UUID" ]; then
            /opt/keycloak/bin/kcadm.sh update "clients/$${CLIENT_UUID}" -r Supplify \
              -s "redirectUris=[\"$${PUBLIC_URL}/*\",\"http://localhost/*\"]" \
              -s "webOrigins=[\"$${PUBLIC_URL}\",\"http://localhost\"]"
            echo "Updated Keycloak redirect URIs for $${PUBLIC_URL}"
          fi
        fi
    volumes:
      - ../infra/keycloak/realm-export.json:/import/realm-export.json:ro
    depends_on:
      keycloak:
        condition: service_started
    restart: 'no'
    networks:
      - supplify_net

  migrate:
    image: ${BACKEND_IMAGE:-supplify-backend:prod}
    container_name: supplify-migrate
    env_file: ./env/.env.prod
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
    entrypoint:
      - /bin/sh
      - -c
      - |
        node apps/api/scripts/run-migration.js || { echo "SQL migrations failed"; exit 1; }
        node --input-type=module -e "
        import { ensureStaffAppSchema, ensureReservationsSchema } from './apps/api/src/lib/migrator.js';
        try {
          await ensureStaffAppSchema();
          await ensureReservationsSchema();
          console.log('Runtime schema migrators complete');
        } catch (e) {
          console.error('Runtime migrator failed:', e.message);
          process.exit(1);
        }
        "
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'
    networks:
      - supplify_net

  backend:
    image: ${BACKEND_IMAGE:-supplify-backend:prod}
    container_name: supplify-backend
    env_file: ./env/.env.prod
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      PORT: ${BACKEND_PORT:-4000}
      WEB_ORIGIN: ${WEB_ORIGIN:-http://localhost}
      SESSION_SECRET: ${SESSION_SECRET}
      KEYCLOAK_BASE_URL: http://keycloak:8080
      KEYCLOAK_REALM: Supplify
      KEYCLOAK_CLIENT_ID: ${KEYCLOAK_CLIENT_ID:-supplify-api}
      KEYCLOAK_CLIENT_SECRET: ${KEYCLOAK_CLIENT_SECRET:-changeme}
      S3_ENDPOINT: http://minio:9000
      S3_BUCKET: ${S3_BUCKET:-supplify}
      S3_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      S3_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
      keycloak-init:
        condition: service_completed_successfully
      migrate:
        condition: service_completed_successfully
    expose:
      - '${BACKEND_PORT:-4000}'
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'wget -qO- http://127.0.0.1:${BACKEND_PORT:-4000}/health >/dev/null 2>&1 || exit 1',
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_net

  frontend:
    image: ${FRONTEND_IMAGE:-supplify-frontend:prod}
    container_name: supplify-frontend
    expose:
      - '80'
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_net

  nginx:
    image: nginx:alpine
    container_name: supplify-nginx
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - '${HTTP_PORT:-80}:80'
    depends_on:
      backend:
        condition: service_healthy
      frontend:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://127.0.0.1:80/nginx-health >/dev/null 2>&1 || exit 1']
      interval: 10s
      timeout: 5s
      retries: 12
    restart: unless-stopped
    labels:
      - 'autoheal=true'
    networks:
      - supplify_net

  autoheal:
    image: willfarrell/autoheal:latest
    container_name: supplify-autoheal
    environment:
      AUTOHEAL_CONTAINER_LABEL: autoheal
      AUTOHEAL_INTERVAL: 10
      AUTOHEAL_START_PERIOD: 30
      AUTOHEAL_DEFAULT_STOP_TIMEOUT: 10
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

  backup:
    image: postgres:16-alpine
    container_name: supplify-backup
    env_file: ./env/.env.prod
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-supplify}
      POSTGRES_USER: ${POSTGRES_USER:-supplify}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      BACKUP_DIR: ${BACKUP_DIR:-/opt/supplify/backups}
      BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-14}
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-supplify}
      AWS_REGION: ${AWS_REGION:-}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID:-}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY:-}
      AWS_SESSION_TOKEN: ${AWS_SESSION_TOKEN:-}
    volumes:
      - ${BACKUP_DIR:-/opt/supplify/backups}:/backups
    entrypoint: ['/bin/sh', '-lc']
    command: >
      "apk add --no-cache bash tzdata aws-cli >/dev/null 2>&1 || true;
       echo 'Backup container ready. Use ./deploy/scripts/backup-now.sh to trigger.';
       tail -f /dev/null"
    restart: unless-stopped
    networks:
      - supplify_net

volumes:
  supplify_pgdata:
  supplify_minio:
  supplify_keycloak:

networks:
  supplify_net:
    driver: bridge
```

- [ ] **Step 2: Validate compose syntax**

```bash
cp deploy/env/.env.prod.example /tmp/.env.prod.test
sed -i 's/change_me/testvalue123/g' /tmp/.env.prod.test
docker compose --env-file /tmp/.env.prod.test -f deploy/docker-compose.prod.yml config --quiet
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.prod.yml
git commit -m "feat(deploy): rebuild docker-compose.prod.yml with full stack (redis, minio, keycloak, migrate)"
```

---

## Task 6: Write `deploy/scripts/deploy-dev.sh`

**Files:**

- Create: `deploy/scripts/deploy-dev.sh`

This is the complete one-command dev deploy. It sources `_common.sh` for shared helpers. All 6 phases run in sequence. Must be run as root or sudo on the EC2 instance after cloning the repo.

- [ ] **Step 1: Write the file**

```bash
#!/usr/bin/env bash
# One-command dev deploy. Run as root (or sudo) from the repo root:
#   sudo ./deploy/scripts/deploy-dev.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV="dev"
ENV_FILE="$REPO_ROOT/deploy/env/.env.dev"
ENV_EXAMPLE="$REPO_ROOT/deploy/env/.env.dev.example"
COMPOSE_FILE="$REPO_ROOT/deploy/docker-compose.dev.yml"
BACKEND_IMAGE="supplify-backend:dev"
FRONTEND_IMAGE="supplify-frontend:dev"
COMPOSE_CMD="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"

# shellcheck source=_common.sh
source "$SCRIPT_DIR/_common.sh"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Supplify — Dev Deploy                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Phase 1: Bootstrap ────────────────────────────────────────────────────────
echo "▶ Phase 1: Bootstrap"
install_docker
ensure_swap

# ── Phase 2: Environment setup ───────────────────────────────────────────────
echo ""
echo "▶ Phase 2: Environment setup"
mkdir -p "$REPO_ROOT/deploy/env" "${BACKUP_DIR:-/opt/supplify/backups-dev}"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  PG_PASS=$(gen_secret)
  SESSION_SEC=$(gen_secret)
  MINIO_PASS=$(gen_secret)
  KC_PASS=$(gen_secret)

  # Auto-detect public IP from EC2 metadata, fall back to hostname -I
  PUBLIC_IP=$(curl -sf --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
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

# Always update image names in env file
sed -i \
  -e "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${BACKEND_IMAGE}|" \
  -e "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${FRONTEND_IMAGE}|" \
  "$ENV_FILE"

# Load env for use in this script
set -a && source "$ENV_FILE" && set +a

if [ "${PUBLIC_URL:-http://localhost}" = "http://localhost" ]; then
  echo "  WARN: PUBLIC_URL is http://localhost — Keycloak logins will not work from a browser."
  echo "  Set PUBLIC_URL in $ENV_FILE and re-run."
fi

# Create backup dir
mkdir -p "${BACKUP_DIR:-/opt/supplify/backups-dev}"

# ── Phase 3: Build images ─────────────────────────────────────────────────────
echo ""
echo "▶ Phase 3: Building Docker images"
cd "$REPO_ROOT"

echo "  Building backend (supplify-backend:dev)..."
docker build -t "$BACKEND_IMAGE" -f apps/api/Dockerfile .

echo "  Building frontend (supplify-frontend:dev)..."
docker build -t "$FRONTEND_IMAGE" -f apps/web/Dockerfile \
  --build-arg "VITE_API_URL=${VITE_API_URL:-${PUBLIC_URL:-http://localhost}}" \
  --build-arg "VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL:-http://localhost:8180}" \
  --build-arg "VITE_KEYCLOAK_REALM=Supplify" \
  .

# ── Phase 4: Start infrastructure ────────────────────────────────────────────
echo ""
echo "▶ Phase 4: Starting infrastructure (postgres, redis, minio, keycloak)"
$COMPOSE_CMD up -d postgres redis minio keycloak

wait_healthy "supplify-dev-postgres" 60 3
wait_healthy "supplify-dev-redis"    30 3
wait_healthy "supplify-dev-minio"    60 3
# Keycloak may take up to 3 minutes on first boot — keycloak-init polls it internally

# ── Phase 5: Init & migrate ──────────────────────────────────────────────────
echo ""
echo "▶ Phase 5: Initialising MinIO, Keycloak, and running migrations"

echo "  Running minio-init..."
$COMPOSE_CMD run --rm minio-init

echo "  Running keycloak-init (this can take 2–3 minutes on first boot)..."
$COMPOSE_CMD run --rm keycloak-init

echo "  Running database migrations (54 SQL files + runtime migrators)..."
$COMPOSE_CMD run --rm migrate

# ── Phase 6: Start application ───────────────────────────────────────────────
echo ""
echo "▶ Phase 6: Starting application (backend, frontend, nginx, autoheal, backup)"
$COMPOSE_CMD up -d backend frontend nginx autoheal backup

echo ""
echo "  Waiting for backend to be healthy..."
wait_healthy "supplify-dev-backend"  60 5
echo "  Waiting for nginx to be healthy..."
wait_healthy "supplify-dev-nginx"    30 3

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Dev deploy complete!                   ║"
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
timeout 20 $COMPOSE_CMD logs -f --tail=10 2>/dev/null || true
```

- [ ] **Step 2: Validate script syntax**

```bash
bash -n deploy/scripts/deploy-dev.sh
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add deploy/scripts/deploy-dev.sh
git commit -m "feat(deploy): add deploy-dev.sh — one-command dev EC2 deploy"
```

---

## Task 7: Write `deploy/scripts/deploy-staging.sh`

**Files:**

- Create: `deploy/scripts/deploy-staging.sh`

Identical to `deploy-dev.sh` with `dev` → `staging` substituted throughout. Image tags use `:staging`. NODE_ENV is `production` (set in compose, not in the script).

- [ ] **Step 1: Write the file**

```bash
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
COMPOSE_CMD="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"

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
mkdir -p "$REPO_ROOT/deploy/env" "${BACKUP_DIR:-/opt/supplify/backups-staging}"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  PG_PASS=$(gen_secret)
  SESSION_SEC=$(gen_secret)
  MINIO_PASS=$(gen_secret)
  KC_PASS=$(gen_secret)

  PUBLIC_IP=$(curl -sf --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
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

set -a && source "$ENV_FILE" && set +a

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
$COMPOSE_CMD up -d postgres redis minio keycloak

wait_healthy "supplify-staging-postgres" 60 3
wait_healthy "supplify-staging-redis"    30 3
wait_healthy "supplify-staging-minio"    60 3

# ── Phase 5: Init & migrate ──────────────────────────────────────────────────
echo ""
echo "▶ Phase 5: Initialising MinIO, Keycloak, and running migrations"

echo "  Running minio-init..."
$COMPOSE_CMD run --rm minio-init

echo "  Running keycloak-init (this can take 2–3 minutes on first boot)..."
$COMPOSE_CMD run --rm keycloak-init

echo "  Running database migrations (54 SQL files + runtime migrators)..."
$COMPOSE_CMD run --rm migrate

# ── Phase 6: Start application ───────────────────────────────────────────────
echo ""
echo "▶ Phase 6: Starting application (backend, frontend, nginx, autoheal, backup)"
$COMPOSE_CMD up -d backend frontend nginx autoheal backup

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
timeout 20 $COMPOSE_CMD logs -f --tail=10 2>/dev/null || true
```

- [ ] **Step 2: Validate syntax**

```bash
bash -n deploy/scripts/deploy-staging.sh
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add deploy/scripts/deploy-staging.sh
git commit -m "feat(deploy): add deploy-staging.sh — one-command staging EC2 deploy"
```

---

## Task 8: Write `deploy/scripts/deploy-prod.sh`

**Files:**

- Create: `deploy/scripts/deploy-prod.sh`

Same as staging but uses `prod` image tags and container names (no suffix). Adds a mandatory pre-flight check that warns if PUBLIC_URL is still localhost.

- [ ] **Step 1: Write the file**

```bash
#!/usr/bin/env bash
# One-command production deploy. Run as root (or sudo) from the repo root:
#   sudo ./deploy/scripts/deploy-prod.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV="prod"
ENV_FILE="$REPO_ROOT/deploy/env/.env.prod"
ENV_EXAMPLE="$REPO_ROOT/deploy/env/.env.prod.example"
COMPOSE_FILE="$REPO_ROOT/deploy/docker-compose.prod.yml"
BACKEND_IMAGE="supplify-backend:prod"
FRONTEND_IMAGE="supplify-frontend:prod"
COMPOSE_CMD="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"

# shellcheck source=_common.sh
source "$SCRIPT_DIR/_common.sh"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Supplify — Production Deploy           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Phase 1: Bootstrap ────────────────────────────────────────────────────────
echo "▶ Phase 1: Bootstrap"
install_docker
ensure_swap

# ── Phase 2: Environment setup ───────────────────────────────────────────────
echo ""
echo "▶ Phase 2: Environment setup"
mkdir -p "$REPO_ROOT/deploy/env" "${BACKUP_DIR:-/opt/supplify/backups}"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  PG_PASS=$(gen_secret)
  SESSION_SEC=$(gen_secret)
  MINIO_PASS=$(gen_secret)
  KC_PASS=$(gen_secret)

  PUBLIC_IP=$(curl -sf --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null \
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
  echo "  Edit $ENV_FILE to use your domain, then re-run this script."
fi

sed -i \
  -e "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${BACKEND_IMAGE}|" \
  -e "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${FRONTEND_IMAGE}|" \
  "$ENV_FILE"

set -a && source "$ENV_FILE" && set +a

# Production pre-flight: hard fail if POSTGRES_PASSWORD is still placeholder
if [ "${POSTGRES_PASSWORD:-change_me}" = "change_me" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "ERROR: POSTGRES_PASSWORD is not set in $ENV_FILE"
  echo "       Run bootstrap to auto-generate, or set it manually."
  exit 1
fi

if [ "${PUBLIC_URL:-http://localhost}" = "http://localhost" ]; then
  echo "  WARN: PUBLIC_URL is http://localhost — Keycloak logins will not work."
  echo "  Set PUBLIC_URL in $ENV_FILE and re-run."
fi

mkdir -p "${BACKUP_DIR:-/opt/supplify/backups}"

# ── Phase 3: Build images ─────────────────────────────────────────────────────
echo ""
echo "▶ Phase 3: Building Docker images"
cd "$REPO_ROOT"

echo "  Building backend (supplify-backend:prod)..."
docker build -t "$BACKEND_IMAGE" -f apps/api/Dockerfile .

echo "  Building frontend (supplify-frontend:prod)..."
docker build -t "$FRONTEND_IMAGE" -f apps/web/Dockerfile \
  --build-arg "VITE_API_URL=${VITE_API_URL:-${PUBLIC_URL:-http://localhost}}" \
  --build-arg "VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL:-http://localhost:8180}" \
  --build-arg "VITE_KEYCLOAK_REALM=Supplify" \
  .

# ── Phase 4: Start infrastructure ────────────────────────────────────────────
echo ""
echo "▶ Phase 4: Starting infrastructure (postgres, redis, minio, keycloak)"
$COMPOSE_CMD up -d postgres redis minio keycloak

wait_healthy "supplify-postgres" 60 3
wait_healthy "supplify-redis"    30 3
wait_healthy "supplify-minio"    60 3

# ── Phase 5: Init & migrate ──────────────────────────────────────────────────
echo ""
echo "▶ Phase 5: Initialising MinIO, Keycloak, and running migrations"

echo "  Running minio-init..."
$COMPOSE_CMD run --rm minio-init

echo "  Running keycloak-init (this can take 2–3 minutes on first boot)..."
$COMPOSE_CMD run --rm keycloak-init

echo "  Running database migrations (54 SQL files + runtime migrators)..."
$COMPOSE_CMD run --rm migrate

# ── Phase 6: Start application ───────────────────────────────────────────────
echo ""
echo "▶ Phase 6: Starting application (backend, frontend, nginx, autoheal, backup)"
$COMPOSE_CMD up -d backend frontend nginx autoheal backup

echo ""
echo "  Waiting for backend to be healthy..."
wait_healthy "supplify-backend" 60 5
echo "  Waiting for nginx to be healthy..."
wait_healthy "supplify-nginx"   30 3

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Production deploy complete!            ║"
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
timeout 20 $COMPOSE_CMD logs -f --tail=10 2>/dev/null || true
```

- [ ] **Step 2: Validate syntax**

```bash
bash -n deploy/scripts/deploy-prod.sh
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add deploy/scripts/deploy-prod.sh
git commit -m "feat(deploy): add deploy-prod.sh — one-command production EC2 deploy"
```

---

## Task 9: Final wiring — permissions, full syntax validation, and push

**Files:**

- Modify: `deploy/scripts/deploy-dev.sh` (chmod)
- Modify: `deploy/scripts/deploy-staging.sh` (chmod)
- Modify: `deploy/scripts/deploy-prod.sh` (chmod)
- Modify: `deploy/scripts/_common.sh` (chmod)

- [ ] **Step 1: Make all scripts executable**

```bash
chmod +x deploy/scripts/_common.sh
chmod +x deploy/scripts/deploy-dev.sh
chmod +x deploy/scripts/deploy-staging.sh
chmod +x deploy/scripts/deploy-prod.sh
```

- [ ] **Step 2: Verify git tracks the executable bits**

```bash
git ls-files --stage deploy/scripts/deploy-dev.sh deploy/scripts/deploy-staging.sh deploy/scripts/deploy-prod.sh deploy/scripts/_common.sh
```

Expected: each line starts with `100755` (executable). If any show `100644`, the chmod wasn't captured by git — run `git update-index --chmod=+x deploy/scripts/deploy-dev.sh` etc.

- [ ] **Step 3: Run full syntax validation on all new files**

```bash
for f in deploy/scripts/_common.sh deploy/scripts/deploy-dev.sh deploy/scripts/deploy-staging.sh deploy/scripts/deploy-prod.sh; do
  echo -n "Checking $f ... "
  bash -n "$f" && echo "OK"
done
```

Expected output:

```
Checking deploy/scripts/_common.sh ... OK
Checking deploy/scripts/deploy-dev.sh ... OK
Checking deploy/scripts/deploy-staging.sh ... OK
Checking deploy/scripts/deploy-prod.sh ... OK
```

- [ ] **Step 4: Validate all three compose files**

Create minimal env files with placeholder values and run `docker compose config` on each:

```bash
for env in dev staging prod; do
  cp deploy/env/.env.${env}.example /tmp/.env.${env}.test
  sed -i 's/change_me/testvalue123/g' /tmp/.env.${env}.test
  echo -n "Validating docker-compose.${env}.yml ... "
  docker compose \
    --env-file /tmp/.env.${env}.test \
    -f deploy/docker-compose.${env}.yml \
    config --quiet \
    && echo "OK"
done
```

Expected output:

```
Validating docker-compose.dev.yml ... OK
Validating docker-compose.staging.yml ... OK
Validating docker-compose.prod.yml ... OK
```

- [ ] **Step 5: Commit**

```bash
git add deploy/scripts/
git add deploy/docker-compose.dev.yml deploy/docker-compose.staging.yml deploy/docker-compose.prod.yml
git add deploy/env/.env.dev.example deploy/env/.env.staging.example deploy/env/.env.prod.example
git commit -m "feat(deploy): single-command EC2 deploy for dev/staging/prod — all services included"
```

---

## Spec Coverage Checklist

| Requirement                                  | Task                                                            |
| -------------------------------------------- | --------------------------------------------------------------- |
| One script per environment                   | Tasks 6, 7, 8                                                   |
| dev/staging/prod environments                | Tasks 3, 4, 5, 6, 7, 8                                          |
| Separate EC2 instances (standard ports)      | All compose files — port 80, 8180, 9000 on all                  |
| Full stack: postgres, redis, minio, keycloak | Tasks 3, 4, 5                                                   |
| DB init (keycloak DB + api_user role)        | Tasks 3, 4, 5 — `infra/db/init.sql` mounted                     |
| Keycloak realm import on first run           | Tasks 3, 4, 5 — `--import-realm` + keycloak-init                |
| Keycloak redirect URIs updated to PUBLIC_URL | Tasks 3, 4, 5 — keycloak-init kcadm.sh update                   |
| All 54 SQL migrations                        | Tasks 3, 4, 5 — run-migration.js                                |
| Runtime migrators (0033–0037)                | Tasks 3, 4, 5 — ensureStaffAppSchema + ensureReservationsSchema |
| MinIO bucket creation                        | Tasks 3, 4, 5 — minio-init                                      |
| Auto-generated secrets on first run          | Tasks 6, 7, 8 — gen_secret                                      |
| Auto-detect EC2 public IP                    | Tasks 6, 7, 8 — EC2 metadata URL                                |
| Docker install if missing                    | Tasks 1, 6, 7, 8 — install_docker                               |
| 4GB swap if low RAM                          | Tasks 1, 6, 7, 8 — ensure_swap                                  |
| Health polling before proceeding             | Tasks 1, 6, 7, 8 — wait_healthy                                 |
| Idempotent re-runs                           | Compose `up -d` + init containers idempotent                    |
| autoheal + backup sidecar                    | Tasks 3, 4, 5                                                   |
| Shared bootstrap helpers                     | Task 1                                                          |
