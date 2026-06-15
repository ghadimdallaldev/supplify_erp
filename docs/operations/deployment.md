# Deployment

Supplify deploys to **Railway** (dev, preprod, prod).

## Railway

| Doc                                                    | Purpose                                     |
| ------------------------------------------------------ | ------------------------------------------- |
| [railway-environments.md](./railway-environments.md)   | Dev, preprod, prod isolation                |
| [railway.md](./railway.md)                             | Quick monorepo service setup                |
| [environment-variables.md](./environment-variables.md) | Full env reference                          |
| [env-matrix.md](./env-matrix.md)                       | Quick dev vs preprod vs prod matrix         |
| [branching.md](./branching.md)                         | `dev` → `preprod` → `prod` promote workflow |

Committed Railway defaults: `deploy/railway/`. Local templates: `apps/api/.env.{dev,preprod,prod}.example`.

## Local development

Use `pnpm dev` (native hot reload) or `pnpm local:up` (full Docker stack). See [deploy/README.md](../../deploy/README.md).

## Release branches

Only **`dev`** contains documentation. **`preprod`** and **`prod`** are runtime-only trees promoted via `node scripts/promote-release.mjs`.
