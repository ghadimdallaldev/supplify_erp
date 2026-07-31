# Keycloak realm exports

| Environment | Realm name         | Import file                 | Client URI checklist                                        |
| ----------- | ------------------ | --------------------------- | ----------------------------------------------------------- |
| **dev**     | `Supplify`         | `realm-export.json`         | `deploy/railway/development/KEYCLOAK_CLIENT.md`             |
| **preprod** | `supplify-preprod` | `realm-export.preprod.json` | `deploy/keycloak/realm-export.preprod.json` (redirect URIs) |
| **prod**    | `supplify-prod`    | `realm-export.prod.json`    | `deploy/keycloak/realm-export.prod.json` (redirect URIs)    |

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

After deploy, apply redirect URIs from the matching realm export if URLs change. Set API `KEYCLOAK_CLIENT_SECRET` (`changeme` for dev import; strong secrets for preprod/prod).

## Session policy (ERP humans)

Canonical values live in [`session-policy.json`](./session-policy.json):

| Setting                   | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| Access token lifespan     | 20 minutes                                                    |
| SSO / client session idle | 7 days                                                        |
| SSO / client session max  | 30 days                                                       |
| Refresh token rotation    | enabled (`revokeRefreshToken=true`, `refreshTokenMaxReuse=0`) |
| Remember Me               | disabled                                                      |

Realm JSON files encode these fields for **new** imports. Existing realms are **not** updated by `--import-realm`. Apply to a live realm:

```bash
# From repo root (example: development)
export KEYCLOAK_BASE_URL=https://keycloak-dev.supplifyerp.com
export KEYCLOAK_REALM=Supplify
export KEYCLOAK_ADMIN=admin
export KEYCLOAK_ADMIN_PASSWORD='…'
node deploy/keycloak/apply-session-policy.mjs
```

Dry run: `DRY_RUN=1 node deploy/keycloak/apply-session-policy.mjs`

Consumer diner JWT and staff magic-link sessions are **out of scope** for this policy.

See [`docs/runbooks/keycloak-session-configuration.md`](../../docs/runbooks/keycloak-session-configuration.md).

## Local Docker

`docker-compose.yml` imports `realm-export.json` (realm **Supplify**). Preprod/prod exports are for hosted environments only.

**B2C diner signup** (guest ordering rewards at `/order/:slug/account`) does **not** use Keycloak — no realm or client changes. Diner sessions are API JWT cookies signed with `CONSUMER_AUTH_SECRET` (see [consumer-ordering.md](../../features/consumer-ordering.md)).

## Railway recovery (no Admin UI)

Use this when `/admin` fails (CSP iframe errors, blank console, or **HTTPS required**) and realm **Supplify** is missing.

### 1. Fix proxy hostname (do this first)

In the Keycloak Railway service **Variables**, set (from `deploy/railway/development/keycloak.env`):

```env
KC_HOSTNAME=keycloak-development-4942.up.railway.app
KC_PROXY_HEADERS=xforwarded
```

Do **not** set deprecated `KC_PROXY=edge`. Sync full vars: `pnpm railway:keycloak:sync -- development`.

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

### 3. First-boot auto-import

Start command (Railway): `/opt/keycloak/bin/railway-entrypoint.sh start --import-realm`  
Entrypoint blocks `start-dev`; non-prod uses runtime `--db=postgres` (`KEYCLOAK_USE_OPTIMIZED=false`).  
Realm JSON is baked at `/opt/keycloak/data/import/<name>-realm.json`. Import skips if realm already exists in DB.

## Email OTP flow

The realm exports now include the Supplify browser flow and the
email-otp-verify-email required action. Existing realms need the Admin API apply
step because realm import skips an already-created realm.

Run: node deploy/keycloak/apply-email-otp-flows.mjs

Apply the session policy and OTP flow independently; both are required for the
full human-login posture. Configure AUTH_EMAIL_OTP_ENABLED and the API/Keycloak
OTP secrets before binding the flow. Roll back with
rollback-email-otp-flows.mjs and set KEYCLOAK_ROLLBACK_BROWSER_FLOW to the prior
browser-flow alias.

## Driver login friction

For high-frequency operational users, `AUTH_EMAIL_OTP_DRIVER_BYPASS=true` enables the driver-only reduced-friction policy. The API writes the marker only for users with an active supplier `Driver` role; missing synchronization fails closed to normal OTP.
