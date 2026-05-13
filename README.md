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

| Topic | Doc |
|-------|-----|
| Local Docker workflow | [docs/README.md](docs/README.md) |
| Database migrations | [docs/database-migrations.md](docs/database-migrations.md) |
| Admin feature toggles | [docs/admin-feature-flags.md](docs/admin-feature-flags.md) |
| Production deploy | [deploy/README.md](deploy/README.md) |

## Scripts

```bash
pnpm install
pnpm dev          # native API + web (infra via Docker)
pnpm test:ci      # unit tests
pnpm db:migrate   # SQL migrations
```

## License

MIT
