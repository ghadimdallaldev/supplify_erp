# Supplify

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

See **[docs/operations/branching.md](docs/operations/branching.md)** for promote workflow.

## Documentation

Full guide: **[docs/README.md](docs/README.md)**

| Topic                      | Doc                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature catalog**        | [docs/product/features.md](docs/product/features.md)                                                                                                                      |
| Local Docker workflow      | [docs/README.md](docs/README.md)                                                                                                                                          |
| Database migrations        | [docs/guides/database-migrations.md](docs/guides/database-migrations.md)                                                                                                  |
| Admin feature toggles      | [docs/admin/feature-flags.md](docs/admin/feature-flags.md)                                                                                                                |
| Railway (dev/preprod/prod) | [docs/operations/railway-environments.md](docs/operations/railway-environments.md) · [docs/operations/environment-variables.md](docs/operations/environment-variables.md) |
| Production deploy (Docker) | [deploy/README.md](deploy/README.md)                                                                                                                                      |

## Scripts

```bash
pnpm install
pnpm dev          # native API + web (infra via Docker)
pnpm build        # production build (web TypeScript + Vite)
pnpm test:api     # API unit tests (vitest run, non-watch — use before PR)
pnpm test:web     # web unit tests (vitest run)
pnpm test:all     # API + web unit tests (same as test:ci)
pnpm test:ci      # alias for test:all
pnpm db:migrate   # SQL migrations
```

**Testing:** Full guide in [docs/qa/testing-guide.md](docs/qa/testing-guide.md). API mock patterns: [docs/API_TEST_SUITE_STABILIZATION.md](docs/API_TEST_SUITE_STABILIZATION.md). Use `pnpm test:api:watch` only while developing; use `pnpm test:api` for final verification (not `pnpm test`, which watches).

## Environment variables (keys only)

Copy env templates per target: `apps/api/.env.dev.example`, `.env.preprod.example`, `.env.prod.example` (and matching `apps/web/.env.*.example`). For local work, copy `apps/api/.env.dev.example` → `apps/api/.env`. **Local Postgres/Redis/Keycloak** live in `docker/.env`. Native dev syncs `apps/api/.env.docker-sync` automatically.

| Key                               | Purpose                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docker/.env` `POSTGRES_*`        | Local PostgreSQL (source of truth)                                                                                        |
| `DATABASE_URL` in `apps/api/.env` | Optional override (remote DB, CI)                                                                                         |
| `REDIS_URL`                       | Cache (permissions, feature flags)                                                                                        |
| `WEB_ORIGIN` / `WEB_ORIGINS`      | Allowed browser origins (CORS)                                                                                            |
| `SESSION_SECRET`                  | Express session signing                                                                                                   |
| `KEYCLOAK_*`                      | OIDC realm, client, admin API                                                                                             |
| `STORAGE_*`                       | Object storage (`local` or `s3`-compatible); see [docs/operations/storage-uploads.md](docs/operations/storage-uploads.md) |
| `VAPID_*`                         | Web Push                                                                                                                  |
| `SMTP_*` / `EMAIL_*`              | Transactional email (Mailpit local, Resend SMTP prod)                                                                     |
| `E2E_SECRET`                      | Enables `/api/e2e` test helpers when set                                                                                  |

See `apps/api/src/config/env.js` for the full list with defaults.

## API reference

Route groups: **[docs/api/README.md](docs/api/README.md)**

## License

MIT
