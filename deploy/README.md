# Supplify deployment (Railway)

**Primary hosting:** [railway-environments.md](../docs/operations/railway-environments.md) — dev, preprod, and prod on Railway.

**Release branches (`preprod`, `prod`)** contain runtime code only. Promote from `dev` with `pnpm promote:preprod` or `pnpm promote:prod` (see [branching.md](../docs/operations/branching.md)).

## Layout

| Path                                   | Purpose                                                             |
| -------------------------------------- | ------------------------------------------------------------------- |
| `deploy/railway/`                      | Committed Railway env defaults per environment (API, web, Keycloak) |
| `deploy/keycloak/`                     | Realm exports and Keycloak notes for Railway + local Docker         |
| `deploy/scripts/keycloak-init.sh`      | Keycloak realm bootstrap (local Docker stack)                       |
| `deploy/scripts/minio-init-buckets.sh` | MinIO bucket init (local Docker stack)                              |
| `deploy/db/init.sql`                   | Postgres init for local Keycloak DB                                 |

## Railway quick start

1. Configure services per [deploy/railway/README.md](./railway/README.md).
2. Set secrets from each `secrets.env.example`.
3. Push to `dev`, `preprod`, or `prod` — Railway deploys from the matching branch.
4. Sync Keycloak vars: `pnpm railway:keycloak:sync -- development`
5. Web Push keys: `pnpm vapid:generate` then `pnpm railway:vapid:sync -- development`

Full guide: [docs/operations/railway.md](../docs/operations/railway.md).

## Local Docker stack (development)

For a full local stack (nginx + API + web + infra), use the root `docker-compose.yml`:

```bash
pnpm local:up
pnpm local:seed
pnpm local:status
pnpm local:down
```

Native dev (hot reload, infra in Docker only): `pnpm dev`.

MinIO buckets are created by `deploy/scripts/minio-init-buckets.sh` during compose startup. See [storage-uploads.md](../docs/operations/storage-uploads.md).
