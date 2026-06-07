# Keycloak on Railway (all environments)

`--import-realm` only imports JSON files baked into the image at  
`/opt/keycloak/data/import/<realm>-realm.json`.  
Do **not** deploy the stock Keycloak image without building `deploy/railway/keycloak/Dockerfile`.

**Database:** [`KEYCLOAK_RAILWAY_DB_NOTES.md`](../KEYCLOAK_RAILWAY_DB_NOTES.md) — dedicated Postgres DB `keycloak`.  
**Memory / JVM:** [`KEYCLOAK_RAILWAY_MEMORY_NOTES.md`](../KEYCLOAK_RAILWAY_MEMORY_NOTES.md) — caps and start modes.  
**Incident write-up:** [`docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md`](../../docs/infra/KEYCLOAK_RAILWAY_MEMORY_FIX.md).

## Per-environment Railway settings

| Environment     | Config file                         | Realm export                | Realm name         | Optimized start                     |
| --------------- | ----------------------------------- | --------------------------- | ------------------ | ----------------------------------- |
| **development** | `development/keycloak/railway.json` | `realm-export.json`         | `Supplify`         | No (`KEYCLOAK_USE_OPTIMIZED=false`) |
| **preprod**     | `preprod/keycloak/railway.json`     | `realm-export.preprod.json` | `supplify-preprod` | No                                  |
| **staging**     | `staging/keycloak/railway.json`     | `realm-export.preprod.json` | `supplify-preprod` | No                                  |
| **production**  | `production/keycloak/railway.json`  | `realm-export.prod.json`    | `supplify-prod`    | Yes (`KEYCLOAK_USE_OPTIMIZED=true`) |

All environments share **`deploy/railway/keycloak/Dockerfile`** (realm JSON, `railway-entrypoint.sh`, psql, `kc.sh build --db=postgres`). Per-env differences are in `railway.json` `buildArgs` and `keycloak.env`.

## Every Keycloak service

| Setting            | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Root Directory** | _(empty — repo root)_                                             |
| **Config file**    | `deploy/railway/<env>/keycloak/railway.json`                      |
| **Start command**  | `/opt/keycloak/bin/railway-entrypoint.sh start --import-realm`    |
| **Healthcheck**    | `/health/ready`, timeout **600**                                  |
| **Public port**    | `8080`                                                            |
| **Variables**      | `pnpm railway:keycloak:sync -- <env>` + `KEYCLOAK_ADMIN_PASSWORD` |

Set **`KC_HOSTNAME`** in `keycloak.env` to the public hostname (no `https://` prefix). Use **`KC_PROXY_HEADERS=xforwarded`** only — do not set deprecated `KC_PROXY=edge`.

## Boot flow (`railway-entrypoint.sh` v3)

1. Wait for Postgres; create database **`keycloak`** if missing.
2. Set runtime JDBC: `KC_DB_URL`, `KC_DB_USERNAME`, `KC_DB_PASSWORD`.
3. Block `start-dev`.
4. On `start`:
   - **`KEYCLOAK_USE_OPTIMIZED=true`** (prod): `kc.sh start --optimized` + JDBC args.
   - **`KEYCLOAK_USE_OPTIMIZED=false`** (dev/preprod/staging): `kc.sh start --db=postgres` + JDBC args.

## Sync variables

```bash
railway login && railway link
KEYCLOAK_ADMIN_PASSWORD=secret pnpm railway:keycloak:sync -- development
KEYCLOAK_ADMIN_PASSWORD=secret pnpm railway:keycloak:sync -- preprod
KEYCLOAK_ADMIN_PASSWORD=secret pnpm railway:keycloak:sync -- staging
KEYCLOAK_ADMIN_PASSWORD=secret pnpm railway:keycloak:sync -- production
```

## Verify after deploy

```text
https://<KC_HOSTNAME>/health/ready
https://<KC_HOSTNAME>/realms/<realm>/.well-known/openid-configuration
```

| env               | realm              |
| ----------------- | ------------------ |
| dev               | `Supplify`         |
| preprod / staging | `supplify-preprod` |
| prod              | `supplify-prod`    |

## API + web must match

| env               | API `KEYCLOAK_REALM` | Web `VITE_KEYCLOAK_REALM` |
| ----------------- | -------------------- | ------------------------- |
| dev               | `Supplify`           | `Supplify`                |
| preprod / staging | `supplify-preprod`   | `supplify-preprod`        |
| prod              | `supplify-prod`      | `supplify-prod`           |

Redirect URIs: `deploy/railway/<env>/KEYCLOAK_CLIENT.md`.

## Staging vs preprod

Railway **staging** uses the same realm export as **preprod** (`realm-export.preprod.json`). Use the staging config path only if your Railway project has a literal `staging` environment.
