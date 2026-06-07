# Keycloak Railway memory & postgres fix

**Date:** 2026-06-07  
**Scope:** All Railway Keycloak services (dev, preprod, staging, prod).

## Summary

Railway metrics showed Keycloak memory climbing to **7–10 GB** then OOM/restart, while API/web/Postgres/Redis stayed flat. Fixes: block `start-dev`, cap JVM heap, build Dockerfile with `--db=postgres`, and use **runtime postgres start** on non-prod (`KEYCLOAK_USE_OPTIMIZED=false`).

## Root causes

| Issue                                          | Effect                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `start-dev` + no JVM cap                       | Uncapped heap growth → OOM loop                                        |
| `--optimized` with H2-built image              | `URL format error ... jdbc:postgresql`                                 |
| Dockerfile `grep keycloak.conf` false negative | Build failed after successful `kc.sh build` — stale image kept running |
| `KC_PROXY=edge` on dashboard                   | Deprecated; use `KC_PROXY_HEADERS=xforwarded`                          |

Not caused by: API crons, Postgres keepalive, or idle web tabs.

## Current configuration (all envs)

|                          | dev / preprod / staging                      | production                       |
| ------------------------ | -------------------------------------------- | -------------------------------- |
| `KEYCLOAK_USE_OPTIMIZED` | `false`                                      | `true`                           |
| Start                    | `kc.sh start --db=postgres` + JDBC           | `kc.sh start --optimized` + JDBC |
| JVM                      | `-Xmx512m`, metaspace 192m                   | `MaxRAMPercentage=60`            |
| Metrics                  | off                                          | on                               |
| Start command            | `railway-entrypoint.sh start --import-realm` | same                             |

Dockerfile (all envs): `kc.sh build --db=postgres --health-enabled=true`.

## Key env vars (Keycloak service)

```env
# All envs
KC_PROXY_HEADERS=xforwarded
KC_HOSTNAME=<public-hostname>
PGHOST=${{Postgres-<env>.PGHOST}}
PGPORT=${{Postgres-<env>.PGPORT}}
PGUSER=${{Postgres-<env>.PGUSER}}
PGPASSWORD=${{Postgres-<env>.PGPASSWORD}}

# Non-prod
KEYCLOAK_USE_OPTIMIZED=false
JAVA_OPTS_APPEND=-Xms128m -Xmx512m -XX:MaxMetaspaceSize=192m -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError

# Prod
KEYCLOAK_USE_OPTIMIZED=true
JAVA_OPTS_APPEND=-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=25 -XX:MaxMetaspaceSize=256m -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError
```

**Remove from dashboard:** `KC_PROXY`, `KC_DB`, `DATABASE_URL`.

## Apply

```bash
KEYCLOAK_ADMIN_PASSWORD=<secret> pnpm railway:keycloak:sync -- development
# repeat: preprod | staging | production
```

Redeploy Keycloak per environment. Clear build cache if H2 errors persist.

## Verify

**Logs (good):**

```text
Keycloak railway-entrypoint.sh v3
Keycloak start mode: runtime postgres (no --optimized)
Listening on: http://0.0.0.0:8080
```

**URLs (dev example):**

```text
https://keycloak-development-4942.up.railway.app/health/ready
https://keycloak-development-4942.up.railway.app/realms/Supplify/.well-known/openid-configuration
```

**Metrics:** Keycloak RSS flat ~350–700 MB (non-prod), not sawtooth to multi-GB.

## Rollback

Revert git + redeploy previous image. Do not revert to `start-dev` (restores memory growth). Realm data in Postgres `keycloak` DB is preserved.

## Related files

- `deploy/railway/keycloak/Dockerfile`
- `deploy/railway/keycloak/railway-entrypoint.sh`
- `deploy/railway/<env>/keycloak.env`
- `deploy/railway/<env>/keycloak/railway.json`
- `deploy/railway/KEYCLOAK_RAILWAY_MEMORY_NOTES.md`
- `deploy/railway/KEYCLOAK_RAILWAY_DB_NOTES.md`
- `deploy/railway/keycloak/RAILWAY_SETUP.md`
- `scripts/railway-sync-keycloak.mjs`
