# Keycloak Railway memory fix (development)

**Date:** 2026-06-07  
**Scope:** Railway hosted Keycloak — primarily **development**, same patterns apply to preprod/staging.

## Root cause

Railway metrics showed **Keycloak alone** climbing from ~2–4 GB to **7–10 GB**, then dropping (OOM kill / restart), then climbing again. Supplify API, web, Postgres, and Redis stayed flat near zero.

Contributing factors:

| Factor                                        | Effect                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **`start-dev` on Railway**                    | Quarkus dev profile (`Profile dev activated`). Extra tooling, no optimized server image, health endpoints often 404.  |
| **Missing `--optimized` after `kc.sh build`** | Even with `start` (not dev), Quarkus can **re-augment at runtime** on every boot — large transient + retained memory. |
| **No hard JVM heap / metaspace cap**          | Without `JAVA_OPTS_APPEND`, the JVM grows until Railway kills the container.                                          |
| **Deprecated `KC_PROXY=edge`**                | Replaced by `KC_PROXY_HEADERS=xforwarded` (Keycloak 24).                                                              |
| **OOM → restart loop**                        | `ON_FAILURE` restart policy redeploys; each boot repeats augmentation and cache warm-up.                              |

This is **not** caused by Supplify API crons, Postgres keepalive, or idle web tabs (no polling when app is closed).

## Fix applied (repo)

### 1. Start command — optimized production mode

**Before (Railway dashboard / old config):**

```text
/opt/keycloak/bin/kc.sh start-dev --import-realm
```

**After (`deploy/railway/development/keycloak/railway.json`):**

```text
/opt/keycloak/bin/railway-entrypoint.sh start --optimized --import-realm
```

- Dockerfile build arg `KC_PRODUCTION=true` runs `kc.sh build` at **image build time** (no Quarkus rebuild on boot).
- `railway-entrypoint.sh` **blocks `start-dev`** and auto-injects `--optimized` if missing.

### 2. JVM memory caps (development)

Set on the **Keycloak service** (not API):

```env
JAVA_OPTS_APPEND=-Xms128m -Xmx512m -XX:MaxMetaspaceSize=192m -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError
```

If Keycloak fails to boot (OutOfMemoryError during Liquibase on first deploy), raise to:

```env
JAVA_OPTS_APPEND=-Xms256m -Xmx768m -XX:MaxMetaspaceSize=256m -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError
```

**Do not remove the cap.** Uncapped JVM on Railway dev was the direct cause of multi-GB RSS.

### 3. Production-style Keycloak env (hosted dev)

```env
KC_HEALTH_ENABLED=true
KC_METRICS_ENABLED=false
KC_PROXY_HEADERS=xforwarded
KC_HTTP_ENABLED=true
KC_HOSTNAME_STRICT=false
KC_HOSTNAME_STRICT_HTTPS=false
```

Removed: `KC_PROXY=edge` (deprecated).

### 4. Database

Keycloak uses **Postgres** via `railway-entrypoint.sh`:

- Auto-creates database `keycloak`
- Sets `KC_DB=postgres`, `KC_DB_URL`, `KC_DB_USERNAME`, `KC_DB_PASSWORD`
- **Never** set `DATABASE_URL` on the Keycloak service (that points at the app DB)

### 5. Health check

Railway `healthcheckPath`: `/health/ready` (lightweight; no auth/session work).

Requires `KC_HEALTH_ENABLED=true` and optimized `start` (not `start-dev`).

### 6. Logging (smaller footprint)

```env
KC_LOG_LEVEL=warn
KC_HTTP_ACCESS_LOG_ENABLED=false
```

## Expected memory after fix

| State                              | RSS (development, 512 MiB–1 GiB Railway plan)                    |
| ---------------------------------- | ---------------------------------------------------------------- |
| Steady state after warm-up         | **350–700 MB**                                                   |
| First boot (Liquibase on empty DB) | Spike during migrations; should stay under cap + native overhead |
| **Bad** (pre-fix)                  | Linear ramp to **7–10 GB** → kill → repeat                       |

Monitor: Railway → project → **keycloak** service → **Metrics** → Memory. Line should flatten, not sawtooth upward.

## Apply on Railway (development)

1. **Merge / push** this commit to `dev` (triggers Keycloak rebuild if GitHub deploy is linked).
2. **Sync variables** (one command):

   ```bash
   railway login
   railway link          # pick dev project + development environment
   KEYCLOAK_ADMIN_PASSWORD=<secret> pnpm railway:keycloak:sync -- development --service keycloak
   ```

3. **Dashboard checks** (Keycloak service → Settings → Deploy):
   - Start command: `/opt/keycloak/bin/railway-entrypoint.sh start --optimized --import-realm`
   - Config file: `deploy/railway/development/keycloak/railway.json`
   - Root Directory: **empty** (repo root)
   - Health check path: `/health/ready`
4. **Redeploy** Keycloak only. Wait for first boot (~3–5 min if fresh DB migrations).
5. **Optional:** Set Railway service memory limit to **1 GB** so OOM is predictable if JVM misconfigured.

## Verify (does not change realms/clients)

```text
# Health — must be 200
https://keycloak-development-4942.up.railway.app/health/ready

# OIDC discovery
https://keycloak-development-4942.up.railway.app/realms/Supplify/.well-known/openid-configuration

# Login redirect from web
https://supplify-web-dev-development.up.railway.app/auth/login
```

**Logs (good signs):**

- No `Profile dev activated`
- No `Running the server in development mode`
- May see: `Injecting --optimized ...` from entrypoint (if dashboard start command omitted `--optimized`)
- `Keycloak ... started` / `Listening on: http://0.0.0.0:8080`

**Logs (bad — fix not applied):**

- `Profile dev activated` → still on `start-dev`; fix start command
- Quarkus augmentation on every boot → missing `KC_PRODUCTION=true` build or missing `--optimized`

**Metrics:** Memory stable for 10–15 minutes with no Supplify usage.

## Traffic investigation

If memory is capped but CPU/logs stay busy:

| Endpoint                                    | Typical source                             |
| ------------------------------------------- | ------------------------------------------ |
| `/realms/.../protocol/openid-connect/auth`  | Browser login, expired sessions, open tabs |
| `/realms/.../protocol/openid-connect/token` | API token refresh, web silent refresh      |
| `/realms/.../protocol/openid-connect/certs` | API JWKS fetch (once per API boot + cache) |
| `/health/ready`                             | Railway deploy health check only           |

API startup calls Keycloak **once per API redeploy** (OIDC config + optional admin client setup), not on a timer.

## Rollback

1. Revert git commit / redeploy previous Keycloak image.
2. Restore previous Railway variables from backup or remove:
   - `JAVA_OPTS_APPEND`
   - `KC_LOG_LEVEL`, `KC_HTTP_ACCESS_LOG_ENABLED`
3. **Not recommended:** revert to `start-dev` — will restore memory growth.

Realm data in Postgres **`keycloak`** database is **not** deleted by this fix or rollback.

## Related files

- `deploy/railway/development/keycloak/railway.json`
- `deploy/railway/development/keycloak.env`
- `deploy/railway/keycloak/Dockerfile`
- `deploy/railway/keycloak/railway-entrypoint.sh`
- `deploy/railway/KEYCLOAK_RAILWAY_MEMORY_NOTES.md`
- `scripts/railway-sync-keycloak.mjs`
