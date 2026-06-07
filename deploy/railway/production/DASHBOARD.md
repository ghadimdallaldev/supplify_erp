# Railway dashboard — production (Keycloak)

Realm **`supplify-prod`** is imported automatically on first boot — no Admin UI import.

## Keycloak service (one-time)

| Setting        | Value                                              |
| -------------- | -------------------------------------------------- |
| Root Directory | _(empty)_                                          |
| Config file    | `/deploy/railway/production/keycloak/railway.json` |
| Start command  | `/opt/keycloak/bin/kc.sh start --import-realm`     |

Variables: paste full `deploy/railway/production/keycloak.env` (includes dedicated `KC_DB_*` for database **`keycloak`**) + strong `KEYCLOAK_ADMIN_PASSWORD` (same on Keycloak and API).

One-time on Postgres: `CREATE DATABASE keycloak;` — see [`../KEYCLOAK_RAILWAY_DB_NOTES.md`](../KEYCLOAK_RAILWAY_DB_NOTES.md). **Do not** set `DATABASE_URL` on the Keycloak service.

Set **`KC_HOSTNAME`** to production Keycloak host (e.g. `keycloak.yourdomain.com`).

**Before first prod deploy:** update redirect URIs in `deploy/keycloak/realm-export.prod.json` and rotate `REPLACE_BEFORE_IMPORT` client secret; set API `KEYCLOAK_CLIENT_SECRET` to match.

## After deploy

`https://<KC_HOSTNAME>/realms/supplify-prod/.well-known/openid-configuration` → JSON.

See [`../keycloak/RAILWAY_SETUP.md`](../keycloak/RAILWAY_SETUP.md).
