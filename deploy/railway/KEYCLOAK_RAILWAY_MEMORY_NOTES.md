# Keycloak on Railway — memory & JVM (all environments)

Applies to **all** Railway Keycloak services. See also [`docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`](../../docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md) for the full incident write-up.

## Per-environment settings (current)

| Setting                            | **dev**                     | **preprod**      | **staging**      | **prod**                           |
| ---------------------------------- | --------------------------- | ---------------- | ---------------- | ---------------------------------- |
| `KEYCLOAK_USE_OPTIMIZED`           | `false`                     | `false`          | `false`          | `true`                             |
| Start mode                         | Runtime `--db=postgres`     | Runtime postgres | Runtime postgres | Optimized (after Dockerfile build) |
| `JAVA_OPTS_APPEND`                 | `-Xmx512m` fixed            | `-Xmx512m` fixed | `-Xmx512m` fixed | `MaxRAMPercentage=60`              |
| `KC_METRICS_ENABLED` (build + env) | `false`                     | `false`          | `false`          | `true`                             |
| Dockerfile build                   | `kc.sh build --db=postgres` | same             | same             | same                               |

**Non-prod (dev / preprod / staging):** `KEYCLOAK_USE_OPTIMIZED=false` — entrypoint runs `kc.sh start --db=postgres` with JDBC from Postgres refs. Reliable on Railway; avoids H2/optimized cache mismatches.

**Production:** `KEYCLOAK_USE_OPTIMIZED=true` — uses pre-built postgres image + `--optimized` for faster boot and metrics.

## Why Keycloak uses memory when Supplify is not open

Keycloak is a long-running JVM process. It does **not** need users to open the Supplify web app to consume memory.

| Source                              | What happens                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **`start-dev` profile**             | Quarkus dev mode; RSS often exceeds 700 MiB–1 GiB without a heap cap. **Blocked** by `railway-entrypoint.sh`.         |
| **No JVM heap limit**               | JVM grows until Railway kills the container (OOM).                                                                    |
| **OOM → restart loop**              | `ON_FAILURE` restart policy redeploys; each boot re-initializes caches.                                               |
| **Stale optimized image (H2)**      | `--optimized` with H2 build rejects Postgres JDBC — use runtime postgres on non-prod or rebuild with `--db=postgres`. |
| **API startup (once per redeploy)** | OIDC config pre-warm + optional admin client setup — **not** periodic.                                                |
| **Crons / DB keepalive**            | Do **not** call Keycloak. Frontend `/auth/me` polling only when app is open.                                          |

## Keycloak service variables (`keycloak.env`)

Sync: `pnpm railway:keycloak:sync -- <env>`

### Non-prod (dev, preprod, staging)

```env
JAVA_OPTS_APPEND=-Xms128m -Xmx512m -XX:MaxMetaspaceSize=192m -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError
KC_LOG_LEVEL=warn
KC_HTTP_ACCESS_LOG_ENABLED=false
KEYCLOAK_USE_OPTIMIZED=false
KC_PROXY_HEADERS=xforwarded
```

### Production

```env
JAVA_OPTS_APPEND=-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=25 -XX:MaxMetaspaceSize=256m -XX:+UseContainerSupport -XX:+ExitOnOutOfMemoryError
KEYCLOAK_USE_OPTIMIZED=true
KC_METRICS_ENABLED=true
KC_PROXY_HEADERS=xforwarded
```

### Do **not** set on Railway Keycloak service

| Variable         | Why                                                                               |
| ---------------- | --------------------------------------------------------------------------------- |
| `KC_PROXY=edge`  | Deprecated — use `KC_PROXY_HEADERS=xforwarded` only                               |
| `KC_DB=postgres` | Build-time in optimized mode; runtime postgres start sets `--db=postgres` via CLI |
| `DATABASE_URL`   | Points at app DB — use `PGHOST`/`PGUSER`/`PGPASSWORD` refs                        |

## Railway deploy settings (all envs)

| Setting        | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Start command  | `/opt/keycloak/bin/railway-entrypoint.sh start --import-realm` |
| Healthcheck    | `/health/ready`, timeout **600**                               |
| Config file    | `deploy/railway/<env>/keycloak/railway.json`                   |
| Root Directory | _(empty — repo root)_                                          |

**Good runtime logs:**

```text
Keycloak railway-entrypoint.sh v3
Keycloak start mode: runtime postgres (no --optimized)   # non-prod
Keycloak start mode: optimized + postgres                # prod
Listening on: http://0.0.0.0:8080
```

## Expected memory (non-prod, 512 MiB–1 GiB plan)

| Mode                          | Typical steady RSS                |
| ----------------------------- | --------------------------------- |
| `start-dev`, no cap           | 700 MiB–10 GiB → OOM (old config) |
| Runtime postgres + `-Xmx512m` | **350–700 MB**                    |

Monitor: Railway → Keycloak service → Metrics.

## Apply on Railway

1. Push branch for that environment (`dev`, `preprod`, `staging`, `prod`).
2. `KEYCLOAK_ADMIN_PASSWORD=<secret> pnpm railway:keycloak:sync -- <env>`
3. Remove legacy `KC_PROXY` and `KC_DB` from dashboard if present.
4. Redeploy Keycloak (clear build cache if H2 errors persist).
5. Verify `/health/ready` and OIDC discovery URL.

## Related files

- `deploy/railway/<env>/keycloak.env`
- `deploy/railway/<env>/keycloak/railway.json`
- `deploy/railway/keycloak/Dockerfile`
- `deploy/railway/keycloak/railway-entrypoint.sh`
- `deploy/railway/keycloak/RAILWAY_SETUP.md`
- `docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`
