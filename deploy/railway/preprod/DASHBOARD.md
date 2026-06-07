# Railway dashboard — preprod (Keycloak)

Realm **`supplify-preprod`** is imported automatically on first boot — no Admin UI import.

## Keycloak service (one-time)

| Setting        | Value                                              |
| -------------- | -------------------------------------------------- |
| Root Directory | _(empty)_                                          |
| Config file    | `/deploy/railway/preprod/keycloak/railway.json`    |
| Start command  | `/opt/keycloak/bin/kc.sh start-dev --import-realm` |

Variables: paste full `deploy/railway/preprod/keycloak.env` (includes dedicated `KC_DB_*` for database **`keycloak`**) + `KEYCLOAK_ADMIN_PASSWORD` (same on Keycloak and API).

One-time on Postgres: `CREATE DATABASE keycloak;` — see [`../KEYCLOAK_RAILWAY_DB_NOTES.md`](../KEYCLOAK_RAILWAY_DB_NOTES.md). **Do not** set `DATABASE_URL` on the Keycloak service.

Set **`KC_HOSTNAME`** to your real preprod Keycloak host (no `https://`).

## After deploy

`https://<KC_HOSTNAME>/realms/supplify-preprod/.well-known/openid-configuration` → JSON.

API: `KEYCLOAK_REALM=supplify-preprod`, `KEYCLOAK_CLIENT_SECRET` = client secret from Keycloak (rotate off `changeme`).  
Web: rebuild with `RAILWAY_DEPLOY_ENV=preprod`.

See [`../keycloak/RAILWAY_SETUP.md`](../keycloak/RAILWAY_SETUP.md).
