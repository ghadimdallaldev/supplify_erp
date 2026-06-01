# Railway deployment — dev, preprod, and prod

Supplify uses **three isolated Railway environments** inside one project. AWS CDK and GitHub Actions were removed; deploy via Railway only.

Repo paths: API = `apps/api/`, Web = `apps/web/`. Env templates: `apps/api/.env.{dev,preprod,prod}.example` and `apps/web/.env.{dev,preprod,prod}.example`.

## A. Environment overview

| Environment | Git branch (typical) | Railway environment | Purpose                                    |
| ----------- | -------------------- | ------------------- | ------------------------------------------ |
| **dev**     | `dev`                | `dev`               | Local/Railway development, mocks, debug    |
| **preprod** | `preprod`            | `preprod`           | QA, demos, test payments, prod-like config |
| **prod**    | `prod`               | `prod`              | Live customers, strict security            |

**Never share** `DATABASE_URL`, Keycloak realms, storage buckets, or payment keys across environments.

## B. What dev is for

- Developer testing and UI iteration
- `PAYMENTS_MODE=mock`, `STORAGE_DRIVER=local`
- Relaxed rate limits, debug logging, optional `E2E_SECRET` with `ENABLE_DEBUG_ROUTES=true`
- Safe test data only

## C. What preprod is for

- Production-like staging: supplier/restaurant onboarding, admin QA, promotions/subscriptions in **test** payment mode
- Separate Postgres, Keycloak realm (`supplify-preprod`), storage bucket
- **No real card charges** — `PAYMENTS_MODE=test` only
- No production customer data unless anonymized

## D. What prod is for

- Real suppliers, restaurants, admins
- `PAYMENTS_MODE=live` when payment provider is ready
- `STORAGE_DRIVER=s3` required, strict CORS, secure cookies, rate limits on
- No debug/E2E/seed routes, no demo data automation

## E. Railway service layout

**Supplify Railway project** with three environments:

### dev

| Service             | Name (example)          |
| ------------------- | ----------------------- |
| API                 | `supplify-api-dev`      |
| Web                 | `supplify-web-dev`      |
| Postgres            | `supplify-postgres-dev` |
| Redis (recommended) | `redis-dev`             |
| Keycloak (optional) | `keycloak-dev`          |

### preprod

| Service             | Name (example)              |
| ------------------- | --------------------------- |
| API                 | `supplify-api-preprod`      |
| Web                 | `supplify-web-preprod`      |
| Postgres            | `supplify-postgres-preprod` |
| Redis (recommended) | `redis-preprod`             |
| Keycloak (optional) | `keycloak-preprod`          |

### prod

| Service             | Name (example)           |
| ------------------- | ------------------------ |
| API                 | `supplify-api-prod`      |
| Web                 | `supplify-web-prod`      |
| Postgres            | `supplify-postgres-prod` |
| Redis (recommended) | `redis-prod`             |
| Keycloak (optional) | `keycloak-prod`          |

Config files: `apps/api/railway.json`, `apps/web/railway.json` (no secrets inside).

## E.1 Monorepo Railway settings (required)

Both services share root lockfiles (`pnpm-lock.yaml`, `pnpm-workspace.yaml`). **Root Directory must be empty** (repo root) for API and Web.

| Setting          | API (`supplify-api-*`)        | Web (`supplify-web-*`)                 |
| ---------------- | ----------------------------- | -------------------------------------- |
| Root Directory   | _(empty)_                     | _(empty)_                              |
| Config file path | `/apps/api/railway.json`      | `/apps/web/railway.json`               |
| Builder          | Dockerfile                    | Dockerfile                             |
| Dockerfile path  | `apps/api/Dockerfile`         | `apps/web/Dockerfile`                  |
| Build Command    | _(empty)_                     | _(empty)_                              |
| Start Command    | `node apps/api/src/server.js` | _(empty — nginx entrypoint)_           |
| Healthcheck Path | `/health`                     | `/health`                              |
| Public Port      | Railway `PORT`                | Railway `PORT` (default `80` in image) |

**Common failure:** Root Directory = `apps/web` or `apps/api` → Docker `COPY` cannot find `pnpm-lock.yaml` at repo root. Fix by clearing Root Directory and redeploying.

Docker builds use `pnpm --filter @supplify/api...` and `pnpm --filter @supplify/web build:docker` so each service builds only its app.

## F. Required backend variables (summary)

See `apps/api/.env.<env>.example` and [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).

| Variable                              | dev                 | preprod            | prod            |
| ------------------------------------- | ------------------- | ------------------ | --------------- |
| `APP_ENV`                             | `dev`               | `preprod`          | `prod`          |
| `DATABASE_URL`                        | dev plugin          | preprod plugin     | prod plugin     |
| `CORS_ORIGIN` / `PUBLIC_FRONTEND_URL` | localhost + dev URL | preprod URL only   | prod URL only   |
| `SESSION_SECRET`                      | dev-only            | strong 32+         | strong 32+      |
| `KEYCLOAK_REALM`                      | `supplify-dev`      | `supplify-preprod` | `supplify-prod` |
| `STORAGE_DRIVER`                      | `local`             | `s3`               | `s3`            |
| `PAYMENTS_MODE`                       | `mock`              | `test`             | `live`          |
| `ENABLE_DEBUG_ROUTES`                 | `true`              | `false`            | `false`         |
| `REDIS_URL`                           | recommended         | recommended        | recommended     |

## G. Required frontend variables (summary)

Set at **build time** (Docker `ARG` or Railway). See `apps/web/.env.<env>.example`.

| Variable               | dev                          | preprod         | prod         |
| ---------------------- | ---------------------------- | --------------- | ------------ |
| `VITE_APP_ENV`         | `dev`                        | `preprod`       | `prod`       |
| `VITE_API_URL`         | empty (proxy) or dev API URL | preprod API URL | prod API URL |
| `VITE_PAYMENTS_MODE`   | `mock`                       | `test`          | `live`       |
| `VITE_ENABLE_DEBUG_UI` | `true`                       | `false`         | `false`      |

## H. Railway deployment steps

1. Create Railway project with environments: **dev**, **preprod**, **prod**.
2. Per environment, add Postgres plugin → reference `DATABASE_URL` on API service.
3. Per environment, add **Redis** (see [§ I. Redis](#i-redis-cache--socketio)) → reference `REDIS_URL` on the API service.
4. Deploy API: Root Directory **empty**, config `/apps/api/railway.json`, Dockerfile `apps/api/Dockerfile`, health check `/health`.
5. Deploy Web: Root Directory **empty**, config `/apps/web/railway.json`, Dockerfile `apps/web/Dockerfile`, build args from `apps/web/.env.<env>.example`.
6. Commit defaults live in `deploy/railway/<environment>/` (API + web load on deploy). Paste secrets from `deploy/railway/<environment>/secrets.env.example` into each service’s Railway Raw Editor once (`DATABASE_URL`, `REDIS_URL`, session keys, Keycloak secret).
7. Run migrations manually: `pnpm db:migrate` with that environment’s `DATABASE_URL`.
8. Verify `GET /health` and `GET /ready` on API (`redis.connected` should be `true` when Redis is wired); open web app and sign in via Keycloak.

## I. Redis (cache + Socket.IO)

Redis is **optional** — the API starts without it and uses an in-memory cache fallback. You should still run Redis in Railway (and locally) for:

| Feature                                    | Without `REDIS_URL`                | With `REDIS_URL`                  |
| ------------------------------------------ | ---------------------------------- | --------------------------------- |
| Permission / calendar cache                | In-memory per API process          | Shared across replicas            |
| Socket.IO chat + `notification_new` toasts | Works on **one** API instance only | Works across **all** API replicas |
| `GET /health`                              | `redis.connected: false`           | `redis.connected: true`           |

### Local development

**Docker stack** (`pnpm dev:docker` or root `docker-compose.yml`): Redis is already defined as service `redis`. The API gets `REDIS_URL=redis://redis:6379` automatically.

**Native API** (`pnpm dev` with infra containers):

```bash
pnpm local:infra   # starts postgres, redis, minio, keycloak
```

In `apps/api/.env` (or `.env.local`):

```env
REDIS_URL=redis://localhost:6379
```

Port comes from `docker/.env` → `REDIS_PORT` (default `6379`).

### Railway (per environment: dev, preprod, prod)

1. Open your Railway project → select the environment (e.g. **development**).
2. Click **+ New** → **Database** → **Add Redis** (or **Redis** template).
3. Name the service (e.g. `redis-dev`) — one Redis **per environment**, not shared across dev/preprod/prod.
4. Open your **API** service → **Variables** → **Add variable** (or Raw Editor):

   ```env
   REDIS_URL=${{redis-dev.REDIS_URL}}
   ```

   Replace `redis-dev` with the **exact** Redis service name shown in the Railway sidebar. Railway injects `REDIS_URL` on the Redis service; the reference copies it into the API.

   **Do not use `REDIS_PUBLIC_URL`** on the API service. Railway shows an egress warning when `REDIS_URL` references `${{Redis.REDIS_PUBLIC_URL}}` or `*.proxy.rlwy.net` — that path is for **local machines** connecting into the project, not API ↔ Redis in the same environment. The API uses private networking (`redis.railway.internal`) via `REDIS_URL` and ioredis `family: 0` (dual-stack DNS).

5. **Redeploy** the API service (variable changes require a new deploy).
6. Confirm:

   ```text
   GET https://<your-api-host>/health
   ```

   Response should include `"redis": { "connected": true }`.

**Notes:**

- Only the **API** service needs `REDIS_URL`. Web does not connect to Redis.
- If you scale API to multiple replicas, Redis is **required** for reliable real-time chat and notification sockets.
- If Redis is down at startup, the adapter logs a warning and Socket.IO still runs on a single instance; cache falls back to memory.

### Troubleshooting

| Symptom                               | Fix                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Railway egress warning on Redis       | Change API `REDIS_URL` to `${{redis-xxx.REDIS_URL}}`; remove `REDIS_PUBLIC_URL` refs |
| `redis.connected: false` on `/health` | Set `REDIS_URL` on API; check service name in `${{...}}` reference; redeploy         |
| `ENOTFOUND redis.railway.internal`    | Keep private `REDIS_URL`; redeploy API (app sets ioredis `family: 0`)                |
| Chat works sometimes, not always      | Multiple API replicas without Redis — add Redis or scale API to 1 instance           |
| `ECONNREFUSED` in API logs            | Wrong URL (use Railway reference, not `localhost`)                                   |
| Works locally, not on Railway         | Add Redis plugin in that Railway environment; do not reuse dev Redis URL in prod     |

## J. Postgres per environment

- One Railway Postgres **per environment** — never point dev/preprod at prod.
- Set `DATABASE_SSL=true` on preprod and prod.
- Backups: use Railway Postgres backups / logical dumps for prod (see go-live checklist).

## K. Keycloak per environment

- Separate realm per env: **`Supplify`** (dev), **`supplify-preprod`**, **`supplify-prod`**
- Import the matching file from `deploy/keycloak/` (see `deploy/keycloak/README.md`)
- Redirect / post-logout URIs: `deploy/railway/{development,preprod,production}/KEYCLOAK_CLIENT.md`
- `KEYCLOAK_URL` = server-side URL; `KEYCLOAK_PUBLIC_URL` = browser URL

## L. Storage per environment

Full upload pipeline (presign, keys, local vs S3): [docs/operations/STORAGE_UPLOADS.md](docs/operations/STORAGE_UPLOADS.md).

| env     | Driver | Notes                                                                     |
| ------- | ------ | ------------------------------------------------------------------------- |
| dev     | `s3`   | Railway **Bucket** (see secrets.env.example); `STORAGE_PUBLIC_READ=false` |
| preprod | `s3`   | R2/MinIO; separate bucket                                                 |
| prod    | `s3`   | Required; `STORAGE_DRIVER=local` fails startup validation                 |

**Railway dev storage:** add a **Bucket** service per environment and wire credentials to the API (variable references). Files persist in the bucket; the API serves reads via `/api/files/object` when the bucket is private.

## M. Payment mode per environment

| Mode   | env     | Behavior                                               |
| ------ | ------- | ------------------------------------------------------ |
| `mock` | dev     | Stub gateway (`BILLING_GATEWAY=stub`)                  |
| `test` | preprod | Stub/test — no live charges                            |
| `live` | prod    | Real provider when integrated; webhook secret required |

API blocks `PAYMENTS_MODE=mock` when `APP_ENV=prod` or `preprod`.

## N. CORS and security

- Origins from `CORS_ORIGIN`, `WEB_ORIGINS`, `WEB_ORIGIN`, `PUBLIC_FRONTEND_URL` (no `*`)
- Credentials enabled — wildcard CORS is rejected in preprod/prod validation
- `COOKIE_SECURE=true` on preprod/prod
- Rate limiting: `RATE_LIMIT_ENABLED=true` on preprod/prod

### Real-time (Socket.IO, chat, notification toasts)

- **Web build:** set `VITE_API_URL` to the public API URL (same host used for REST). Socket.IO connects to that origin with `withCredentials: true` (session cookies).
- **API:** `WEB_ORIGINS` (or `CORS_ORIGIN` / `PUBLIC_FRONTEND_URL`) must list every frontend origin that opens the app; missing origins cause socket handshake or CORS failures.
- **Multi-replica:** set `REDIS_URL` on the API service so Socket.IO uses the Redis adapter (`@socket.io/redis-adapter`). Without Redis, events only reach clients connected to the same API instance.
- **Local dev:** Vite proxies `/socket.io` to the API when `VITE_API_URL` is unset; cookies stay on `localhost:5173`.

## O. Production go-live checklist

- [ ] `APP_ENV=prod`, `DATABASE_URL` = prod Postgres only
- [ ] `CORS_ORIGIN` = prod frontend URL only
- [ ] `PUBLIC_FRONTEND_URL` / `PUBLIC_API_URL` correct
- [ ] `SESSION_SECRET` and `IMPERSONATION_SECRET` ≥ 32 chars, unique
- [ ] `COOKIE_SECURE=true`, `RATE_LIMIT_ENABLED=true`
- [ ] `ENABLE_DEBUG_ROUTES=false`, `ENABLE_SEED_ROUTES=false`, no `E2E_SECRET`
- [ ] `ALLOW_DB_RESET=false`, `SEED_DEMO_DATA=false`
- [ ] `PAYMENTS_MODE=live` only when provider ready; `PAYMENTS_WEBHOOK_SECRET` set
- [ ] `STORAGE_DRIVER=s3`, production bucket
- [ ] Keycloak prod realm/client only
- [ ] `REDIS_URL` set on API (Redis plugin per environment); `/health` shows `redis.connected: true`
- [ ] `GET /health` returns `{ status, service, env }` without secrets
- [ ] Frontend build with prod `VITE_*` vars
- [ ] Migrations applied; admin created securely
- [ ] Backups and rollback plan documented

## P. Rollback notes

- Railway: redeploy previous deployment from Railway dashboard or pin image digest
- Database: restore from backup before re-running migrations
- Keep previous env var set exported before major changes

## Q. Common mistakes

- Reusing prod `DATABASE_URL` in dev/preprod
- `PAYMENTS_MODE=mock` on preprod/prod (startup fails)
- Forgetting to set `CORS_ORIGIN` on Railway (browser blocked)
- Building web without `VITE_API_URL` (calls localhost)
- No `REDIS_URL` on API while running 2+ replicas (chat/notifications only work on one instance)
- Root Directory set to `apps/web` or `apps/api` (breaks monorepo lockfile COPY)
- `STORAGE_DRIVER=local` on prod (validation fails)
- Committing `.env` files with real secrets

See also: [DEPLOYMENT_RAILWAY.md](DEPLOYMENT_RAILWAY.md) (single-env overview), [.env.matrix.md](.env.matrix.md), [docs/operations/CRON_JOBS.md](docs/operations/CRON_JOBS.md) (in-process scheduled jobs and env vars).
