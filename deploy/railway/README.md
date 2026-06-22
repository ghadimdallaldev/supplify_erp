# Railway environment files (committed defaults)

Non-secret configuration for Railway lives here. On deploy, the API and web Docker images load these files automatically so you do not need to duplicate URLs and flags in the Railway dashboard.

**Secrets** (passwords, client secrets, session keys) are **not** committed. Set them once per service using `secrets.env.example` as a checklist, or paste that file into Railway’s **Raw Editor**.

## Layout

| Environment     | API            | Web build               | Keycloak (Dockerfile + `--import-realm`)               |
| --------------- | -------------- | ----------------------- | ------------------------------------------------------ |
| **development** | `development/` | `development/web.env`   | `development/keycloak/railway.json` → realm `Supplify` |
| **preprod**     | `preprod/`     | `preprod/web.env`       | `preprod/keycloak/railway.json` → `supplify-preprod`   |
| **staging**     | `staging/`     | _(use preprod web.env)_ | `staging/keycloak/railway.json` → `supplify-preprod`   |
| **production**  | `production/`  | `production/web.env`    | `production/keycloak/railway.json` → `supplify-prod`   |

Keycloak Railway setup (all envs): [`keycloak/RAILWAY_SETUP.md`](keycloak/RAILWAY_SETUP.md).  
Memory / JVM (all envs): [`KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](KEYCLOAK_RAILWAY_MEMORY_NOTES.md).  
Full fix write-up: [`docs/operations/keycloak-railway-memory-fix.md`](../../docs/operations/keycloak-railway-memory-fix.md).  
Database / persistence: [`KEYCLOAK_RAILWAY_DB_NOTES.md`](KEYCLOAK_RAILWAY_DB_NOTES.md).

Each folder: `api.env`, `web.env`, `secrets.env.example`, `keycloak.env`.

## One-time Railway setup

1. **API** service → Variables → Raw Editor → paste contents of `development/secrets.env.example` and fill `CHANGE_ME` values.
2. Add reference: `DATABASE_URL=${{Postgres-dev.DATABASE_URL}}` (service name must match your Postgres plugin).
3. **Web** service — no runtime vars required if you deploy from this repo (build uses `development/web.env`). Optionally set secrets if you add any later.
4. **Keycloak** service → config `deploy/railway/<env>/keycloak/railway.json`; sync vars: `pnpm railway:keycloak:sync -- <env>` (or paste `keycloak.env`). Postgres link + DB bootstrap are automatic on boot — [`KEYCLOAK_RAILWAY_DB_NOTES.md`](KEYCLOAK_RAILWAY_DB_NOTES.md).
5. Clear any dashboard **`PORT`** override on API (let Railway inject `PORT`).
6. Push to git → redeploy all services.
7. After deploy, run **`pnpm db:migrate`** against that environment’s Postgres (see [railway-environments.md](../../docs/operations/railway-environments.md) § H). Restaurant ops + GPS need migrations **0133–0137** applied once per environment.

## Email (Railway)

Non-secret email settings load from `deploy/railway/<env>/api.env` (`EMAIL_*`, `SMTP_HOST`, etc.).

**Dashboard secret (once):** `SMTP_PASS` — see `secrets.env.example`.

| Environment    | Default behavior                            |
| -------------- | ------------------------------------------- |
| development    | `EMAIL_LOG_ONLY=true` (log only)            |
| preprod / prod | SMTP host in git + `SMTP_PASS` in dashboard |

Test: `pnpm --filter @supplify/api email:test`

## Changing URLs

Edit `development/*.env` in this repo, push, and redeploy. Dashboard variables with the same name still win over these files.

## Preprod / production

Set on each Railway service (or name the Railway environment `preprod` / `prod`):

```env
RAILWAY_DEPLOY_ENV=preprod
```

Web Docker build: Railway variable or build arg `RAILWAY_DEPLOY_ENV=preprod` or `production`.

See `deploy/keycloak/README.md` for realm imports and redirect URI lists.

## Performance / idle warmth (API)

Committed in each `api.env` (non-secret). **`REDIS_URL` must be set in `secrets.env.example`** or caches fall back to in-process memory only.

| Variable                        | Typical value                   | Notes                                 |
| ------------------------------- | ------------------------------- | ------------------------------------- |
| `DATABASE_POOL_MAX`             | `20`                            | Shared pool size                      |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | `600000`                        | Keep clients 10 min (was 30s)         |
| `SLOW_REQUEST_MS`               | `800`                           | Slow-request log threshold            |
| `IDLE_PERF_LOG_MS`              | `500` (dev/preprod), `0` (prod) | Optional perf samples with cache hits |
| `DB_KEEPALIVE_ENABLED`          | `true`                          | `SELECT 1` interval on Railway        |
| `DB_KEEPALIVE_INTERVAL_SECONDS` | `60`                            | Do not set below 10                   |

Legacy: `DB_POOL_KEEPALIVE_MS` (ms) overrides interval if ≥ 10000.

## Disable file loading (local Docker)

```env
SKIP_RAILWAY_ENV_FILE=1
```
