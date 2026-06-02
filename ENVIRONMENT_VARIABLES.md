# Environment variables reference

Templates: `apps/api/.env.{dev,preprod,prod}.example`, `apps/web/.env.{dev,preprod,prod}.example`.  
Set secrets only in Railway — never commit real values.

## Backend (API)

| Variable                                                                     | Used by | Required in    | Example                      | Notes                                                     |
| ---------------------------------------------------------------------------- | ------- | -------------- | ---------------------------- | --------------------------------------------------------- |
| `APP_ENV`                                                                    | API     | all hosted     | `dev` / `preprod` / `prod`   | Drives safety defaults                                    |
| `NODE_ENV`                                                                   | API     | all            | `development` / `production` | Node runtime mode                                         |
| `PORT`                                                                       | API     | all            | `4000`                       | Railway sets automatically                                |
| `DATABASE_URL`                                                               | API     | all hosted     | `postgresql://...`           | **Unique per environment**                                |
| `DATABASE_SSL`                                                               | API     | preprod, prod  | `true`                       | Required for Railway Postgres                             |
| `CORS_ORIGIN`                                                                | API     | preprod, prod  | `https://app.example.com`    | Comma-separated origins                                   |
| `WEB_ORIGINS`                                                                | API     | optional       | same as CORS                 | Legacy alias; merged with CORS                            |
| `WEB_ORIGIN`                                                                 | API     | optional       | primary origin               | Staff links, OAuth redirects                              |
| `PUBLIC_API_URL`                                                             | API     | hosted         | `https://api.example.com`    | Alias of `API_PUBLIC_URL`                                 |
| `PUBLIC_FRONTEND_URL`                                                        | API     | hosted         | `https://app.example.com`    | Added to CORS allow list                                  |
| `SESSION_SECRET`                                                             | API     | all hosted     | 64-char hex                  | Session signing; ≥32 chars in prod                        |
| `IMPERSONATION_SECRET`                                                       | API     | hosted         | 64-char hex                  | Defaults to `SESSION_SECRET`                              |
| `JWT_SECRET`                                                                 | API     | optional       | —                            | Reserved; auth uses Keycloak + session                    |
| `JWT_EXPIRES_IN`                                                             | API     | optional       | `1h`                         | Reserved                                                  |
| `REFRESH_TOKEN_SECRET`                                                       | API     | optional       | —                            | Reserved for future use                                   |
| `REFRESH_TOKEN_EXPIRES_IN`                                                   | API     | optional       | `7d`                         | Reserved                                                  |
| `COOKIE_SECURE`                                                              | API     | preprod, prod  | `true`                       | Session cookie                                            |
| `COOKIE_SAME_SITE`                                                           | API     | all            | `lax` / `none`               | Cross-site if needed                                      |
| `COOKIE_DOMAIN`                                                              | API     | optional       | `.example.com`               | Optional cookie domain                                    |
| `AUTH_PROVIDER`                                                              | API     | optional       | `keycloak`                   | Documented; Keycloak is default                           |
| `KEYCLOAK_URL`                                                               | API     | hosted         | `https://kc.example.com`     | Alias of `KEYCLOAK_BASE_URL`                              |
| `KEYCLOAK_BASE_URL`                                                          | API     | hosted         | server URL                   | Admin API                                                 |
| `KEYCLOAK_PUBLIC_URL`                                                        | API     | hosted         | public URL                   | Browser OIDC                                              |
| `KEYCLOAK_REALM`                                                             | API     | all            | `supplify-dev`               | **Per environment**                                       |
| `KEYCLOAK_CLIENT_ID`                                                         | API     | all            | `supplify-api`               |                                                           |
| `KEYCLOAK_CLIENT_SECRET`                                                     | API     | hosted         | secret                       |                                                           |
| `KEYCLOAK_ADMIN`                                                             | API     | hosted         | `admin`                      | Invite user provisioning                                  |
| `KEYCLOAK_ADMIN_PASSWORD`                                                    | API     | hosted         | secret                       |                                                           |
| `STORAGE_DRIVER`                                                             | API     | all            | `local` / `s3`               | prod requires `s3`                                        |
| `STORAGE_LOCAL_PATH`                                                         | API     | dev            | `uploads`                    | Local disk root                                           |
| `STORAGE_PUBLIC_URL`                                                         | API     | all            | URL                          | Public object URLs                                        |
| `STORAGE_ENDPOINT`                                                           | API     | s3             | R2 endpoint                  | S3-compatible                                             |
| `STORAGE_BUCKET`                                                             | API     | s3             | `supplify-dev`               | Per env bucket                                            |
| `STORAGE_ACCESS_KEY_ID`                                                      | API     | s3             | key                          |                                                           |
| `STORAGE_SECRET_ACCESS_KEY`                                                  | API     | s3             | secret                       |                                                           |
| `STORAGE_REGION`                                                             | API     | s3             | `auto`                       |                                                           |
| `STORAGE_PUBLIC_READ`                                                        | API     | s3             | `true`/`false`               | `false` for Railway Buckets (use API `/api/files/object`) |
| `STORAGE_S3_FORCE_PATH_STYLE`                                                | API     | s3             | `true`/`false`               | Auto `false` for Railway endpoints; `true` for MinIO      |
| Railway `ENDPOINT`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION` | API     | bucket service | —                            | Auto-map to `STORAGE_*` when unset                        |

See [docs/operations/STORAGE_UPLOADS.md](docs/operations/STORAGE_UPLOADS.md) for where file bytes are stored, the presign → PUT flow, and Railway volume / R2 setup.

| `EMAIL_PROVIDER` | API | optional | `sendgrid` | |
| `SENDGRID_API_KEY` | API | preprod, prod | key | Or `SMTP_HOST` |
| `SMTP_*` | API | optional | — | SMTP fallback |
| `PAYMENTS_MODE` | API | all | `mock`/`test`/`live` | **mock blocked in preprod/prod** |
| `BILLING_GATEWAY` | API | optional | `stub` | Overrides mode mapping |
| `PAYMENTS_PROVIDER` | API | live | `stripe` | Future provider id |
| `PAYMENTS_WEBHOOK_SECRET` | API | live | secret | Webhook verification |
| `LOG_LEVEL` | API | all | `debug`/`info`/`warn` | |
| `ENABLE_REQUEST_LOGGING` | API | all | `true`/`false` | HTTP request logs |
| `SENTRY_DSN` | API | optional | URL | Optional monitoring |
| `SENTRY_ENVIRONMENT` | API | optional | `dev` | Defaults to `APP_ENV` |
| `RATE_LIMIT_ENABLED` | API | all | `true`/`false` | Off in dev by default |
| `RATE_LIMIT_WINDOW_MS` | API | optional | `900000` | 15 minutes |
| `RATE_LIMIT_MAX` | API | optional | `300` | Per window |
| `TRUST_PROXY` | API | hosted | `true` | Behind Railway proxy |
| `ENABLE_SWAGGER` | API | dev | `true` | OpenAPI if implemented |
| `ENABLE_DEBUG_ROUTES` | API | dev | `true` | Gates `/api/e2e` |
| `ENABLE_SEED_ROUTES` | API | dev | `true` | Demo/seed tooling |
| `RUN_MIGRATIONS_ON_START` | API | optional | `false` | Prefer manual migrate |
| `ALLOW_DB_RESET` | API | dev | `true` | Never true in prod |
| `SEED_DEMO_DATA` | API | dev | `true` | Never true in prod |
| `E2E_SECRET` | API | dev only | secret | With `ENABLE_DEBUG_ROUTES` |
| `REDIS_URL` | API | optional | `redis://...` | Cache |
| `SUPPLIFY_MODEL_VERSION` | API | optional | `v1` / `v2` | Business model experiment; default `v1`. See [SUPPLIFY_MODEL_VERSIONING.md](SUPPLIFY_MODEL_VERSIONING.md) |

Legacy aliases still supported: `S3_*` → `STORAGE_*`, `API_PUBLIC_URL` = `PUBLIC_API_URL`.

## Frontend (Web / Vite)

| Variable                      | Used by | Required in   | Example              | Notes                                    |
| ----------------------------- | ------- | ------------- | -------------------- | ---------------------------------------- |
| `VITE_APP_ENV`                | Web     | all           | `dev`                | Build-time                               |
| `VITE_API_URL`                | Web     | preprod, prod | `https://api...`     | Empty = dev proxy                        |
| `VITE_PUBLIC_FRONTEND_URL`    | Web     | optional      | `https://app...`     |                                          |
| `VITE_AUTH_PROVIDER`          | Web     | optional      | `keycloak`           |                                          |
| `VITE_KEYCLOAK_URL`           | Web     | all           | URL                  |                                          |
| `VITE_KEYCLOAK_REALM`         | Web     | all           | `supplify-dev`       | Match API realm                          |
| `VITE_KEYCLOAK_CLIENT_ID`     | Web     | all           | `supplify-web`       |                                          |
| `VITE_PAYMENTS_MODE`          | Web     | all           | `mock`/`test`/`live` | UI gating                                |
| `VITE_PAYMENTS_PUBLIC_KEY`    | Web     | live          | pk\_...              | Provider public key                      |
| `VITE_SENTRY_DSN`             | Web     | optional      | URL                  |                                          |
| `VITE_SENTRY_ENVIRONMENT`     | Web     | optional      | `dev`                |                                          |
| `VITE_ENABLE_DEBUG_UI`        | Web     | dev           | `true`               | Debug panels                             |
| `VITE_ENABLE_DEMO_BANNERS`    | Web     | dev/preprod   | `true`               |                                          |
| `VITE_ENABLE_MOCK_PAYMENTS`   | Web     | dev           | `true`               |                                          |
| `VITE_ENABLE_TEST_DATA`       | Web     | dev           | `true`               |                                          |
| `VITE_SUPPLIFY_MODEL_VERSION` | Web     | optional      | `v1` / `v2`          | Must match API; build-time. Default `v1` |

Access in code: `apps/web/src/lib/env.ts`. See [SUPPLIFY_MODEL_VERSIONING.md](SUPPLIFY_MODEL_VERSIONING.md).

Deploy templates: `deploy/railway/<env>/api.env` and `web.env` include commented examples for V2 experiments.

## Health endpoints

| Route         | Response (preprod/prod)                                  |
| ------------- | -------------------------------------------------------- |
| `GET /health` | `{ status, service, env }` — optional detail in dev only |
| `GET /ready`  | `{ status, service, env }` after DB ping                 |
