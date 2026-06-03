# Railway dashboard — development (minimal)

**Do not duplicate** `api.env` / `web.env` in the dashboard unless overriding a single value.
**Never set `PORT`** in the dashboard.

## Cross-origin cookies (Railway)

Web (`supplify-web-…`) and API (`supplify-api-…`) are **different hosts**. Auth cookies need `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true` (set in `development/api.env` from git). Do not override to `lax` in the dashboard.

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

## Wrong values that break login (not 502)

| Variable                  | Wrong          | Right                           |
| ------------------------- | -------------- | ------------------------------- |
| `KEYCLOAK_CLIENT_SECRET`  | `supplify-api` | Client **secret** from Keycloak |
| `VITE_KEYCLOAK_CLIENT_ID` | `supplify-api` | `supplify-web`                  |

## 502 on /health

1. Remove `PORT` from API variables.
2. API → Settings → Networking → port matches `Server started on 0.0.0.0:XXXX` in deploy logs.
3. Redeploy API after git pull (server listens before DB migrations finish).
