# Keycloak on Railway — development (zero manual import)

`--import-realm` only works if the realm JSON is **inside the image** at  
`/opt/keycloak/data/import/Supplify-realm.json`.  
The stock Keycloak image has an empty import folder — use this Dockerfile instead.

## One-time Railway service settings

| Setting              | Value                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **Root Directory**   | _(empty — repo root)_                                                                          |
| **Config file path** | `/deploy/railway/development/keycloak/railway.json`                                            |
| **Dockerfile path**  | `deploy/railway/development/keycloak/Dockerfile`                                               |
| **Start command**    | `/opt/keycloak/bin/kc.sh start-dev --import-realm` _(or leave empty — same as `railway.json`)_ |
| **Public port**      | `8080` (Keycloak default; do not override unless you set `KC_HTTP_PORT`)                       |

## Variables (Raw Editor)

Paste `deploy/railway/development/keycloak.env` plus:

```env
KEYCLOAK_ADMIN_PASSWORD=<your password>
KC_DB=postgres
KC_DB_URL=${{Postgres-Keycloak.DATABASE_URL}}
KC_DB_USERNAME=...
KC_DB_PASSWORD=...
```

Use your actual Postgres plugin variable references for Keycloak’s database (separate from app Postgres is recommended).

## Redeploy

1. Push this repo to git.
2. Redeploy the Keycloak service (must **build** from Dockerfile, not “Deploy image” only).
3. Check logs for `Imported realm Supplify` or similar.
4. Verify: `https://keycloak-development-4942.up.railway.app/realms/Supplify/.well-known/openid-configuration` → JSON.

## If realm still missing after switching to this image

`--import-realm` skips realms that already exist in the DB. If you previously started with an **empty** import folder, the DB may be in a bad state:

- **Dev only:** delete the Keycloak Postgres plugin (or its data volume), redeploy, and let import run on a fresh DB.

## API

`KEYCLOAK_CLIENT_SECRET=changeme` on the API service (matches `realm-export.json`).
