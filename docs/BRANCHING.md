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

## Release chain (required order)

```
dev  ──promote──►  preprod  ──UAT sign-off──►  prod
```

**Never merge `dev` directly into `prod`.** Production must only receive the **already-pruned** preprod tree so it stays free of docs, tests, dev scripts, and local tooling.

From a clean **`dev`** working tree:

```bash
# 1) UAT environment
node scripts/promote-release.mjs --tier preprod

# 2) After preprod UAT passes
node scripts/promote-release.mjs --tier prod
```

Each promote:

1. Merges the **source** branch (`dev` → preprod, `preprod` → prod)
2. Syncs `apps/` + migrations from that source
3. Runs `scripts/prune-release-tree.mjs` (removes docs, tests, seeds, e2e, dev deploy files, etc.)
4. Commits the pruned tree and pushes

Deploy on the target host with CDK (`infra/`) or `deploy/scripts/deploy-preprod.sh` / `deploy-prod.sh`.

## What the prune script removes (preprod & prod)

- `docs/`, `tests/`, `.github/`, `.cursor/`, `.cursorrules`, `.claude/`, `.husky/`
- Dev scripts, seed scripts (keeps `migrate.js`, `run-migration.js`, `sync-system-roles.mjs`)
- All `*.test.js` / `*.test.ts(x)` under `apps/`
- E2E routes, local `docker-compose.yml`, other env deploy scripts/compose files
- `scripts/promote-release.mjs` and `scripts/prune-release-tree.mjs` on the release branch itself

**Prod additionally removes** preprod-only deploy artifacts (staging compose, `deploy-preprod.sh`, etc.).

## AWS CDK

Infrastructure and deployments live under `infra/`. See `infra/README.md` for `cdk deploy` usage per environment.
