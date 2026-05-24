# Supplify (Production branch)

Deploy-only branch ΓÇö **do not develop here**. Merge from `dev` on the `dev` branch using:

```bash
node scripts/promote-release.mjs --tier prod
```

## Deploy (EC2 Docker)

```bash
sudo ./deploy/scripts/deploy-prod.sh
```

Migrations run automatically during deploy. Branching guide: see `docs/BRANCHING.md` on the `dev` branch.
