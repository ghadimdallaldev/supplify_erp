# Supplify (Production branch)

Deploy-only branch. **Do not develop here** — merge from `dev`, then run:

```bash
node scripts/prune-release-tree.mjs --tier prod
```

## Deploy

| Environment | Command |
| --- | --- |
| Production | `sudo ./deploy/scripts/deploy-prod.sh` |

Migrations: `pnpm db:migrate`

Branching guide: see `docs/BRANCHING.md` on the `dev` branch.
