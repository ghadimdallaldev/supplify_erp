# Deploy environment templates (Docker / VM)

These `.env.*.example` files are used by **legacy EC2/Docker** deploy scripts (`deploy/scripts/deploy-*.sh`), not by Railway.

**Railway (recommended):** committed defaults in [`deploy/railway/`](../railway/README.md) (auto-loaded on deploy). Secrets: `deploy/railway/development/secrets.env.example`. Local templates: `apps/api/.env.{dev,preprod,prod}.example` — see [railway-environments.md](../../docs/deployment/railway-environments.md).

**Docker / VM:** set `CRONS_ENABLED=true` in your copied `deploy/env/.env.*` (see `.env.*.example`). Set **`EMAIL_*`** and **`SMTP_*`** for transactional email (dev defaults to `EMAIL_LOG_ONLY=true`; staging/prod need `SMTP_PASS`). The compose `migrate` service applies all SQL under `apps/api/db/migrations/` on deploy (includes **0136_email_delivery_log.sql** for email dedup).

Backup variables use generic **`BACKUP_STORAGE_*`** / **`STORAGE_*`** names (S3-compatible storage, not AWS-specific).
