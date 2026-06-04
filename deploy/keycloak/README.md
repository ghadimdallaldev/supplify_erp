# Keycloak realm exports

| Environment | Realm name         | Import file                 | Client URI checklist                            |
| ----------- | ------------------ | --------------------------- | ----------------------------------------------- |
| **dev**     | `Supplify`         | `realm-export.json`         | `deploy/railway/development/KEYCLOAK_CLIENT.md` |
| **preprod** | `supplify-preprod` | `realm-export.preprod.json` | `deploy/railway/preprod/KEYCLOAK_CLIENT.md`     |
| **prod**    | `supplify-prod`    | `realm-export.prod.json`    | `deploy/railway/production/KEYCLOAK_CLIENT.md`  |

## Import on Railway (recommended)

Use the environment Dockerfile so `--import-realm` has the JSON baked in (no shell upload):

| Environment | Railway config                                     | Realm              |
| ----------- | -------------------------------------------------- | ------------------ |
| development | `deploy/railway/development/keycloak/railway.json` | `Supplify`         |
| preprod     | `deploy/railway/preprod/keycloak/railway.json`     | `supplify-preprod` |
| staging     | `deploy/railway/staging/keycloak/railway.json`     | `supplify-preprod` |
| production  | `deploy/railway/production/keycloak/railway.json`  | `supplify-prod`    |

Shared image: `deploy/railway/keycloak/Dockerfile` (realm JSON baked per env via `buildArgs`).

Setup: [`deploy/railway/keycloak/RAILWAY_SETUP.md`](../railway/keycloak/RAILWAY_SETUP.md)

After deploy, apply redirect URIs from the matching `KEYCLOAK_CLIENT.md` if URLs change. Set API `KEYCLOAK_CLIENT_SECRET` (`changeme` for dev import; strong secrets for preprod/prod).

## Local Docker

`docker-compose.yml` imports `realm-export.json` (realm **Supplify**). Preprod/prod exports are for hosted environments only.

## Railway recovery (no Admin UI)

Use this when `/admin` fails (CSP iframe errors, blank console, or **HTTPS required**) and realm **Supplify** is missing.

### 1. Fix proxy hostname (do this first)

In the Keycloak Railway service **Variables**, set (from `deploy/railway/development/keycloak.env`):

```env
KC_HOSTNAME=keycloak-development-4942.up.railway.app
KC_PROXY=edge
KC_PROXY_HEADERS=xforwarded
```

Redeploy Keycloak, then open `https://keycloak-development-4942.up.railway.app/admin` (master realm, user `admin`, password = `KEYCLOAK_ADMIN_PASSWORD`).

### 2. Import realm without Admin UI (Railway Shell)

Railway → Keycloak service → **Shell** (runs inside the container; uses HTTP to localhost, bypasses the HTTPS/proxy bug):

```bash
/opt/keycloak/bin/kcadm.sh config credentials \
  --server http://127.0.0.1:8080 \
  --realm master \
  --user admin \
  --password "$KEYCLOAK_ADMIN_PASSWORD"

# If Supplify is missing, create it (paste realm-export.json into the container first, or curl from your repo):
/opt/keycloak/bin/kcadm.sh create realms -f /tmp/realm-export.json
```

Copy `deploy/keycloak/realm-export.json` into the container as `/tmp/realm-export.json` (Railway Shell file upload, or `curl` a raw URL from your git host).

Verify:

```bash
/opt/keycloak/bin/kcadm.sh get realms/Supplify
```

Then confirm `https://keycloak-development-4942.up.railway.app/realms/Supplify/.well-known/openid-configuration` returns JSON (not 404).

### 3. First-boot auto-import (optional)

Start command: `/opt/keycloak/bin/kc.sh start-dev --import-realm`  
Mount `realm-export.json` as `/opt/keycloak/data/import/Supplify-realm.json`.  
Import runs only when that realm name is not already in the database; wiping the Keycloak Postgres plugin data triggers a clean import.
