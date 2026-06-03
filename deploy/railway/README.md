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

Each folder: `api.env`, `web.env`, `secrets.env.example`, `keycloak.env`.

## One-time Railway setup

1. **API** service → Variables → Raw Editor → paste contents of `development/secrets.env.example` and fill `CHANGE_ME` values.
2. Add reference: `DATABASE_URL=${{Postgres-dev.DATABASE_URL}}` (service name must match your Postgres plugin).
3. **Web** service — no runtime vars required if you deploy from this repo (build uses `development/web.env`). Optionally set secrets if you add any later.
4. **Keycloak** service → config `deploy/railway/<env>/keycloak/railway.json` (auto-import realm; see `keycloak/RAILWAY_SETUP.md`); paste `<env>/keycloak.env` + Postgres `KC_DB_*` + `KEYCLOAK_ADMIN_PASSWORD` on **Keycloak and API**.
5. Clear any dashboard **`PORT`** override on API (let Railway inject `PORT`).
6. Push to git → redeploy all services.
7. After deploy, run **`pnpm db:migrate`** against that environment’s Postgres (see [railway-environments.md](../../docs/deployment/railway-environments.md) § H). Restaurant ops + GPS need migrations **0133–0137** applied once per environment.

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

## Disable file loading (local Docker)

```env
SKIP_RAILWAY_ENV_FILE=1
```
