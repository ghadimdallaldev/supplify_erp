# Deployment

Supplify deploys to **Railway** (primary) with optional Docker/EC2 scripts under `deploy/`.

## Railway (recommended)

| Doc                                                    | Purpose                                     |
| ------------------------------------------------------ | ------------------------------------------- |
| [railway-environments.md](./railway-environments.md)   | Dev, preprod, prod isolation                |
| [railway.md](./railway.md)                             | Quick monorepo service setup                |
| [environment-variables.md](./environment-variables.md) | Full env reference                          |
| [env-matrix.md](./env-matrix.md)                       | Quick dev vs preprod vs prod matrix         |
| [branching.md](./branching.md)                         | `dev` → `preprod` → `prod` promote workflow |

Committed Railway defaults: `deploy/railway/`. Local templates: `apps/api/.env.{dev,preprod,prod}.example`.

## Docker / EC2 (legacy)

Scripts: [deploy/README.md](../../deploy/README.md). Historical EC2 design: [archive/legacy-ec2](../archive/legacy-ec2/README.md).

## Release branches

Only **`dev`** contains documentation. **`staging`**, **`preprod`**, and **`prod`** are runtime-only trees promoted via `node scripts/promote-release.mjs`.
