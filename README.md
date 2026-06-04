# Supplify (Production branch)

Deploy-only branch. **Do not develop here** — merge from `dev`, then run:

```bash
pnpm install
pnpm build
pnpm db:migrate
```

| Environment | Command |
| --- | --- |
| Production | `sudo ./deploy/scripts/deploy-prod.sh` |

Branching guide: see `docs/operations/branching.md` on the `dev` branch.
