# Supplify (Pre-production branch)

Restaurant & F&B supplier marketplace — monorepo (`apps/api`, `apps/web`).

## Quick start

```cmd
pnpm setup
pnpm dev
```

Open **http://localhost:5173** (native dev) or use full Docker below.

## Branches

| Branch    | Use                                 |
| --------- | ----------------------------------- |
| `dev`     | Development (docs, tests, seeds)    |
| `preprod` | Pre-production deploy (pruned tree) |
| `prod`    | Production deploy (pruned tree)     |

See **[docs/BRANCHING.md](docs/BRANCHING.md)** for promote workflow.

## Documentation

Full guide: **[docs/README.md](docs/README.md)**

| Topic                 | Doc                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Feature catalog**   | [docs/product/features.md](docs/product/features.md)                                               |
| Local Docker workflow | [docs/README.md](docs/README.md)                                                                   |
| Database migrations   | [docs/guides/database-migrations.md](docs/guides/database-migrations.md)                           |
| Admin feature toggles | [docs/admin/admin-feature-flags.md](docs/admin/admin-feature-flags.md)                             |
| Production deploy     | [DEPLOYMENT_RAILWAY.md](DEPLOYMENT_RAILWAY.md) · [deploy/README.md](deploy/README.md) (Docker/EC2) |

## Scripts

```bash
node scripts/promote-release.mjs --tier preprod
```

## Deploy (EC2 Docker)

```bash
sudo ./deploy/scripts/deploy-preprod.sh
```

Copy `apps/api/.env.example` to `apps/api/.env` for app secrets (Twilio, VAPID, etc.). **Local Postgres/Redis/Keycloak** credentials and ports live in `docker/.env` (created from `docker/.env.example` on first `pnpm local:infra` or `pnpm dev`). Native dev syncs `apps/api/.env.docker-sync` automatically — do not hand-edit that file.

| Key                                  | Purpose                                     |
| ------------------------------------ | ------------------------------------------- |
| `docker/.env` `POSTGRES_*`           | Local PostgreSQL (source of truth)          |
| `DATABASE_URL` in `apps/api/.env`    | Optional override (remote DB, CI)           |
| `REDIS_URL`                          | Cache (permissions, feature flags)          |
| `WEB_ORIGIN` / `WEB_ORIGINS`         | Allowed browser origins (CORS)              |
| `SESSION_SECRET`                     | Express session signing                     |
| `KEYCLOAK_*`                         | OIDC realm, client, admin API               |
| `STORAGE_*`                          | Object storage (`local` or `s3`-compatible) |
| `VAPID_*`                            | Web Push                                    |
| `TWILIO_*` / `SENDGRID_*` / `SMTP_*` | Messaging                                   |
| `E2E_SECRET`                         | Enables `/api/e2e` test helpers when set    |

See `apps/api/src/config/env.js` for the full list with defaults.

## API reference

Route groups: **[docs/api/README.md](docs/api/README.md)**

## License

MIT
