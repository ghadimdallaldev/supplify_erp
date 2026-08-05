# Environment variables reference

Templates: `apps/api/.env.{dev,preprod,prod}.example`, `apps/web/.env.{dev,preprod,prod}.example`.  
Set secrets only in Railway — never commit real values.

## Backend (API)

| Variable                                                                     | Used by | Required in    | Example                                                 | Notes                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                                                                    | API     | all hosted     | `dev` / `preprod` / `prod`                              | Drives safety defaults                                                                                                                                                       |
| `NODE_ENV`                                                                   | API     | all            | `development` / `production`                            | Node runtime mode                                                                                                                                                            |
| `PORT`                                                                       | API     | all            | `4000`                                                  | Railway sets automatically                                                                                                                                                   |
| `DATABASE_URL`                                                               | API     | all hosted     | `postgresql://...`                                      | **Unique per environment**                                                                                                                                                   |
| `DATABASE_SSL`                                                               | API     | preprod, prod  | `true`                                                  | Required for Railway Postgres                                                                                                                                                |
| `DATABASE_SSL_REJECT_UNAUTHORIZED`                                           | API     | hosted         | `false`                                                 | Set `false` to accept Railway's self-signed TLS cert; committed `false` in all Railway `api.env` files (security trade-off: accepts any cert on the Railway private network) |
| `CORS_ORIGIN`                                                                | API     | preprod, prod  | `https://app.example.com`                               | Comma-separated origins                                                                                                                                                      |
| `WEB_ORIGINS`                                                                | API     | optional       | same as CORS                                            | Legacy alias; merged with CORS                                                                                                                                               |
| `WEB_ORIGIN`                                                                 | API     | optional       | primary origin                                          | Staff links, OAuth redirects                                                                                                                                                 |
| `OAUTH_CALLBACK_BASE_URL`                                                    | API     | all hosted     | `https://api.example.com`                               | Forces first-party OAuth callback origin; critical for mobile Chrome auth to prevent redirect mismatches                                                                     |
| `STAFF_PORTAL_BASE_URL`                                                      | API     | all hosted     | `https://staff.example.com`                             | Base URL for staff portal links in notifications                                                                                                                             |
| `PUBLIC_RESERVATION_BASE_URL`                                                | API     | optional       | `https://reserve.example.com`                           | Base URL for public reservation booking links                                                                                                                                |
| `PUBLIC_API_URL`                                                             | API     | hosted         | `https://api.example.com`                               | Alias of `API_PUBLIC_URL`                                                                                                                                                    |
| `PUBLIC_FRONTEND_URL`                                                        | API     | hosted         | `https://app.example.com`                               | Added to CORS allow list                                                                                                                                                     |
| `SESSION_SECRET`                                                             | API     | all hosted     | 64-char hex                                             | Session signing; ≥32 chars in prod                                                                                                                                           |
| `CONSUMER_AUTH_SECRET`                                                       | API     | optional       | 64-char hex                                             | B2C diner JWT (`consumer_auth_token`); not Keycloak; defaults to `SESSION_SECRET`                                                                                            |
| `IMPERSONATION_SECRET`                                                       | API     | hosted         | 64-char hex                                             | Defaults to `SESSION_SECRET`                                                                                                                                                 |
| `JWT_SECRET`                                                                 | API     | optional       | —                                                       | Reserved; auth uses Keycloak + session                                                                                                                                       |
| `JWT_EXPIRES_IN`                                                             | API     | optional       | `1h`                                                    | Reserved                                                                                                                                                                     |
| `REFRESH_TOKEN_SECRET`                                                       | API     | optional       | —                                                       | Reserved for future use                                                                                                                                                      |
| `REFRESH_TOKEN_EXPIRES_IN`                                                   | API     | optional       | `7d`                                                    | Reserved                                                                                                                                                                     |
| `COOKIE_SECURE`                                                              | API     | preprod, prod  | `true`                                                  | Session cookie                                                                                                                                                               |
| `COOKIE_SAME_SITE`                                                           | API     | all            | `lax` / `none`                                          | Cross-site if needed                                                                                                                                                         |
| `COOKIE_DOMAIN`                                                              | API     | optional       | `.example.com`                                          | Optional cookie domain                                                                                                                                                       |
| `AUTH_PROVIDER`                                                              | API     | optional       | `keycloak`                                              | Documented; Keycloak is default                                                                                                                                              |
| `KEYCLOAK_URL`                                                               | API     | hosted         | `https://kc.example.com`                                | Alias of `KEYCLOAK_BASE_URL`                                                                                                                                                 |
| `KEYCLOAK_BASE_URL`                                                          | API     | hosted         | server URL                                              | Admin API                                                                                                                                                                    |
| `KEYCLOAK_PUBLIC_URL`                                                        | API     | hosted         | public URL                                              | Browser OIDC                                                                                                                                                                 |
| `KEYCLOAK_REALM`                                                             | API     | all            | `Supplify` (dev) / `supplify-preprod` / `supplify-prod` | **Per environment** — see env-matrix.md                                                                                                                                      |
| `KEYCLOAK_CLIENT_ID`                                                         | API     | all            | `supplify-api`                                          |                                                                                                                                                                              |
| `KEYCLOAK_CLIENT_SECRET`                                                     | API     | hosted         | secret                                                  |                                                                                                                                                                              |
| `KEYCLOAK_ADMIN`                                                             | API     | hosted         | `admin`                                                 | Invite user provisioning                                                                                                                                                     |
| `KEYCLOAK_ADMIN_PASSWORD`                                                    | API     | hosted         | secret                                                  |                                                                                                                                                                              |
| `STORAGE_DRIVER`                                                             | API     | all            | `local` / `s3`                                          | prod requires `s3`                                                                                                                                                           |
| `STORAGE_LOCAL_PATH`                                                         | API     | dev            | `uploads`                                               | Local disk root                                                                                                                                                              |
| `STORAGE_PUBLIC_URL`                                                         | API     | all            | URL                                                     | Public object URLs                                                                                                                                                           |
| `STORAGE_ENDPOINT`                                                           | API     | s3             | R2 endpoint                                             | S3-compatible                                                                                                                                                                |
| `STORAGE_BUCKET`                                                             | API     | s3             | `supplify-dev`                                          | Per env bucket                                                                                                                                                               |
| `STORAGE_ACCESS_KEY_ID`                                                      | API     | s3             | key                                                     |                                                                                                                                                                              |
| `STORAGE_SECRET_ACCESS_KEY`                                                  | API     | s3             | secret                                                  |                                                                                                                                                                              |
| `STORAGE_REGION`                                                             | API     | s3             | `auto`                                                  |                                                                                                                                                                              |
| `STORAGE_PUBLIC_READ`                                                        | API     | s3             | `true`/`false`                                          | `false` for Railway Buckets (use API `/api/files/object`)                                                                                                                    |
| `STORAGE_S3_FORCE_PATH_STYLE`                                                | API     | s3             | `true`/`false`                                          | Auto `false` for Railway endpoints; `true` for MinIO                                                                                                                         |
| Railway `ENDPOINT`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION` | API     | bucket service | —                                                       | Auto-map to `STORAGE_*` when unset                                                                                                                                           |
| `IMPORT_ZIP_MAX_BYTES`                                                       | API     | optional       | `2147483648` (2 GB)                                     | Max ZIP size for bulk product image import presign                                                                                                                           |
| `IMPORT_IMAGE_MAX_BYTES`                                                     | API     | optional       | `10485760` (10 MB)                                      | Max size per image entry inside a ZIP or URL fetch during import                                                                                                             |

See [../operations/storage-uploads.md](../operations/storage-uploads.md) for where file bytes are stored, the presign → PUT flow, bulk image import dual path, and Railway volume / R2 setup.

| `EMAIL_ENABLED` | API | all | `true`/`false` | Master switch (default `true`) |
| `EMAIL_LOG_ONLY` | API | dev | `true`/`false` | Log only, no network send (Railway dev default) |
| `EMAIL_PROVIDER` | API | optional | `smtp` | Transport selection |
| `EMAIL_FROM_NAME` | API | all | `Supplify` | From display name |
| `EMAIL_FROM_ADDRESS` | API | preprod, prod | `noreply@…` | From email (falls back to `SMTP_FROM`) |
| `EMAIL_REPLY_TO` | API | optional | email | Optional reply-to header |
| `EMAIL_TEST_TO` | API | dev | email | Default recipient for `pnpm email:test` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | API | preprod, prod | — | Email transport (Resend recommended); `SMTP_PASS` only in Railway secrets |
| `MAILPIT_SMTP_PORT` / `MAILPIT_UI_PORT` | Docker local | dev | `1025` / `8025` | Mailpit fake SMTP in root `docker-compose.yml`; UI at http://localhost:8025 |

See [../features/notifications-and-alerts.md](../features/notifications-and-alerts.md) for templates, triggers, push, and WhatsApp.

### WhatsApp (Meta Cloud API)

| Variable                        | Used by | Required  | Default | Notes                            |
| ------------------------------- | ------- | --------- | ------- | -------------------------------- |
| `WHATSAPP_ENABLED`              | API     | optional  | `false` | Master switch for server send    |
| `WHATSAPP_LOG_ONLY`             | API     | dev       | `false` | Log only, no network send        |
| `WHATSAPP_ACCESS_TOKEN`         | API     | when live | —       | Meta Business API token (secret) |
| `WHATSAPP_PHONE_NUMBER_ID`      | API     | when live | —       | Meta phone number ID             |
| `WHATSAPP_API_VERSION`          | API     | optional  | `v21.0` | Graph API version                |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | API     | webhook   | —       | Meta webhook challenge           |
| `WHATSAPP_APP_SECRET`           | API     | webhook   | —       | Inbound signature verification   |

See [../features/notifications-and-alerts.md](../features/notifications-and-alerts.md) § WhatsApp.
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
| `RUN_MIGRATIONS_ON_START` | API | optional | `true` (Railway); `false` (local) | All Railway `deploy/railway/*/api.env` files commit `true`; local dev runs migrations via `pnpm db:migrate` |
| `IMPERSONATION_MAX_DURATION_MINUTES` | API | optional | `480` (8 h) | Max admin impersonation session before auto-expiry |
| `ALLOW_DB_RESET` | API | dev | `true` | Never true in prod |
| `SEED_DEMO_DATA` | API | dev | `true` | Never true in prod |
| `E2E_SECRET` | API | dev only | secret | With `ENABLE_DEBUG_ROUTES` |
| `REDIS_URL` | API | recommended | `redis://...` | Shared cache (permissions, subscription, entitlements); required on multi-replica Railway |
| `DATABASE_POOL_MAX` | API | optional | `20` | Max Postgres pool connections |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | API | optional | `600000` | Close idle pool clients after 10 min (not 30s) |
| `SLOW_REQUEST_MS` | API | optional | `800` | Log `http.request.slow_breakdown` above this (ms) |
| `IDLE_PERF_LOG_MS` | API | optional | `0` | Log `http.request.perf_sample` above this (ms); use `500` to debug idle |
| `DB_KEEPALIVE_ENABLED` | API | optional | `true` (prod Railway) | Periodic `SELECT 1` to keep pool warm |
| `DB_KEEPALIVE_INTERVAL_SECONDS` | API | optional | `60` | Keepalive interval when enabled (≥ 10) |
| `DB_POOL_KEEPALIVE_MS` | API | optional | `0` | Legacy: interval in ms if ≥ 10000, overrides seconds |
| `CRONS_ENABLED` | API | optional | `true` | In-process scheduled jobs; set `false` on read-only replicas |
| `CRON_SCHEDULED_ORDERS_INTERVAL_MS` | API | optional | `300000` (dev), `3600000` (prod) | Quick list auto-order poll interval |
| `CRON_OPERATIONAL_REMINDERS_INTERVAL_MS` | API | optional | `86400000` (24 h) | Inventory expiry + reorder cadence reminder job |

### AI platform (Smart Reorder LLM)

| Variable                             | Used by | Required    | Default       | Notes                                                 |
| ------------------------------------ | ------- | ----------- | ------------- | ----------------------------------------------------- |
| `AI_ENABLED`                         | API     | optional    | `false`       | Kill switch; heuristic reorder assist still works     |
| `AI_PROVIDER`                        | API     | optional    | `openai`      | Provider id                                           |
| `OPENAI_API_KEY`                     | API     | when LLM on | —             | Secret; never commit                                  |
| `AI_MODEL`                           | API     | optional    | `gpt-4o-mini` | OpenAI chat model                                     |
| `AI_MAX_REQUESTS_PER_TENANT_PER_DAY` | API     | optional    | `50`          | Hard ceiling; plan `ai_requests_per_day` also applies |

Tenant gating: plan feature `ai_platform` + admin global/per-tenant overrides. See [../features/ai-smart-reorder.md](../features/ai-smart-reorder.md).

See [../operations/cron-jobs.md](../operations/cron-jobs.md) for the full job inventory.

### Email OTP authentication

| Variable                                 | Used by | Required | Default | Notes                                                                                                                                        |
| ---------------------------------------- | ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_EMAIL_OTP_ENABLED`                 | API     | all      | `true`  | Enable/disable Keycloak email OTP flow at the API layer                                                                                      |
| `AUTH_EMAIL_OTP_INTERNAL_SECRET`         | API     | all      | —       | Shared secret between API and Keycloak OTP provider (secret)                                                                                 |
| `AUTH_EMAIL_OTP_LENGTH`                  | API     | optional | `6`     | OTP code length                                                                                                                              |
| `AUTH_EMAIL_OTP_TTL_SECONDS`             | API     | optional | `300`   | Code validity window                                                                                                                         |
| `AUTH_EMAIL_OTP_MAX_ATTEMPTS`            | API     | optional | `5`     | Failed attempts before code invalidated                                                                                                      |
| `AUTH_EMAIL_OTP_RESEND_COOLDOWN_SECONDS` | API     | optional | `60`    | Minimum time between resend requests                                                                                                         |
| `AUTH_EMAIL_OTP_SEND_WINDOW_MS`          | API     | optional | —       | Rate window for OTP sends                                                                                                                    |
| `AUTH_EMAIL_OTP_SEND_MAX`                | API     | optional | —       | Max OTP sends per window                                                                                                                     |
| `AUTH_EMAIL_OTP_DRIVER_BYPASS`           | API     | optional | `true`  | When `true`, drivers with `supplify_driver_login=true` Keycloak attribute skip OTP. Set `false` to force drivers through OTP on every login. |

### Delivery GPS / live tracking (API)

| Variable                             | Used by | Default  | Notes                                                                       |
| ------------------------------------ | ------- | -------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GPS_TRACKING_ENABLED`               | API     | `true`   | Legacy master switch for ingest + tracking reads                            |
| `GPS_TRACKING_SESSIONS_ENABLED`      | API     | `false`  | Enable GPS session creation (committed `true` in all Railway `api.env`)     |
| `GPS_LIVE_EVENTS_ENABLED`            | API     | `false`  | Enable live GPS event streaming (committed `true` in all Railway `api.env`) |
| `GPS_OFFLINE_QUEUE_ENABLED`          | API     | `false`  | Enable offline GPS event queue for drivers without connectivity             |
| `GPS_GEOFENCE_ENABLED`               | API     | `false`  | Enable geofence alerts on delivery arrival                                  |
| `GPS_STALE_AFTER_SECONDS`            | API     | `300`    | Stale threshold on `tracking.isStale`                                       |
| `GPS_UPDATE_INTERVAL_SECONDS`        | API     | `15`     | Driver client poll hint                                                     |
| `GPS_MIN_ACCURACY_METERS`            | API     | `100`    | Low-accuracy ping filtering                                                 |
| `GPS_LOCATION_RETENTION_DAYS`        | API     | `90`     | Retention policy (cron TBD)                                                 |
| `GPS_ALLOW_RESTAURANT_LIVE_TRACKING` | API     | `true`   | Restaurant `GET /api/orders/:id/tracking`                                   |
| `GPS_RESTAURANT_SHOW_DRIVER_NAME`    | API     | `true`   | Include driver name in restaurant payload                                   |
| `GPS_RESTAURANT_SHOW_DRIVER_PHONE`   | API     | `false`  | Hide driver phone unless enabled                                            |
| `GPS_ALLOW_DRIVER_BACKGROUND_HINT`   | API     | `true`   | Driver UX hint                                                              |
| `MAP_PROVIDER`                       | API     | `google` | Map provider for server-side embed helpers                                  |
| `GOOGLE_MAPS_API_KEY`                | API     | —        | Optional server map key                                                     |
| `MAPBOX_ACCESS_TOKEN`                | API     | —        | Optional Mapbox                                                             |
| `DELIVERY_ETA_CITY_SPEED_KMH`        | API     | optional | `40`                                                                        | Average city speed used by server-side ETA calculation |
| `DELIVERY_ETA_MIN_MULTIPLIER`        | API     | optional | `1.0`                                                                       | Minimum ETA multiplier                                 |
| `DELIVERY_ETA_MAX_MULTIPLIER`        | API     | optional | `2.0`                                                                       | Maximum ETA multiplier                                 |
| `DELIVERY_ETA_SERVICE_TIME_MINUTES`  | API     | optional | `5`                                                                         | Per-stop service time added to route ETA               |

Spec: [../features/drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md).

### Web push (VAPID)

| Variable            | Used by | Required     | Notes                                                                       |
| ------------------- | ------- | ------------ | --------------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`  | API     | push-enabled | VAPID public key for web push. Generate: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | API     | push-enabled | VAPID private key — **secret**, store in Railway secrets only               |
| `VAPID_EMAIL`       | API     | push-enabled | Contact email sent with VAPID; format `mailto:you@example.com`              |

### Payments

| Variable              | Used by | Required | Notes                                    |
| --------------------- | ------- | -------- | ---------------------------------------- |
| `PAYMENTS_SECRET_KEY` | API     | prod     | Payment provider secret key — **secret** |

Legacy aliases still supported: `S3_*` → `STORAGE_*`, `API_PUBLIC_URL` = `PUBLIC_API_URL`.

## Frontend (Web / Vite)

| Variable                             | Used by   | Required in   | Example                    | Notes                                                                                                                                                                           |
| ------------------------------------ | --------- | ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_APP_ENV`                       | Web       | all           | `dev`                      | Build-time                                                                                                                                                                      |
| `VITE_API_URL`                       | Web       | preprod, prod | `https://api...`           | Empty = dev proxy                                                                                                                                                               |
| `VITE_PUBLIC_FRONTEND_URL`           | Web       | optional      | `https://app...`           |                                                                                                                                                                                 |
| `VITE_AUTH_PROVIDER`                 | Web       | optional      | `keycloak`                 |                                                                                                                                                                                 |
| `VITE_KEYCLOAK_URL`                  | Web       | all           | URL                        |                                                                                                                                                                                 |
| `VITE_KEYCLOAK_REALM`                | Web       | all           | `Supplify` (dev) / per-env | Match API realm — see env-matrix.md                                                                                                                                             |
| `VITE_KEYCLOAK_CLIENT_ID`            | Web       | all           | `supplify-web`             |                                                                                                                                                                                 |
| `VITE_PAYMENTS_MODE`                 | Web       | all           | `mock`/`test`/`live`       | UI gating                                                                                                                                                                       |
| `VITE_PAYMENTS_PUBLIC_KEY`           | Web       | live          | pk\_...                    | Provider public key                                                                                                                                                             |
| `VITE_SENTRY_DSN`                    | Web       | optional      | URL                        |                                                                                                                                                                                 |
| `VITE_SENTRY_ENVIRONMENT`            | Web       | optional      | `dev`                      |                                                                                                                                                                                 |
| `VITE_ENABLE_DEBUG_UI`               | Web       | dev           | `true`                     | Debug panels                                                                                                                                                                    |
| `VITE_ENABLE_DEMO_BANNERS`           | Web       | dev/preprod   | `true`                     |                                                                                                                                                                                 |
| `VITE_ENABLE_MOCK_PAYMENTS`          | Web       | dev           | `true`                     |                                                                                                                                                                                 |
| `VITE_ENABLE_TEST_DATA`              | Web       | dev           | `true`                     |                                                                                                                                                                                 |
| `VITE_GPS_TRACKING_ENABLED`          | Web       | optional      | `true`                     | Tracking panels / driver UI                                                                                                                                                     |
| `VITE_GPS_UPDATE_INTERVAL_SECONDS`   | Web       | optional      | `15`                       | Driver location poll hint                                                                                                                                                       |
| `VITE_GOOGLE_MAPS_API_KEY`           | Web       | optional      | —                          | Map embed; fallback link if unset                                                                                                                                               |
| `VITE_MAPBOX_ACCESS_TOKEN`           | Web       | optional      | —                          | Mapbox (link fallback)                                                                                                                                                          |
| `VITE_MAP_PROVIDER`                  | Web       | optional      | `google`                   | Map provider                                                                                                                                                                    |
| `VITE_GPS_TRACKING_SESSIONS_ENABLED` | Web       | optional      | `false`                    | Mirror of API GPS sessions flag for UI gating                                                                                                                                   |
| `VITE_GPS_LIVE_EVENTS_ENABLED`       | Web       | optional      | `false`                    | Mirror of API GPS live events flag                                                                                                                                              |
| `VITE_CLIENT_STATE_RESET_TOKEN`      | Web       | optional      | —                          | Bump this value on deploy to force all clients to clear persisted RTK/Redux state. Change any time a breaking store shape change is deployed. Set in Railway dev web env.       |
| `NGINX_API_UPSTREAM`                 | Web/nginx | hosted        | `http://api:4000`          | Overrides the API upstream in the nginx same-origin proxy config. Used in Railway dev to work around TLS timing on custom domains. Set in `deploy/railway/development/web.env`. |

Access in code: `apps/web/src/lib/env.ts`.

## Health endpoints

| Route         | Response (preprod/prod)                                  |
| ------------- | -------------------------------------------------------- |
| `GET /health` | `{ status, service, env }` — optional detail in dev only |
| `GET /ready`  | `{ status, service, env }` after DB ping                 |
