# Supplify

Deploy-only branch — **do not develop here**. On `dev`: `node scripts/promote-release.mjs --tier preprod`, then after UAT `--tier prod` (prod merges **preprod**, not dev).

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

| Topic                      | Doc                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Feature catalog**        | [docs/product/features.md](docs/product/features.md)                                                                            |
| Local Docker workflow      | [docs/README.md](docs/README.md)                                                                                                |
| Database migrations        | [docs/guides/database-migrations.md](docs/guides/database-migrations.md)                                                        |
| Admin feature toggles      | [docs/admin/admin-feature-flags.md](docs/admin/admin-feature-flags.md)                                                          |
| Railway (dev/preprod/prod) | [DEPLOYMENT_RAILWAY_ENVIRONMENTS.md](DEPLOYMENT_RAILWAY_ENVIRONMENTS.md) · [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| Production deploy (Docker) | [deploy/README.md](deploy/README.md)                                                                                            |

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

Migrations run automatically during deploy. Branching guide: see `docs/BRANCHING.md` on the `dev` branch.
