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
SMTP_HOST=localhost
SMTP_PORT=1025
```

## Web service

Clear all `VITE_*` from the dashboard — the Docker build uses `development/web.env` from git.

## Wrong values that break login (not 502)

| Variable                  | Wrong          | Right                           |
| ------------------------- | -------------- | ------------------------------- |
| `KEYCLOAK_CLIENT_SECRET`  | `supplify-api` | Client **secret** from Keycloak |
| `VITE_KEYCLOAK_CLIENT_ID` | `supplify-api` | `supplify-web`                  |

## 502 on /health

1. Remove `PORT` from API variables.
2. API → Settings → Networking → port matches `Server started on 0.0.0.0:XXXX` in deploy logs.
3. Redeploy API after git pull (server listens before DB migrations finish).
