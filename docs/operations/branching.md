# Branching & release workflow

| Branch    | Purpose                                      | Deploy target   |
| --------- | -------------------------------------------- | --------------- |
| `dev`     | Active development — docs, tests, seeds      | Railway dev     |
| `preprod` | Pre-production / UAT — **runtime code only** | Railway preprod |
| `prod`    | Production — **runtime code only**           | Railway prod    |

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
3. Runs `scripts/prune-release-tree.mjs` (removes docs, tests, seeds, e2e, local docker, etc.)
4. Commits the pruned tree and pushes

Railway deploys automatically from the pushed branch. See [railway-environments.md](./railway-environments.md).

## What the prune script removes (preprod & prod)

- `docs/`, `tests/`, `.github/`, `.cursor/`, `.cursorrules`, `.claude/`, `.husky/`
- Dev scripts, seed scripts (keeps `migrate.js`, `run-migration.js`, `sync-system-roles.mjs`)
- All `*.test.js` / `*.test.ts(x)` under `apps/`
- E2E routes, root `docker-compose.yml`, `docker/` (local dev stack)
- `scripts/promote-release.mjs` and `scripts/prune-release-tree.mjs` on the release branch itself

## Deployment

Railway config and env templates: `deploy/railway/`. Guide: [railway.md](./railway.md).
