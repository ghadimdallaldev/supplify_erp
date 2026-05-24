# Branching & release workflow

| Branch    | Purpose                                      | Deploy target (EC2 Docker)                     |
| --------- | -------------------------------------------- | ---------------------------------------------- |
| `dev`     | Active development — docs, tests, seeds, CI  | `deploy-ec2-dev.yml` → `deploy-dev.sh`         |
| `preprod` | Pre-production / UAT — **runtime code only** | `deploy-ec2-preprod.yml` → `deploy-preprod.sh` |
| `prod`    | Production — **runtime code only**           | `deploy-ec2-prod.yml` → `deploy-prod.sh`       |

Each environment runs on its **own EC2 instance** with isolated Docker volumes, env files, and image tags:

| Env     | Compose file                        | Env file                  | Backend image              |
| ------- | ----------------------------------- | ------------------------- | -------------------------- |
| Dev     | `deploy/docker-compose.dev.yml`     | `deploy/env/.env.dev`     | `supplify-backend:dev`     |
| Preprod | `deploy/docker-compose.staging.yml` | `deploy/env/.env.staging` | `supplify-backend:staging` |
| Prod    | `deploy/docker-compose.prod.yml`    | `deploy/env/.env.prod`    | `supplify-backend:prod`    |

`main` is the GitHub default branch for history; **production deploys use `prod`**, not `main`.

## Promote dev → preprod

From a clean `dev` branch:

```bash
node scripts/promote-release.mjs --tier preprod
```

Or use GitHub Actions → **Promote release** → `preprod`.

This merges `dev`, runs `prune-release-tree.mjs`, commits, and pushes. A push to `preprod` triggers EC2 deploy.

## Promote preprod → prod

After UAT sign-off, from a clean `dev` branch:

```bash
node scripts/promote-release.mjs --tier prod
```

This merges `preprod` into `prod`, prunes, commits, and pushes.

## What the prune script removes

- `docs/`, `tests/`, `.cursor/`, `.cursorrules`, `.claude/`, `.husky/`
- Dev scripts, seed scripts (keeps `migrate.js`, `run-migration.js`)
- All `*.test.js` / `*.test.ts(x)` under `apps/`
- E2E routes, local `docker-compose.yml`, other env deploy scripts/compose files
- All GitHub Actions except EC2 deploy + release-tree guard

## Release branch guard

`release-tree-guard.yml` fails CI if forbidden dev-only paths appear on `preprod` or `prod`.

## GitHub environments

Configure GitHub **environments** `dev`, `staging` (preprod), and `production` (prod) with EC2 secrets:

- `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`
- Optional: `EC2_DEPLOY_PATH` (default `/opt/supplify`), `EC2_DEPLOY_BRANCH`
