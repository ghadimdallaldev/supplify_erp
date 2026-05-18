# Branching & release workflow

| Branch    | Purpose                                        | Deploy target                                                  |
| --------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `dev`     | Active development, docs, tests, seeds         | EC2 dev (`deploy-ec2-dev.yml`)                                 |
| `preprod` | Pre-production / UAT; **no** docs or test tree | Staging infra (`deploy-preprod.yml`, `deploy-ec2-preprod.yml`) |
| `prod`    | Production; **no** docs or test tree           | Production (`deploy-prod.yml`, `deploy-ec2-prod.yml`)          |

`main` remains the default branch on GitHub for history; **production deploys use `prod`**, not `main`.

## Promote dev → preprod

```bash
git checkout preprod
git merge origin/dev
node scripts/prune-release-tree.mjs --tier preprod
git add -A
git commit -m "chore(release): sync preprod from dev"
git push origin preprod
```

## Promote preprod → prod

After UAT sign-off:

```bash
git checkout prod
git merge origin/preprod
node scripts/prune-release-tree.mjs --tier prod
git add -A
git commit -m "chore(release): sync prod from preprod"
git push origin prod
```

## What the prune script removes

- `docs/`, `tests/`, `.husky/`, dev scripts, seed scripts (keeps `migrate.js`)
- All `*.test.js` / `*.test.ts(x)` under `apps/`
- E2E route module and dev-only GitHub Actions (CI, deploy-dev, etc.)
- Slim `package.json` files (build + migrate + deploy only)

## GitHub environments

Configure GitHub **environments** `staging` (for preprod) and `production` (for prod) with the correct AWS/EC2 secrets.

For EC2 Docker deploys, set optional secret `EC2_DEPLOY_BRANCH` to `preprod` or `prod` on each server.
