# Database backup and restore runbook

**Audience:** Ops / on-call before first pilot client and for production incidents.  
**Last drill:** 2026-07-24 (local Postgres logical dump → restore into scratch DB).  
**Related:** [railway-environments.md](./railway-environments.md), [deployment.md](./deployment.md).

## Principles

1. Prefer **logical dumps** (`pg_dump` / `pg_restore`) for portable restores and drills.
2. Keep **one Postgres per environment** — never restore prod into preprod without renaming DBs and rotating secrets.
3. App DB (`supplify`) and Keycloak DB (`keycloak`) are **separate** — back up both before major upgrades.
4. Never commit dump files or connection strings with passwords.

## A. Railway hosted Postgres (preprod / prod)

### A1. Enable / verify automated backups

1. Open the Railway project → Postgres service for that environment.
2. Confirm **Backups** (or snapshot schedule) is enabled for **prod**.
3. Note retention window and who can restore.
4. Record the last successful backup timestamp in the incident channel after each release.

### A2. On-demand logical dump (recommended drill)

From a machine with network access to Railway Postgres (public URL or `railway connect`):

```bash
# Set DATABASE_URL from Railway variables (do not echo).
# Example output path — keep outside the repo or gitignored.
export PGPASSWORD='…'   # or use URL form
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="supplify-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Optional plain SQL (larger, human-readable):

```bash
pg_dump "$DATABASE_URL" --format=plain --no-owner --file="supplify-plain.sql"
```

Store the dump in encrypted object storage (S3 / R2) with restricted IAM — not in git.

### A3. Restore into a scratch database (drill)

```bash
# Create empty target DB (name must not be production)
createdb -h … -U … supplify_restore_drill

pg_restore \
  --dbname="postgresql://USER:PASS@HOST:5432/supplify_restore_drill" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  supplify-YYYYMMDD.dump
```

Smoke checks:

```sql
SELECT COUNT(*) FROM schema_migrations;  -- or your migrator table
SELECT COUNT(*) FROM app_user;
SELECT COUNT(*) FROM customer_order;
```

Drop the scratch DB after the drill:

```bash
dropdb -h … -U … supplify_restore_drill
```

### A4. Production restore (incident)

1. **Freeze writes** if possible (scale API to 0 or enable maintenance).
2. Snapshot / dump current prod **before** overwrite (even if corrupt).
3. Restore from the chosen backup into a **new** Postgres or into prod only after explicit approval.
4. Point `DATABASE_URL` at the restored instance; run `pnpm db:migrate` (should be no-op if dump is current).
5. Verify `/ready`, login, one order list, admin health.
6. Redeploy / scale API back; clear Redis entitlement caches if tenants look stale.
7. Write incident notes: backup ID, restore start/end, smoke results.

## B. Local Docker Postgres (dev drill)

Compose service: `postgres` (`postgres:16-alpine`), DB `supplify`, user/password from env defaults.

```bash
# Dump
docker exec supplify-postgres pg_dump -U postgres -d supplify -Fc -f /tmp/supplify-drill.dump
docker cp supplify-postgres:/tmp/supplify-drill.dump ./supplify-drill.dump

# Scratch restore
docker exec supplify-postgres psql -U postgres -c "DROP DATABASE IF EXISTS supplify_restore_drill;"
docker exec supplify-postgres psql -U postgres -c "CREATE DATABASE supplify_restore_drill;"
docker cp ./supplify-drill.dump supplify-postgres:/tmp/supplify-drill.dump
docker exec supplify-postgres pg_restore -U postgres -d supplify_restore_drill --no-owner --clean --if-exists /tmp/supplify-drill.dump

# Verify
docker exec supplify-postgres psql -U postgres -d supplify_restore_drill -c "SELECT COUNT(*) AS users FROM app_user;"

# Cleanup
docker exec supplify-postgres psql -U postgres -c "DROP DATABASE IF EXISTS supplify_restore_drill;"
rm -f ./supplify-drill.dump
```

If the container name differs (`postgres_docker`), substitute that name.

## C. Keycloak realm / DB

- Realm JSON import: see `docs/operations/keycloak-railway-memory-fix.md` and `pnpm keycloak:realm:import`.
- Keycloak Postgres DB must be dumped separately (`pg_dump` on the `keycloak` database).
- App restore does **not** restore Keycloak users — coordinate IdP restore if auth is broken.

## D. Rollback without DB restore

- **App only:** redeploy previous Railway image / `git` SHA via [deployment.md](./deployment.md) promote scripts.
- **Migrations forward-only:** prefer expand/contract; if a bad migration shipped, restore DB from backup taken **before** migrate, then redeploy older API.

## E. Go / no-go for first pilot client

- [ ] Prod (or pilot) Postgres backups enabled
- [ ] At least one **successful restore drill** recorded (date + operator + row-count smoke)
- [ ] Dump storage location and access documented privately
- [ ] Keycloak backup or realm export procedure known

## F. Drill log

| Date (UTC) | Environment                       | Operator          | Method                                                        | Result                                                 |
| ---------- | --------------------------------- | ----------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| 2026-07-24 | local Docker / localhost Postgres | audit fix session | `pg_dump` custom → `pg_restore` into `supplify_restore_drill` | PASS — see `docs/audits/_tmp-backup-restore-drill.log` |
