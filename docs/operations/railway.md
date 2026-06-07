# Deploying Supplify on Railway

**Multi-environment guide (dev / preprod / prod):** [railway-environments.md](./railway-environments.md)  
**Variable reference:** [environment-variables.md](./environment-variables.md) · [env-matrix.md](./env-matrix.md)

This page is a quick single-service overview. **AWS CDK and GitHub Actions CI were removed**; use Railway for deploys.

## Monorepo (pnpm workspace)

Supplify is a **shared monorepo**: `pnpm-lock.yaml` and `pnpm-workspace.yaml` live at the repo root. Both API and Web services must use the **full repository** as the build context.

| Setting              | API                                     | Web                                                     |
| -------------------- | --------------------------------------- | ------------------------------------------------------- |
| **Root Directory**   | _(empty — repo root)_                   | _(empty — repo root)_                                   |
| **Config file path** | `/apps/api/railway.json`                | `/apps/web/railway.json`                                |
| **Builder**          | Dockerfile                              | Dockerfile                                              |
| **Dockerfile path**  | `apps/api/Dockerfile`                   | `apps/web/Dockerfile`                                   |
| **Build Command**    | _(empty — Dockerfile)_                  | _(empty — Dockerfile)_                                  |
| **Start Command**    | `node apps/api/src/server.js`           | _(empty — Dockerfile entrypoint)_                       |
| **Healthcheck Path** | `/health`                               | `/health`                                               |
| **Public Port**      | Railway `PORT` (app listens on `$PORT`) | Railway `PORT` (nginx listens on `$PORT`, default `80`) |

**Do not** set Root Directory to `apps/api` or `apps/web`. That narrows the build context and breaks `COPY package.json pnpm-lock.yaml pnpm-workspace.yaml` in the Dockerfiles.

Inside Docker, installs and builds use pnpm filters (`--filter @supplify/api...`, `--filter @supplify/web build:docker`) so only the target app is built despite the repo-root context.

### Railpack / Nixpacks (API only, optional)

Prefer Docker for both services. Web production requires nginx (see `apps/web/Dockerfile`). If you must use Nixpacks/Railpack for API:

| Setting         | Value                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root Directory  | _(empty)_                                                                                                                                                     |
| Builder         | NIXPACKS or RAILPACK                                                                                                                                          |
| Build Command   | `corepack enable && corepack prepare pnpm@8.15.9 --activate && pnpm install --frozen-lockfile --filter @supplify/api... && pnpm --filter @supplify/api build` |
| Start Command   | `node apps/api/src/server.js`                                                                                                                                 |
| Nixpacks config | `apps/api/nixpacks.toml`                                                                                                                                      |

## Architecture overview

| Service      | Source         | Notes                                     |
| ------------ | -------------- | ----------------------------------------- |
| **API**      | `apps/api`     | Node.js, `GET /health`, port from `PORT`  |
| **Web**      | `apps/web`     | Static Vite build (nginx Dockerfile)      |
| **Postgres** | Railway plugin | Set `DATABASE_URL` on the API service     |
| **Keycloak** | Optional       | External or self-hosted; set `KEYCLOAK_*` |
| **Storage**  | Optional       | `STORAGE_DRIVER=local` (MVP) or `s3` (R2) |

## 1. Create Railway project

1. Create a new Railway project.
2. Add a **PostgreSQL** database. Railway injects `DATABASE_URL` — reference it on the API service.
3. Add a **service** for the API: Root Directory **empty**, config file `/apps/api/railway.json`, Dockerfile `apps/api/Dockerfile`.
4. Add a **service** for the web: Root Directory **empty**, config file `/apps/web/railway.json`, Dockerfile `apps/web/Dockerfile`, build arg `VITE_API_URL`.

## 2. API service

### Build

- **Root Directory:** _(empty — repository root)_
- **Config file:** `/apps/api/railway.json`
- **Dockerfile path:** `apps/api/Dockerfile` (build context: repository root)
- **Build Command:** _(leave empty when using Dockerfile)_
- **Start command:** `node apps/api/src/server.js` (Dockerfile `CMD`; Railway may mirror via `railway.json`)
- **Public port:** Railway-injected `PORT` (API binds to `process.env.PORT`)

### Health check

- Path: `/health`
- Expect `200` when storage and app are ready (`503` if S3 driver cannot reach bucket)

### Required environment variables

| Variable                        | Example                           | Description                                                                                                            |
| ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `production`                      |                                                                                                                        |
| `PORT`                          | _(Railway sets this)_             | API listen port                                                                                                        |
| `DATABASE_URL`                  | `${{Postgres.DATABASE_URL}}`      | **Private** Postgres URL from the plugin (not the public proxy)                                                        |
| `DATABASE_SSL`                  | `true`                            | Required for Railway Postgres                                                                                          |
| `REDIS_URL`                     | `${{Redis.REDIS_URL}}`            | **Recommended** — shared cache for permissions/tenant/subscription/entitlements (internal URL, not `REDIS_PUBLIC_URL`) |
| `DATABASE_POOL_MAX`             | `20`                              | Postgres pool size (defaults in `deploy/railway/<env>/api.env`)                                                        |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | `600000`                          | Idle client lifetime (10 min)                                                                                          |
| `DB_KEEPALIVE_ENABLED`          | `true`                            | Lightweight `SELECT 1` keepalive on Railway                                                                            |
| `DB_KEEPALIVE_INTERVAL_SECONDS` | `60`                              | Keepalive interval (≥ 10)                                                                                              |
| `SLOW_REQUEST_MS`               | `800`                             | Log structured stage breakdown when a request exceeds this (ms)                                                        |
| `IDLE_PERF_LOG_MS`              | `500` or `0`                      | Log `http.request.perf_sample` with cache hits between 500ms and `SLOW_REQUEST_MS`                                     |
| `WEB_ORIGIN`                    | `https://your-web.up.railway.app` | Primary frontend URL                                                                                                   |
| `WEB_ORIGINS`                   | same as above                     | Comma-separated CORS origins                                                                                           |
| `SESSION_SECRET`                | _(32+ random hex)_                | `openssl rand -hex 32`                                                                                                 |
| `KEYCLOAK_BASE_URL`             | `https://keycloak.example.com`    | Server-to-server Keycloak URL                                                                                          |
| `KEYCLOAK_PUBLIC_URL`           | same or public URL                | Browser OIDC redirects                                                                                                 |
| `KEYCLOAK_REALM`                | `Supplify`                        |                                                                                                                        |
| `KEYCLOAK_CLIENT_ID`            | `supplify-api`                    |                                                                                                                        |
| `KEYCLOAK_CLIENT_SECRET`        | _(strong secret)_                 |                                                                                                                        |
| `KEYCLOAK_ADMIN`                | `admin`                           | For invite user provisioning                                                                                           |
| `KEYCLOAK_ADMIN_PASSWORD`       | _(strong)_                        |                                                                                                                        |
| `STORAGE_DRIVER`                | `local`                           | `local` or `s3`                                                                                                        |
| `STORAGE_LOCAL_PATH`            | `uploads`                         | Local disk root (ephemeral on Railway unless you add a volume)                                                         |
| `STORAGE_PUBLIC_URL`            | `https://api.example.com/uploads` | Public URL for stored files                                                                                            |
| `API_PUBLIC_URL`                | `https://api.example.com`         | Used for local upload PUT URLs                                                                                         |

### Storage (MVP: local disk)

```env
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=uploads
API_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
STORAGE_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}/uploads
```

Uploads are served at `/uploads/*`. **Without a Railway volume, files are lost on redeploy** — use `STORAGE_DRIVER=s3` with Cloudflare R2 or another S3-compatible endpoint for production media.

### Storage (S3-compatible, e.g. Cloudflare R2)

```env
STORAGE_DRIVER=s3
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://pub-<bucket>.r2.dev
STORAGE_BUCKET=supplify
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_REGION=auto
STORAGE_PUBLIC_READ=true
```

### Migrations

Run once after deploy (Railway one-off command or local with production `DATABASE_URL`):

```bash
pnpm db:migrate
```

Restaurant-operations features require migrations **0133–0137** (and any later pending files). **Email dedup** requires **0136** (`0136_email_delivery_log.sql`). Railway API services use `RUN_MIGRATIONS_ON_START=true` in `deploy/railway/<env>/api.env` so SQL runs after listen on deploy. EC2 Docker deploy scripts also run migrations via the `migrate` compose service.

Committed Railway API defaults (`deploy/railway/<env>/api.env`, copied into the image) set `CRONS_ENABLED=true` for in-process jobs including operational reminders.

### Email (transactional notifications)

Non-secret email settings load from `deploy/railway/<env>/api.env` on deploy (`EMAIL_*`, `SMTP_HOST`, etc.). Set **`SMTP_PASS`** once in the Railway Raw Editor per API service (see `deploy/railway/<env>/secrets.env.example`).

| Environment    | Default                                                    |
| -------------- | ---------------------------------------------------------- |
| development    | `EMAIL_LOG_ONLY=true` (safe log-only)                      |
| preprod / prod | `EMAIL_LOG_ONLY=false` — requires `SMTP_PASS` in dashboard |

API startup validates: when `EMAIL_ENABLED=true` and `EMAIL_LOG_ONLY=false`, you must configure `SMTP_HOST`+`SMTP_PASS` or `SENDGRID_API_KEY`. Test with `pnpm --filter @supplify/api email:test`. See [../features/email-system.md](../features/email-system.md).

## 3. Web service

### Railway settings

| Setting          | Value                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| Root Directory   | _(empty — repository root)_                                                    |
| Config file      | `/apps/web/railway.json`                                                       |
| Dockerfile path  | `apps/web/Dockerfile`                                                          |
| Build Command    | _(leave empty when using Dockerfile)_                                          |
| Start Command    | _(leave empty — Dockerfile `ENTRYPOINT` runs `/docker-entrypoint.sh` → nginx)_ |
| Healthcheck Path | `/health`                                                                      |
| Public Port      | Railway-injected `PORT` (nginx listens on `$PORT`; Dockerfile default `80`)    |

### Build args (Docker)

| Build arg             | Value                             |
| --------------------- | --------------------------------- |
| `VITE_API_URL`        | `https://your-api.up.railway.app` |
| `VITE_KEYCLOAK_URL`   | Public Keycloak URL               |
| `VITE_KEYCLOAK_REALM` | `Supplify`                        |

### Runtime

The web image serves static files with nginx (`apps/web/Dockerfile`). No runtime env vars are required if build args are set correctly.

See `apps/web/.env.railway.example` for local Vite development.

## 4. Keycloak (optional)

Each environment can run a Railway Keycloak service that **builds** `deploy/railway/keycloak/Dockerfile` and runs `railway-entrypoint.sh start --import-realm`.

| Doc                                                                                                        | Purpose                             |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [`deploy/railway/keycloak/RAILWAY_SETUP.md`](../../deploy/railway/keycloak/RAILWAY_SETUP.md)               | Per-env config, realms, verify URLs |
| [`deploy/railway/KEYCLOAK_RAILWAY_DB_NOTES.md`](../../deploy/railway/KEYCLOAK_RAILWAY_DB_NOTES.md)         | Postgres `keycloak` DB              |
| [`deploy/railway/KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](../../deploy/railway/KEYCLOAK_RAILWAY_MEMORY_NOTES.md) | JVM caps, start modes               |
| [`docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`](../infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md)                     | OOM / H2 fix write-up               |

Sync: `pnpm railway:keycloak:sync -- <env>`. Non-prod: `KEYCLOAK_USE_OPTIMIZED=false`. Prod: `true`.

Set matching `KEYCLOAK_*` on the API. Alternatives: external IdP or VM using `deploy/keycloak/realm-export*.json`.

## 5. Connect frontend to API

On the web Railway service, set build-time:

```text
VITE_API_URL=https://<api-service>.up.railway.app
```

Redeploy the web service after changing API URL.

## 6. Local development (unchanged)

```bash
pnpm setup
pnpm dev
```

Docker Compose still runs Postgres, Redis, MinIO, and Keycloak for full local stack. MinIO uses `STORAGE_DRIVER=s3` via `.env.docker-sync`.

## 7. What was removed

- `infra/` AWS CDK stacks (ECS, CloudFront, RDS CDK, IAM deploy roles)
- `.github/workflows/ci.yml` (GitHub Actions unit-test workflow)
- Root `package.json` `cdk:*` scripts
- `deploy/scripts/backup-now.sh` AWS CLI `s3 cp` upload (use `BACKUP_REMOTE_URL` note or your own backup)

Run tests locally before deploy:

```bash
pnpm test:ci
pnpm build
```

## Example env files

- API: `apps/api/.env.railway.example`
- Web: `apps/web/.env.railway.example`
