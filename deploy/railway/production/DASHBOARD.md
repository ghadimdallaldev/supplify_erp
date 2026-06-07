# Railway dashboard — production (Keycloak)

Realm **`supplify-prod`** is imported automatically on first boot — no Admin UI import.

## Keycloak service (one-time)

| Setting        | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Root Directory | _(empty)_                                                                            |
| Config file    | `/deploy/railway/production/keycloak/railway.json`                                   |
| Start command  | `/opt/keycloak/bin/railway-entrypoint.sh start --import-realm` (from `railway.json`) |
| Healthcheck    | `/health/ready`, timeout **600**                                                     |

Variables: `pnpm railway:keycloak:sync -- production` or paste `deploy/railway/production/keycloak.env` + strong `KEYCLOAK_ADMIN_PASSWORD` (same on Keycloak and API).

Postgres DB **`keycloak`** is auto-created on boot — see [`../KEYCLOAK_RAILWAY_DB_NOTES.md`](../KEYCLOAK_RAILWAY_DB_NOTES.md). **Do not** set `DATABASE_URL` on the Keycloak service.

Set **`KC_HOSTNAME`** to production Keycloak host (e.g. `keycloak.yourdomain.com`).

**Before first prod deploy:** update redirect URIs in `deploy/keycloak/realm-export.prod.json` and rotate `REPLACE_BEFORE_IMPORT` client secret; set API `KEYCLOAK_CLIENT_SECRET` to match.

## After deploy

`https://<KC_HOSTNAME>/realms/supplify-prod/.well-known/openid-configuration` → JSON.

See [`../keycloak/RAILWAY_SETUP.md`](../keycloak/RAILWAY_SETUP.md).
