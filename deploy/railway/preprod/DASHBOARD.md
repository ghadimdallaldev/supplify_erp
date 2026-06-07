# Railway dashboard — preprod (Keycloak)

Realm **`supplify-preprod`** is imported automatically on first boot — no Admin UI import.

## Keycloak service (one-time)

| Setting        | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Root Directory | _(empty)_                                                                            |
| Config file    | `/deploy/railway/preprod/keycloak/railway.json`                                      |
| Start command  | `/opt/keycloak/bin/railway-entrypoint.sh start --import-realm` (from `railway.json`) |
| Healthcheck    | `/health/ready`, timeout **600**                                                     |

Variables: `pnpm railway:keycloak:sync -- preprod` or paste `deploy/railway/preprod/keycloak.env` + `KEYCLOAK_ADMIN_PASSWORD` (same on Keycloak and API).

Postgres DB **`keycloak`** is auto-created on boot — see [`../KEYCLOAK_RAILWAY_DB_NOTES.md`](../KEYCLOAK_RAILWAY_DB_NOTES.md). **Do not** set `DATABASE_URL` on the Keycloak service.

Set **`KC_HOSTNAME`** to your real preprod Keycloak host (no `https://`).

## After deploy

`https://<KC_HOSTNAME>/realms/supplify-preprod/.well-known/openid-configuration` → JSON.

API: `KEYCLOAK_REALM=supplify-preprod`, `KEYCLOAK_CLIENT_SECRET` = client secret from Keycloak (rotate off `changeme`).  
Web: rebuild with `RAILWAY_DEPLOY_ENV=preprod`.

See [`../keycloak/RAILWAY_SETUP.md`](../keycloak/RAILWAY_SETUP.md).
