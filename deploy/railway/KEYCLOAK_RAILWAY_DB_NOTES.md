# Keycloak on Railway — database & persistence (all environments)

**Automated (in repo):** the Keycloak Docker image runs `railway-entrypoint.sh` on boot — it waits for Postgres, **creates database `keycloak` if missing**, and sets `KC_DB_*`. Link Postgres to Keycloak with `PGHOST`/`PGUSER`/`PGPASSWORD` reference vars (see `keycloak.env`). Sync vars: `pnpm railway:keycloak:sync -- <env>` (`development` | `preprod` | `staging` | `production`).

Manual steps Railway cannot do from git alone: create the Railway project, connect GitHub once, `railway link`, set `KEYCLOAK_ADMIN_PASSWORD` when syncing.

## Golden rules

| Rule                                                   | Why                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Dedicated Postgres database `keycloak`**             | App uses `railway`; Keycloak must use **`keycloak`**. Mixing them corrupts both.                          |
| **Never set `DATABASE_URL` on the Keycloak service**   | Railway’s reference points at the **`railway`** DB. Keycloak will write IdP tables into the app database. |
| **Always use Postgres reference vars**                 | `PGHOST=${{Postgres-<env>.PGHOST}}` etc. in `keycloak.env` — entrypoint wires `KC_DB_*`                   |
| **Build from GitHub + `railway.json`**                 | Stock `quay.io/keycloak/keycloak` has no realm import and defaults to dev mode.                           |
| **Root Directory = empty (repo root)**                 | Otherwise `realm-export.json` is missing at build time.                                                   |
| **Start command = `start --optimized --import-realm`** | Not `start-dev` (entrypoint blocks dev mode). See memory docs for JVM caps.                               |
| **Link Keycloak → Postgres in Railway graph**          | Ensures `${{Postgres-<env>.PGHOST}}` references resolve.                                                  |

## One-time Postgres setup (each environment)

**Automatic on Keycloak boot** if Postgres is linked via `PGHOST`/`PGUSER`/`PGPASSWORD`. No manual `CREATE DATABASE` required.

Optional manual check (Postgres Console → `psql -U postgres -d railway` → `\l` should list `keycloak` after first Keycloak deploy).

## Sync variables (one command per env)

```bash
railway login
railway link                    # once: pick project + environment
KEYCLOAK_ADMIN_PASSWORD=secret pnpm railway:keycloak:sync -- development
# optional if service name differs from default:
pnpm railway:keycloak:sync -- development --service keycloak-dev
```

This pushes `deploy/railway/<env>/keycloak.env` to Railway (including `${{Postgres-*}}` reference vars that link Postgres → Keycloak).

## Variables to paste (Keycloak service)

Or paste manually from `deploy/railway/<env>/keycloak.env`. The entrypoint sets `KC_DB_*` from Postgres refs:

```env
PGHOST=${{Postgres-dev.PGHOST}}
PGPORT=${{Postgres-dev.PGPORT}}
PGUSER=${{Postgres-dev.PGUSER}}
PGPASSWORD=${{Postgres-dev.PGPASSWORD}}
```

Legacy explicit JDBC (still supported):

```env
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://${{Postgres-dev.PGHOST}}:${{Postgres-dev.PGPORT}}/keycloak
KC_DB_USERNAME=${{Postgres-dev.PGUSER}}
KC_DB_PASSWORD=${{Postgres-dev.PGPASSWORD}}
```

**Do not** use:

```env
KC_DB_URL=${{Postgres-dev.DATABASE_URL}}   # WRONG — this is the app DB
```

**Do not** add `DATABASE_URL=...` to the Keycloak service at all.

## First boot (avoid corrupted migrations)

Liquibase runs **124 changesets** on empty DB (~3–5 minutes).

1. **Healthcheck timeout:** `600` seconds (Settings → Deploy, or `railway.json`).
2. **Restart max retries:** `1` until first successful boot (then restore `10` if desired).
3. **Redeploy Keycloak only** — wait; do not restart during migrations.
4. Success in logs:

   ```text
   UPDATE SUMMARY
   Run:                         124
   Previously run:              0
   ```

If `Previously run: 30` (or any non-zero on a “fresh” DB), the DB was not empty or Keycloak is not using `/keycloak`.

## Railway “Data” tab vs Console (why wipes fail)

- **Data / Query** connects to the default database **`railway`**, not `keycloak`. There is often **no database dropdown**.
- Wiping in Data tab clears the **app** DB, not Keycloak’s.
- Always use **Console → psql** and `\c keycloak` before Keycloak maintenance.

```bash
psql -U postgres -d railway
```

```sql
SELECT current_database();   -- must show keycloak before wipe
\c keycloak
SELECT current_database();
```

Exit pager: press **`q`** when you see `(END)`.

## Reset Keycloak schema (non-prod only)

**Stop or crash-loop Keycloak first** (max retries = 1). On database **`keycloak`**:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
```

Run **`CREATE SCHEMA public`** before **`GRANT`** — if GRANT fails with `schema "public" does not exist`, the schema was never recreated.

Verify:

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- 0
```

Then redeploy Keycloak once. **Never do this on production** without a maintenance window and backup.

## Verify which DB Keycloak uses

On **`keycloak`** after a failed boot:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('federated_user', 'databasechangelog', 'migration_model');
```

| `current_database()` | `federated_user` present | Meaning                                                                                             |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `keycloak`           | yes                      | Corrupted Keycloak DB — wipe `keycloak`                                                             |
| `railway`            | yes                      | Keycloak was pointed at app DB — fix `KC_DB_URL`, wipe junk from `railway`, redeploy API migrations |
| `keycloak`           | no (0 tables)            | Clean — safe to deploy                                                                              |

## Production checklist (no surprises)

- [ ] `keycloak` database exists on prod Postgres
- [ ] `KC_DB_URL` ends with `/keycloak` (not `DATABASE_URL`)
- [ ] No `DATABASE_URL` on Keycloak service
- [ ] GitHub source + `production/keycloak/railway.json`, Root Directory empty
- [ ] `KEYCLOAK_ADMIN_PASSWORD` set; realm export redirect URIs updated before first import
- [ ] Backups enabled on Postgres plugin
- [ ] **Do not** wipe `keycloak` DB on redeploy — `--import-realm` skips existing realms

## Related docs

- Setup (all envs): [`keycloak/RAILWAY_SETUP.md`](keycloak/RAILWAY_SETUP.md)
- Memory / JVM (dev): [`KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](KEYCLOAK_RAILWAY_MEMORY_NOTES.md)
- Env templates: `deploy/railway/<env>/keycloak.env`
