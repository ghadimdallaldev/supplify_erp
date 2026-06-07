# Keycloak on Railway (all environments)

`--import-realm` only imports JSON files baked into the image at  
`/opt/keycloak/data/import/<realm>-realm.json`.  
Do **not** deploy the stock Keycloak image without building these Dockerfiles.

## Per-environment Railway settings

| Environment     | Config file                                         | Realm              | Start command              |
| --------------- | --------------------------------------------------- | ------------------ | -------------------------- |
| **development** | `/deploy/railway/development/keycloak/railway.json` | `Supplify`         | `start --import-realm`     |
| **preprod**     | `/deploy/railway/preprod/keycloak/railway.json`     | `supplify-preprod` | `start-dev --import-realm` |
| **staging**     | `/deploy/railway/staging/keycloak/railway.json`     | `supplify-preprod` | `start-dev --import-realm` |
| **production**  | `/deploy/railway/production/keycloak/railway.json`  | `supplify-prod`    | `start --import-realm`     |

All environments build **`deploy/railway/keycloak/Dockerfile`** (realm JSON copied at build time; `railway.json` sets `buildArgs`).

For every Keycloak service:

| Setting            | Value                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Root Directory** | _(empty — repo root)_                                                                                             |
| **Public port**    | `8080`                                                                                                            |
| **Variables**      | Paste `deploy/railway/<env>/keycloak.env` + `KEYCLOAK_ADMIN_PASSWORD` + `KC_DB_*` from that env’s Postgres plugin |

Set **`KC_HOSTNAME`** in `keycloak.env` to your real public hostname (no `https://` prefix).

Development uses **optimized `start`** (not `start-dev`) with JVM caps — see [`KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](../KEYCLOAK_RAILWAY_MEMORY_NOTES.md).

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
