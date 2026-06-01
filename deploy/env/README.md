# Deploy environment templates (Docker / VM)

These `.env.*.example` files are used by **legacy EC2/Docker** deploy scripts (`deploy/scripts/deploy-*.sh`), not by Railway.

**Railway (recommended):** committed defaults in [`deploy/railway/`](../railway/README.md) (auto-loaded on deploy). Secrets: `deploy/railway/development/secrets.env.example`. Local templates: `apps/api/.env.{dev,preprod,prod}.example` — see [DEPLOYMENT_RAILWAY_ENVIRONMENTS.md](../../DEPLOYMENT_RAILWAY_ENVIRONMENTS.md).

Backup variables use generic **`BACKUP_STORAGE_*`** / **`STORAGE_*`** names (S3-compatible storage, not AWS-specific).
