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
| Keycloak (optional) | `keycloak-dev`          |

### preprod

| Service             | Name (example)              |
| ------------------- | --------------------------- |
| API                 | `supplify-api-preprod`      |
| Web                 | `supplify-web-preprod`      |
| Postgres            | `supplify-postgres-preprod` |
| Keycloak (optional) | `keycloak-preprod`          |

### prod

| Service             | Name (example)           |
| ------------------- | ------------------------ |
| API                 | `supplify-api-prod`      |
| Web                 | `supplify-web-prod`      |
| Postgres            | `supplify-postgres-prod` |
| Keycloak (optional) | `keycloak-prod`          |

Config files: `apps/api/railway.json`, `apps/web/railway.json` (no secrets inside).

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
3. Deploy API: root directory = repo root, Dockerfile `apps/api/Dockerfile`, health check `/health`.
4. Deploy Web: Dockerfile `apps/web/Dockerfile`, build args from `apps/web/.env.<env>.example`.
5. Copy variables from `.env.<env>.example` into Railway (no real secrets in git).
6. Run migrations manually: `pnpm db:migrate` with that environment’s `DATABASE_URL`.
7. Verify `GET /health` and `GET /ready` on API; open web app and sign in via Keycloak.

## I. Postgres per environment

- One Railway Postgres **per environment** — never point dev/preprod at prod.
- Set `DATABASE_SSL=true` on preprod and prod.
- Backups: use Railway Postgres backups / logical dumps for prod (see go-live checklist).

## J. Keycloak per environment

- Separate realm per env: `supplify-dev`, `supplify-preprod`, `supplify-prod`
- Import `deploy/keycloak/realm-export.json` on first Keycloak start (adjust realm name per env)
- `KEYCLOAK_URL` = server-side URL; `KEYCLOAK_PUBLIC_URL` = browser URL

## K. Storage per environment

| env     | Driver  | Notes                                                     |
| ------- | ------- | --------------------------------------------------------- |
| dev     | `local` | `/uploads` on disk; ephemeral on Railway without volume   |
| preprod | `s3`    | R2/MinIO; separate bucket                                 |
| prod    | `s3`    | Required; `STORAGE_DRIVER=local` fails startup validation |

## L. Payment mode per environment

| Mode   | env     | Behavior                                               |
| ------ | ------- | ------------------------------------------------------ |
| `mock` | dev     | Stub gateway (`BILLING_GATEWAY=stub`)                  |
| `test` | preprod | Stub/test — no live charges                            |
| `live` | prod    | Real provider when integrated; webhook secret required |

API blocks `PAYMENTS_MODE=mock` when `APP_ENV=prod` or `preprod`.

## M. CORS and security

- Origins from `CORS_ORIGIN`, `WEB_ORIGINS`, `WEB_ORIGIN`, `PUBLIC_FRONTEND_URL` (no `*`)
- Credentials enabled — wildcard CORS is rejected in preprod/prod validation
- `COOKIE_SECURE=true` on preprod/prod
- Rate limiting: `RATE_LIMIT_ENABLED=true` on preprod/prod

## N. Production go-live checklist

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
- [ ] `GET /health` returns `{ status, service, env }` without secrets
- [ ] Frontend build with prod `VITE_*` vars
- [ ] Migrations applied; admin created securely
- [ ] Backups and rollback plan documented

## O. Rollback notes

- Railway: redeploy previous deployment from Railway dashboard or pin image digest
- Database: restore from backup before re-running migrations
- Keep previous env var set exported before major changes

## P. Common mistakes

- Reusing prod `DATABASE_URL` in dev/preprod
- `PAYMENTS_MODE=mock` on preprod/prod (startup fails)
- Forgetting to set `CORS_ORIGIN` on Railway (browser blocked)
- Building web without `VITE_API_URL` (calls localhost)
- `STORAGE_DRIVER=local` on prod (validation fails)
- Committing `.env` files with real secrets

See also: [DEPLOYMENT_RAILWAY.md](DEPLOYMENT_RAILWAY.md) (single-env overview), [.env.matrix.md](.env.matrix.md).
