# Keycloak realm exports

| Environment | Realm name         | Import file                 | Client URI checklist                            |
| ----------- | ------------------ | --------------------------- | ----------------------------------------------- |
| **dev**     | `Supplify`         | `realm-export.json`         | `deploy/railway/development/KEYCLOAK_CLIENT.md` |
| **preprod** | `supplify-preprod` | `realm-export.preprod.json` | `deploy/railway/preprod/KEYCLOAK_CLIENT.md`     |
| **prod**    | `supplify-prod`    | `realm-export.prod.json`    | `deploy/railway/production/KEYCLOAK_CLIENT.md`  |

## Import on Railway

1. Copy the JSON file into Keycloak’s import path, or use Admin UI → **Create realm** → **Import**.
2. Rename file for `--import-realm` if needed: `<RealmName>-realm.json` (e.g. `supplify-preprod-realm.json`).
3. Apply **Valid redirect URIs** and **Valid post logout redirect URIs** from the matching `KEYCLOAK_CLIENT.md` if URLs change after import.
4. Rotate **supplify-api** client secret (required for preprod/prod); set `KEYCLOAK_CLIENT_SECRET` on the API service.

## Local Docker

`docker-compose.yml` imports `realm-export.json` (realm **Supplify**). Preprod/prod exports are for hosted environments only.
