# Railway dashboard — development (minimal)

**Do not duplicate** `api.env` / `web.env` in the dashboard unless overriding a single value.
**Never set `PORT`** in the dashboard.

## Same-origin auth (Railway web nginx proxy)

The dev web build **does not set `VITE_API_URL`**. Nginx on the web service proxies `/auth`, `/api`, and `/socket.io` to `NGINX_API_UPSTREAM` (see `development/web.env`) so session cookies are **first-party** on the web host. This is required for **mobile Chrome** login (third-party cookies on `*.up.railway.app` are often blocked).

After changing `NGINX_API_UPSTREAM` or re-enabling `VITE_API_URL`, redeploy **web** and add the web callback URI in Keycloak (below).

API still uses `COOKIE_SAME_SITE=none` in `development/api.env` for direct API hits; do not override to `lax` in the dashboard.

## API service — keep only these in Raw Editor

```env
DATABASE_URL=${{Postgres-dev.DATABASE_URL}}
SESSION_SECRET=<32+ hex>
IMPERSONATION_SECRET=<32+ hex>
KEYCLOAK_CLIENT_SECRET=<from Keycloak → supplify-api → Credentials, often changeme>
KEYCLOAK_ADMIN_PASSWORD=<Keycloak container admin password>
```

Optional override only if needed:

```env
# Email defaults load from development/api.env (EMAIL_LOG_ONLY=true).
# Set SMTP_PASS in secrets.env.example only when testing real SMTP sends.
```

## Web service

Clear all `VITE_*` from the dashboard — the Docker build uses `development/web.env` from git.

**Optional (map embed):** To show embedded Google Maps instead of “Open in Google Maps” only, add a **one-time** build override on the web service, then redeploy web:

```env
VITE_GOOGLE_MAPS_API_KEY=<your Google Maps JavaScript API key>
```

GPS tracking works without this key (fallback link still works).

## After this deploy (GPS + restaurant ops)

1. Run migrations **0133–0137** on dev Postgres (`pnpm db:migrate` with dev `DATABASE_URL`).
2. Redeploy **API** and **Web** (API loads `development/api.env`; web rebuild picks `development/web.env`).
3. No extra dashboard vars for GPS unless you enable map embed (above) or server-side `GOOGLE_MAPS_API_KEY` on API.

## Keycloak (automatic realm import)

Build from `deploy/railway/development/keycloak/railway.json` — realm **Supplify** imports on first boot.  
Sync vars: `pnpm railway:keycloak:sync -- development` (includes JVM caps, `KEYCLOAK_USE_OPTIMIZED=false`).  
Set `KEYCLOAK_ADMIN_PASSWORD` on **Keycloak** and **API** (same value).

Remove legacy dashboard vars: `KC_PROXY`, `KC_DB`. See [`../keycloak/RAILWAY_SETUP.md`](../keycloak/RAILWAY_SETUP.md), [`../KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](../KEYCLOAK_RAILWAY_MEMORY_NOTES.md), [`../../docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`](../../docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md).

## Wrong values that break login (not 502)

| Variable                  | Wrong          | Right                           |
| ------------------------- | -------------- | ------------------------------- |
| `KEYCLOAK_CLIENT_SECRET`  | `supplify-api` | Client **secret** from Keycloak |
| `VITE_KEYCLOAK_CLIENT_ID` | `supplify-api` | `supplify-web`                  |

## 502 on /health

1. Remove `PORT` from API variables.
2. API → Settings → Networking → port matches `Server started on 0.0.0.0:XXXX` in deploy logs.
3. Redeploy API after git pull (server listens before DB migrations finish).
