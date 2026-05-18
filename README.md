# Supplify (Pre-production branch)

Deploy-only branch. **Do not develop here** — merge from `dev`, then run:

```bash
node scripts/prune-release-tree.mjs --tier preprod
```

## Deploy

| Environment | Command |
| --- | --- |
| Pre-production | `sudo ./deploy/scripts/deploy-preprod.sh` |

Migrations: `pnpm db:migrate`

Branching guide: see `docs/BRANCHING.md` on the `dev` branch.
