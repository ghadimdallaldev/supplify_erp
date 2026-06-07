# Keycloak on Railway — database & persistence (all environments)

**Automated:** `railway-entrypoint.sh` waits for Postgres, creates database **`keycloak`** if missing, and sets runtime JDBC (`KC_DB_URL`, `KC_DB_USERNAME`, `KC_DB_PASSWORD`). Link Postgres via `PGHOST`/`PGUSER`/`PGPASSWORD` in `keycloak.env`.

Sync: `pnpm railway:keycloak:sync -- <env>` (`development` | `preprod` | `staging` | `production`).

Manual steps Railway cannot do from git: create project, connect GitHub, `railway link`, set `KEYCLOAK_ADMIN_PASSWORD` when syncing.

## Golden rules

| Rule                                                     | Why                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Dedicated Postgres database `keycloak`**               | App uses `railway`; Keycloak must use **`keycloak`**.                                      |
| **Never set `DATABASE_URL` on Keycloak service**         | That reference points at the **app** DB.                                                   |
| **Use Postgres reference vars**                          | `PGHOST=${{Postgres-<env>.PGHOST}}` etc. — entrypoint wires JDBC                           |
| **Build from GitHub + `railway.json`**                   | Stock Keycloak image has no realm import and wrong defaults.                               |
| **Root Directory = empty**                               | Realm JSON must be at repo root build context.                                             |
| **Start = `railway-entrypoint.sh start --import-realm`** | Entrypoint blocks `start-dev`; optimized vs runtime postgres via `KEYCLOAK_USE_OPTIMIZED`. |
| **Do not set `KC_DB` on dashboard**                      | Non-prod uses runtime `--db=postgres`; prod optimized mode bakes vendor at Docker build.   |
| **Link Keycloak → Postgres in Railway graph**            | Ensures `${{Postgres-*}}` refs resolve.                                                    |

## Postgres vars (Keycloak service)

From `deploy/railway/<env>/keycloak.env`:

```env
PGHOST=${{Postgres-dev.PGHOST}}
PGPORT=${{Postgres-dev.PGPORT}}
PGUSER=${{Postgres-dev.PGUSER}}
PGPASSWORD=${{Postgres-dev.PGPASSWORD}}
```

Entrypoint sets at runtime (do not duplicate unless debugging):

```env
KC_DB_URL=jdbc:postgresql://<host>:<port>/keycloak
KC_DB_USERNAME=<from PGUSER>
KC_DB_PASSWORD=<from PGPASSWORD>
```

**Wrong:**

```env
DATABASE_URL=${{Postgres-dev.DATABASE_URL}}   # app DB
KC_DB_URL=${{Postgres-dev.DATABASE_URL}}      # same problem
```

## Dockerfile postgres build

Image build runs:

```text
kc.sh build --db=postgres --health-enabled=true --metrics-enabled=<env>
```

Required for production optimized start. Non-prod also benefits (fallback if `KEYCLOAK_USE_OPTIMIZED` is toggled).

## First boot (Liquibase)

~124 changesets on empty DB (~3–5 minutes).

1. Healthcheck timeout **600** s (`railway.json`).
2. Restart max retries **1** until first successful boot (optional).
3. Redeploy Keycloak only — wait; do not restart during migrations.

Success in logs:

```text
UPDATE SUMMARY
Run:                         124
Previously run:              0
```

## Reset Keycloak schema (non-prod only)

Stop Keycloak first. On database **`keycloak`**:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
```

Never on production without backup and maintenance window.

## Production checklist

- [ ] `keycloak` database exists (auto-created on boot)
- [ ] No `DATABASE_URL` on Keycloak service
- [ ] `production/keycloak/railway.json`, Root Directory empty
- [ ] `KEYCLOAK_USE_OPTIMIZED=true`, `KEYCLOAK_ADMIN_PASSWORD` set
- [ ] Realm export redirect URIs updated before first import
- [ ] Postgres backups enabled

## Related docs

- Setup: [`keycloak/RAILWAY_SETUP.md`](keycloak/RAILWAY_SETUP.md)
- Memory / JVM: [`KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](KEYCLOAK_RAILWAY_MEMORY_NOTES.md)
- Full fix narrative: [`docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`](../../docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md)
