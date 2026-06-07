# Keycloak on Railway (all environments)

`--import-realm` only imports JSON files baked into the image at  
`/opt/keycloak/data/import/<realm>-realm.json`.  
Do **not** deploy the stock Keycloak image without building these Dockerfiles.

**Database / persistence (required):** dedicated Postgres database **`keycloak`**, never `DATABASE_URL` on the Keycloak service — [`KEYCLOAK_RAILWAY_DB_NOTES.md`](../KEYCLOAK_RAILWAY_DB_NOTES.md).

## Per-environment Railway settings

| Environment     | Config file                                         | Realm              | Start command                                            |
| --------------- | --------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| **development** | `/deploy/railway/development/keycloak/railway.json` | `Supplify`         | `railway-entrypoint.sh start --optimized --import-realm` |
| **preprod**     | `/deploy/railway/preprod/keycloak/railway.json`     | `supplify-preprod` | `railway-entrypoint.sh start --optimized --import-realm` |
| **staging**     | `/deploy/railway/staging/keycloak/railway.json`     | `supplify-preprod` | `railway-entrypoint.sh start --optimized --import-realm` |
| **production**  | `/deploy/railway/production/keycloak/railway.json`  | `supplify-prod`    | `railway-entrypoint.sh start --optimized --import-realm` |

All environments build **`deploy/railway/keycloak/Dockerfile`** (shared image: realm JSON, `railway-entrypoint.sh`, psql via ubi-micro stage; `railway.json` sets `buildArgs`).

For every Keycloak service:

| Setting            | Value                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **Root Directory** | _(empty — repo root)_                                                                     |
| **Config file**    | `deploy/railway/<env>/keycloak/railway.json`                                              |
| **Public port**    | `8080`                                                                                    |
| **Variables**      | `pnpm railway:keycloak:sync -- <env>` or paste `keycloak.env` + `KEYCLOAK_ADMIN_PASSWORD` |

Boot script **`railway-entrypoint.sh`** (in Dockerfile) auto-creates Postgres database `keycloak` and sets `KC_DB_*` when Postgres is linked via `PGHOST`/`PGUSER`/`PGPASSWORD`. See [`KEYCLOAK_RAILWAY_DB_NOTES.md`](../KEYCLOAK_RAILWAY_DB_NOTES.md).

Set **`KC_HOSTNAME`** in `keycloak.env` to your real public hostname (no `https://` prefix).

All environments use **optimized `start`** (not `start-dev`) with JVM caps in `keycloak.env` — see [`KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](../KEYCLOAK_RAILWAY_MEMORY_NOTES.md).

## Verify after deploy

Replace host and realm:

```text
https://<KC_HOSTNAME>/realms/<realm>/.well-known/openid-configuration
```

| env               | realm              |
| ----------------- | ------------------ |
| dev               | `Supplify`         |
| preprod / staging | `supplify-preprod` |
| prod              | `supplify-prod`    |

## API + web must match

| env               | API `KEYCLOAK_REALM` | Web `VITE_KEYCLOAK_REALM` | Client secret               |
| ----------------- | -------------------- | ------------------------- | --------------------------- |
| dev               | `Supplify`           | `Supplify`                | `changeme` (import default) |
| preprod / staging | `supplify-preprod`   | `supplify-preprod`        | strong secret in dashboard  |
| prod              | `supplify-prod`      | `supplify-prod`           | strong secret in dashboard  |

Redirect URIs: `deploy/railway/<env>/KEYCLOAK_CLIENT.md`.

## Realm missing after switching to Dockerfile

`--import-realm` skips realms already in the DB. **Non-prod:** delete the Keycloak Postgres plugin (not app DB) and redeploy. **Prod:** plan a maintenance window before wiping IdP data.

## Staging vs preprod

This repo’s EC2 “staging” stack equals **preprod** on Railway: same realm export (`realm-export.preprod.json`). Use the **staging** Dockerfile path only if your Railway project environment is literally named staging; otherwise use **preprod**.
