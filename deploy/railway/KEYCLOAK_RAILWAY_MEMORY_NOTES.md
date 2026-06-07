# Keycloak on Railway — memory notes (development)

Applies to **all** Railway Keycloak services. Development, preprod, and staging use explicit heap caps (`-Xmx384m`); production uses `MaxRAMPercentage` for larger plans.

## Why Keycloak uses memory when Supplify is not open

Keycloak is a long-running JVM process. It does **not** need users to open the Supplify web app to consume memory.

Typical causes of high memory or OOM on Railway dev:

| Source                                  | What happens                                                                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`start-dev` profile**                 | Quarkus dev mode keeps extra tooling hot and avoids the optimized server image. RSS often exceeds 700 MiB–1 GiB without a heap cap.                                                                                                            |
| **No JVM heap limit**                   | Without `JAVA_OPTS_APPEND`, the JVM can grow until Railway kills the container (OOM).                                                                                                                                                          |
| **OOM → restart loop**                  | Railway `ON_FAILURE` restart policy redeploys the container. Each boot re-initializes caches and logs “Profile dev activated” / import checks — looks like repeated startups in logs even with zero user traffic.                              |
| **Railway deploy healthcheck**          | `/health/ready` is probed during deploy. In `start-dev`, health endpoints often return **404** (health extension not active), which can prolong failed deploy windows and retries. Optimized `start` with `KC_HEALTH_ENABLED=true` fixes this. |
| **API startup (once per API redeploy)** | On boot, the API pre-warms OIDC config (`getKeycloakConfig`) and may call Keycloak admin once (`ensureApiClientDirectAccessGrants`). This is **not** periodic polling.                                                                         |
| **Crons / DB keepalive**                | API crons and Postgres pool keepalive do **not** call Keycloak. Frontend `/auth/me` polling only runs when a user has the app open in a browser.                                                                                               |

So “idle for 3 days” can still OOM if the JVM slowly grows or if an earlier OOM triggered restart storms — not because Supplify was actively used.

## Changes made (development)

### Railway config (`development/keycloak/railway.json`)

| Setting                        | Before                     | After                                                                                         |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------- |
| `KC_PRODUCTION` build arg      | `false`                    | `true` → runs `kc.sh build` in Dockerfile (optimized image, no Quarkus rebuild on every boot) |
| `KC_METRICS_ENABLED` build arg | _(default true)_           | `false` (smaller footprint)                                                                   |
| `startCommand`                 | `start-dev --import-realm` | `start --optimized --import-realm`                                                            |

### Keycloak service variables (`development/keycloak.env` → paste into Railway Raw Editor)

| Variable                     | Value                                                                                              | Purpose                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------- |
| `JAVA_OPTS_APPEND`           | `-Xms128m -Xmx512m -XX:MaxMetaspaceSize=192m -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError` | Hard cap; target RSS ~350–700 MiB |
| `KC_LOG_LEVEL`               | `warn`                                                                                             | Less log volume                   |
| `KC_HTTP_ACCESS_LOG_ENABLED` | `false`                                                                                            | Disable HTTP access log           |

**If your Keycloak service has ≥ 1 GiB RAM**, you may replace `JAVA_OPTS_APPEND` with:

```env
JAVA_OPTS_APPEND=-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=25 -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError
```

**Unchanged (do not break login):** `KC_HOSTNAME`, `KC_PROXY_HEADERS`, realm DB (`KC_DB_*`), `KEYCLOAK_ADMIN_PASSWORD`, redirect URIs, clients, admin user.

Full write-up: [`docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`](../../docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md).

### Dockerfile (`deploy/railway/keycloak/Dockerfile`)

- `KC_METRICS_ENABLED` is now a build arg (dev passes `false`; production keeps default `true`).
- Optimized build still runs only when `KC_PRODUCTION=true`.

### API networking (optional, not required for memory fix)

| Variable              | Role                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `KEYCLOAK_PUBLIC_URL` | **Must stay public** — browser OAuth login, logout, registration redirects.                                                                    |
| `KEYCLOAK_URL`        | Server-side token/userinfo/admin calls. May be set to Railway private URL in dashboard: `http://${{Keycloak-dev.RAILWAY_PRIVATE_DOMAIN}}:8080` |

The Keycloak **service** must keep its public Railway hostname for browser redirects. Only the API can use private networking for back-channel calls.

## Expected memory usage (after deploy)

| Mode                 | Typical steady RSS (512 MiB plan)            |
| -------------------- | -------------------------------------------- |
| `start-dev`, no cap  | 700 MiB–1.2 GiB → OOM risk                   |
| `start` + `-Xmx384m` | ~350–450 MiB RSS (heap + metaspace + native) |

Monitor in Railway → Keycloak service → Metrics. If you see frequent restarts or GC thrashing, bump the service to 1 GiB or lower `-Xmx` to `-Xmx320m`.

## Apply on Railway

1. Merge/deploy this repo so Keycloak rebuilds with `KC_PRODUCTION=true`.
2. Keycloak service → **Variables** → Raw Editor: merge `deploy/railway/development/keycloak.env` (especially `JAVA_OPTS_APPEND`, `KC_LOG_LEVEL`, `KC_HTTP_ACCESS_LOG_ENABLED`).
3. Confirm **Start command** is `/opt/keycloak/bin/railway-entrypoint.sh start --optimized --import-realm` (from `railway.json`).
4. Redeploy Keycloak, then verify (below).

Existing realm data in Postgres is preserved; `--import-realm` skips when **Supplify** already exists.

## Verify (does not break login)

```text
# OIDC discovery
https://keycloak-development-4942.up.railway.app/realms/Supplify/.well-known/openid-configuration

# Health (should be 200 after optimized start)
https://keycloak-development-4942.up.railway.app/health/ready

# Login redirect (302 to Keycloak)
https://supplify-web-dev-development.up.railway.app/auth/login
```

Complete a manual login in the browser after deploy.

## Rollback

1. **Start command:** `/opt/keycloak/bin/kc.sh start-dev --import-realm`
2. **Build arg:** set `KC_PRODUCTION` to `false` in `development/keycloak/railway.json` and redeploy (or use previous image).
3. **Remove** `JAVA_OPTS_APPEND`, `KC_LOG_LEVEL`, `KC_HTTP_ACCESS_LOG_ENABLED` from Keycloak variables (or restore previous values).
4. Redeploy Keycloak.

Realm and users in Postgres are not deleted by rollback.

## Related files

- `deploy/railway/development/keycloak/railway.json`
- `deploy/railway/development/keycloak.env`
- `deploy/railway/keycloak/Dockerfile`
- `deploy/railway/keycloak/RAILWAY_SETUP.md`
- `deploy/railway/development/DASHBOARD.md`
