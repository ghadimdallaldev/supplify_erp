# Branching & release workflow

| Branch    | Purpose                                      | Deploy target                        |
| --------- | -------------------------------------------- | ------------------------------------ |
| `dev`     | Active development — docs, tests, seeds, CI  | AWS CDK / manual `deploy-dev.sh`     |
| `preprod` | Pre-production / UAT — **runtime code only** | AWS CDK / manual `deploy-preprod.sh` |
| `prod`    | Production — **runtime code only**           | AWS CDK / manual `deploy-prod.sh`    |

Each environment can run on its **own host** with isolated Docker volumes, env files, and image tags:

| Env     | Compose file                        | Env file                  | Backend image              |
| ------- | ----------------------------------- | ------------------------- | -------------------------- |
| Dev     | `deploy/docker-compose.dev.yml`     | `deploy/env/.env.dev`     | `supplify-backend:dev`     |
| Preprod | `deploy/docker-compose.staging.yml` | `deploy/env/.env.staging` | `supplify-backend:staging` |
| Prod    | `deploy/docker-compose.prod.yml`    | `deploy/env/.env.prod`    | `supplify-backend:prod`    |

`main` is the GitHub default branch for history; **production releases use `prod`**, not `main`.

## Promote dev → preprod

From a clean `dev` branch:

```bash
node scripts/promote-release.mjs --tier preprod
```

This merges `dev`, runs `prune-release-tree.mjs`, commits, and pushes. Deploy preprod with CDK (`infra/`) or on the host: `sudo ./deploy/scripts/deploy-preprod.sh`.

## Promote dev → prod

After UAT sign-off, from a clean `dev` branch:

```bash
node scripts/promote-release.mjs --tier prod
```

This merges `dev`, prunes, commits, and pushes. Deploy prod with CDK or `sudo ./deploy/scripts/deploy-prod.sh`.

## What the prune script removes

- `docs/`, `tests/`, `.github/`, `.cursor/`, `.cursorrules`, `.claude/`, `.husky/`
- Dev scripts, seed scripts (keeps `migrate.js`, `run-migration.js`)
- All `*.test.js` / `*.test.ts(x)` under `apps/`
- E2E routes, local `docker-compose.yml`, other env deploy scripts/compose files

## AWS CDK

Infrastructure and deployments live under `infra/`. See `infra/README.md` for `cdk deploy` usage per environment.
