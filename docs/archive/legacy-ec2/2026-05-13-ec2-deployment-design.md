# EC2 Single-Command Deployment — Design Spec

> **Archived — legacy only.** Supplify production hosting uses **Railway** ([railway-environments.md](../../deployment/railway-environments.md)). This spec is not the current deploy path.

**Date:** 2026-05-13  
**Status:** Archived (superseded by Railway)

---

## Problem

The existing `deploy/docker-compose.prod.yml` (and dev/preprod variants) are incomplete — they are missing Redis, MinIO, and Keycloak. The only fully working stack definition is the root `docker-compose.yml` (local dev only). Additionally, there are no deploy scripts for dev or staging environments, and Keycloak realm creation does not exist in any deploy compose file.

---

## Goal

One command deploys the full Supplify stack on any EC2 instance for any environment. Dev, staging, and prod each run on their own EC2 instance. All services start, all migrations run, and Keycloak realm is created automatically.

---

## Architecture

### Three separate EC2 instances

Each environment (dev, staging, prod) runs on its own EC2 instance. No port conflicts, no shared state. Standard ports on all instances (80, 8180, 9000, 5432, 6379).

### One script per environment

```
./deploy/scripts/deploy-dev.sh
./deploy/scripts/deploy-staging.sh
./deploy/scripts/deploy-prod.sh
```

Each script is fully self-contained. It bootstraps Docker, sets up the env file, builds images, and starts the full stack. Run it on the EC2 instance after cloning the repo (or via user-data).

### Shared bootstrap logic

`deploy/scripts/_common.sh` — sourced by all three scripts. Contains only:

- Docker + Compose install (idempotent)
- Swap file creation (idempotent)
- Secret generation helper (`gen_secret`)

---

## File Layout

### New / replaced files

```
deploy/
  scripts/
    deploy-dev.sh            NEW — full dev deploy (one command)
    deploy-staging.sh        NEW — full staging deploy
    deploy-prod.sh           NEW — full prod deploy
    _common.sh               NEW — shared bootstrap helpers
  docker-compose.dev.yml     REPLACED — now contains all services
  docker-compose.staging.yml NEW — full stack (replaces preprod)
  docker-compose.prod.yml    REPLACED — now contains all services
  env/
    .env.dev.example         REPLACED — complete with all vars
    .env.staging.example     NEW
    .env.prod.example        REPLACED — complete with all vars
  nginx/nginx.conf           UNCHANGED
```

Existing `deploy/ec2/bootstrap.sh` and `deploy/ec2/deploy.sh` are kept for reference but superseded.

---

## Full Stack (all three environments)

Every compose file contains all of these services:

| Service       | Image                          | Purpose                                     |
| ------------- | ------------------------------ | ------------------------------------------- |
| postgres      | postgres:16-alpine             | Primary DB + Keycloak DB (via init.sql)     |
| redis         | redis:7-alpine                 | Session store, cache                        |
| minio         | minio/minio:latest             | S3-compatible object storage                |
| minio-init    | minio/mc:latest                | Creates `supplify` bucket on first run      |
| keycloak      | quay.io/keycloak/keycloak:24.0 | Identity provider                           |
| keycloak-init | quay.io/keycloak/keycloak:24.0 | Imports realm + fixes redirect URIs         |
| migrate       | backend image                  | Runs all SQL migrations + runtime migrators |
| backend       | supplify-backend:{env}         | API server                                  |
| frontend      | supplify-frontend:{env}        | Nginx serving React SPA                     |
| nginx         | nginx:alpine                   | Reverse proxy on port 80                    |
| autoheal      | willfarrell/autoheal           | Auto-restarts unhealthy containers          |
| backup        | postgres:16-alpine             | pg_dump sidecar                             |

### Critical fix: DB init

`postgres` mounts `infra/db/init.sql` as an init script in all compose files. This:

- Creates the `keycloak` database (Keycloak won't start without it)
- Creates the `api_user` role (SQL migrations reference it in GRANT statements)

This was missing from all existing deploy compose files and caused silent failures.

---

## Deploy Script Phases

Each `deploy-{env}.sh` runs these phases in order:

### Phase 1 — Bootstrap (idempotent)

- Install system packages via apt/dnf/yum
- Install Docker + Compose plugin via `get.docker.com` (skipped if present)
- Add current user to `docker` group
- Create 4 GB swap if RAM < 8 GB (skipped if exists)

### Phase 2 — Environment setup

- Look for `deploy/env/.env.{env}`
- If missing: copy from `.env.{env}.example`, auto-generate secrets:
  - `POSTGRES_PASSWORD`, `SESSION_SECRET`, `MINIO_ROOT_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD` via `openssl rand -hex 32`
  - Detect EC2 public IP from instance metadata if `PUBLIC_URL` not set
  - Auto-derive `VITE_API_URL`, `VITE_KEYCLOAK_URL`, `WEB_ORIGIN` from `PUBLIC_URL`
- Validate `PUBLIC_URL` is not still `http://localhost` (warn if so, don't block)
- Source the env file for subsequent steps

### Phase 3 — Build images

- `docker build` backend: `apps/api/Dockerfile`
- `docker build` frontend: `apps/web/Dockerfile` with `--build-arg VITE_API_URL VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM=Supplify`

### Phase 4 — Start infra

- `docker compose up -d postgres redis minio keycloak`
- Poll health checks: wait for postgres, redis, minio, keycloak to be healthy before proceeding

### Phase 5 — Init & migrate

- `docker compose run --rm minio-init` — creates bucket (idempotent)
- `docker compose run --rm keycloak-init` — imports realm if missing, patches `supplify-web` client redirect URIs to `PUBLIC_URL` via `kcadm.sh`
- `docker compose run --rm migrate` — runs all 54 SQL migrations + `ensureStaffAppSchema()` + `ensureReservationsSchema()` from `migrator.js`

### Phase 6 — Start app

- `docker compose up -d backend frontend nginx autoheal backup`
- Tail logs for 15 seconds
- Print app URL

### On re-run / update

Script detects existing `.env` file, skips secret generation, rebuilds images, re-runs migrations (idempotent via `schema_migrations` table), restarts containers.

---

## Keycloak Realm Handling

The `keycloak-init` container:

1. Waits for Keycloak to be ready (polls `kcadm.sh config credentials`, up to 90s)
2. Checks if `Supplify` realm exists
3. If not: creates it from `infra/keycloak/realm-export.json`
4. Updates `supplify-web` client `redirectUris` and `webOrigins` to include `${PUBLIC_URL}/*`

This means the realm export needs no templating — the init container patches it live after import.

---

## Migration Completeness

The `migrate` container entrypoint runs:

```sh
node apps/api/scripts/run-migration.js   # all 54 SQL files, skips applied ones
node --input-type=module -e "
  import { ensureStaffAppSchema, ensureReservationsSchema } from './apps/api/src/lib/migrator.js';
  await ensureStaffAppSchema();
  await ensureReservationsSchema();
"
```

This matches exactly what the root `docker-compose.yml` migrate service does. All 54 migrations (0000–0054) plus runtime migrators for migrations 0033–0037 (reservations, staff app, portal support).

---

## Environment Differences

|                      | dev                      | staging                      | prod                      |
| -------------------- | ------------------------ | ---------------------------- | ------------------------- |
| Script               | `deploy-dev.sh`          | `deploy-staging.sh`          | `deploy-prod.sh`          |
| Compose              | `docker-compose.dev.yml` | `docker-compose.staging.yml` | `docker-compose.prod.yml` |
| Env file             | `.env.dev`               | `.env.staging`               | `.env.prod`               |
| `NODE_ENV`           | development              | production                   | production                |
| Image tags           | `:dev`                   | `:staging`                   | `:prod`                   |
| Compose project name | `supplify-dev`           | `supplify-staging`           | `supplify`                |
| Volume suffix        | `_dev`                   | `_staging`                   | (none)                    |

---

## Env File Variables (all environments)

```
# Required — filled automatically by script on first run
POSTGRES_PASSWORD
SESSION_SECRET
MINIO_ROOT_PASSWORD
KEYCLOAK_ADMIN_PASSWORD

# Required — set by user or auto-detected from EC2 metadata
PUBLIC_URL                 # e.g. https://app.supplify.com

# Auto-derived from PUBLIC_URL by script
VITE_API_URL
VITE_KEYCLOAK_URL          # PUBLIC_URL + /auth (via nginx proxy) or :8180
WEB_ORIGIN

# Database
POSTGRES_DB=supplify
POSTGRES_USER=supplify
DATABASE_URL               # auto-built from POSTGRES_PASSWORD

# Keycloak
KEYCLOAK_ADMIN=admin
KEYCLOAK_CLIENT_SECRET=changeme   # update for prod

# MinIO / S3
MINIO_ROOT_USER=minioadmin
S3_BUCKET=supplify
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY              # = MINIO_ROOT_USER
S3_SECRET_KEY              # = MINIO_ROOT_PASSWORD

# Redis
REDIS_URL=redis://redis:6379

# Images (set by deploy script)
BACKEND_IMAGE=supplify-backend:{env}
FRONTEND_IMAGE=supplify-frontend:{env}

# Ports
BACKEND_PORT=4000
HTTP_PORT=80
KEYCLOAK_PORT=8180

# Backup
BACKUP_RETENTION_DAYS=14
BACKUP_S3_BUCKET=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## What Is NOT Changed

- `docker-compose.yml` (root) — local dev stack, untouched
- `apps/api/Dockerfile` — untouched
- `apps/web/Dockerfile` — untouched
- `apps/api/scripts/run-migration.js` — untouched
- `apps/api/src/lib/migrator.js` — untouched
- `infra/keycloak/realm-export.json` — untouched
- `infra/db/init.sql` — untouched
- `deploy/nginx/nginx.conf` — untouched
- All existing utility scripts (`start.sh`, `stop.sh`, `logs.sh`, etc.) — untouched
- `deploy/ec2/bootstrap.sh`, `deploy/ec2/deploy.sh` — kept for reference
