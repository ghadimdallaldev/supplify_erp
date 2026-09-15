# Supplify (Pre-production branch)

Deploy-only branch ΓÇö **do not develop here**. On `dev`: `node scripts/promote-release.mjs --tier preprod`, then after UAT `--tier prod` (prod merges **preprod**, not dev).

```bash
node scripts/promote-release.mjs --tier preprod
```

## Deploy (Railway)

Push to this branch triggers Railway deploy for the matching environment. See `docs/operations/railway-environments.md` on the `dev` branch.
