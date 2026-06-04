# Supplify (Pre-production branch)

Deploy-only branch — **do not develop here**. On `dev`: `node scripts/promote-release.mjs --tier preprod`, then after UAT `--tier prod` (prod merges **preprod**, not dev).

```bash
node scripts/promote-release.mjs --tier preprod
```

## Deploy (EC2 Docker)

```bash
sudo ./deploy/scripts/deploy-preprod.sh
```

Migrations run automatically during deploy. Branching guide: see `docs/BRANCHING.md` on the `dev` branch.
