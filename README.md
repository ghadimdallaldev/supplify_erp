# Supplify

Restaurant & F&B supplier marketplace — monorepo (`apps/api`, `apps/web`).

## Quick start

```cmd
pnpm setup
pnpm dev
```

Open **http://localhost:5173** (native dev) or use full Docker below.

## Documentation

Full guide: **[docs/README.md](docs/README.md)**

| Topic                 | Doc                                                        |
| --------------------- | ---------------------------------------------------------- |
| **Feature catalog**   | [docs/product/features.md](docs/product/features.md)                       |
| Local Docker workflow | [docs/README.md](docs/README.md)                           |
| Database migrations   | [docs/guides/database-migrations.md](docs/guides/database-migrations.md) |
| Admin feature toggles | [docs/admin/admin-feature-flags.md](docs/admin/admin-feature-flags.md) |
| Production deploy     | [deploy/README.md](deploy/README.md)                       |

## Scripts

```bash
pnpm install
pnpm dev          # native API + web (infra via Docker)
pnpm test:ci      # unit tests
pnpm db:migrate   # SQL migrations
```

## License

MIT
