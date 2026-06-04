# Supplify deployment

**Primary hosting:** [railway-environments.md](../docs/operations/railway-environments.md) (dev / preprod / prod on Railway).

**Release branches (`preprod`, `prod`)** contain runtime code only — promote from `dev` with `pnpm promote:preprod` or `pnpm promote:prod` (see `docs/operations/branching.md`).

---

## Legacy: EC2 Docker (optional VM)

Historical design notes: [docs/archive/legacy-ec2/](../docs/archive/legacy-ec2/README.md).

One-command **EC2 Docker** deploy per environment (run from repo root on the server):

| Environment    | Git branch | Command                                   |
| -------------- | ---------- | ----------------------------------------- |
| Dev            | `dev`      | `sudo ./deploy/scripts/deploy-dev.sh`     |
| Pre-production | `preprod`  | `sudo ./deploy/scripts/deploy-preprod.sh` |
| Production     | `prod`     | `sudo ./deploy/scripts/deploy-prod.sh`    |

Legacy: `deploy-staging.sh` remains for servers already on staging compose files (same as preprod).

Each script bootstraps Docker, creates `deploy/env/.env.<env>`, builds images, starts infra (Postgres, Redis, MinIO, Keycloak), runs migrations + tenant role backfill + **system role sync** (`sync-system-roles.mjs`) + Keycloak realm init, then starts the app behind nginx.

The **migrate** service applies all pending SQL files under `apps/api/db/migrations/` (including restaurant-operations migrations **0133–0135**). Set `CRONS_ENABLED=true` in `deploy/env/.env.*` so in-process jobs (expiry + reorder reminders) run in the backend container.

## Local full stack (developer machine)

```bash
pnpm local:up
# or: ./scripts/run-local.sh
```

Creates `docker/.env` from the example if missing, auto-adjusts busy ports (Postgres 5433, app 8080, etc.), builds images, runs migrations + Keycloak realm init, then prints URLs.

```bash
pnpm local:status
pnpm local:logs
pnpm local:seed
pnpm local:down
```

App: http://localhost — Keycloak: http://localhost:8180 (realm **Supplify**)

## MinIO buckets (product images, uploads)

Uploads use **MinIO** (S3-compatible API). A “bucket” is only a namespace on your MinIO server—not AWS.

| Variable                               | Purpose                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `S3_BUCKET`                            | Active bucket for new uploads (e.g. `supplify`)                                                 |
| `S3_BUCKETS`                           | Optional comma-separated list of buckets to **create** at init (e.g. `supplify,supplify-media`) |
| `S3_ENDPOINT`                          | MinIO URL **from the API container** (`http://minio:9000`)                                      |
| `S3_PUBLIC_URL`                        | MinIO URL **for browsers** (`http://<host>:9000`; set automatically in deploy scripts)          |
| `S3_PUBLIC_READ` / `MINIO_PUBLIC_READ` | When `true`, init grants public GET on bucket objects (product images)                          |

Deploy and `docker compose` run `deploy/scripts/minio-init-buckets.sh`, which creates each bucket and sets **public download** so `product.image_url` works in the browser. The API also ensures buckets on startup.

**Add a new bucket tomorrow:**

1. Set `S3_BUCKETS=supplify,your-new-bucket` in `deploy/env/.env.<env>` (or `docker/.env` locally).
2. Run init: `docker compose run --rm minio-init` or `pnpm storage:ensure-buckets` (API env must reach MinIO).
3. When ready to upload into it, set `S3_BUCKET=your-new-bucket` and restart the API.

Console: MinIO UI on port **9001** (see deploy script output).

## Day-2 operations

Ops scripts accept optional env: `dev`, `staging`, or `prod` (default `prod`).

```bash
./deploy/scripts/status.sh prod
./deploy/scripts/logs.sh prod backend
./deploy/scripts/backup-now.sh prod
./deploy/scripts/stop.sh staging
./deploy/scripts/start.sh dev
```

## Systemd (start on reboot)

Assumes repo at `/opt/supplify`:

```bash
sudo cp deploy/systemd/supplify.service /etc/systemd/system/
sudo cp deploy/systemd/supplify-dev.service /etc/systemd/system/
sudo cp deploy/systemd/supplify-staging.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now supplify   # production
```

## EC2 manual deploy (Docker Compose)

For VM hosting, deploy on the server after pulling the target branch (`dev`, `preprod`, or `prod`):

```bash
sudo mkdir -p /opt/supplify && sudo chown $USER:$USER /opt/supplify
git clone https://github.com/<org>/supplify_erp.git /opt/supplify
cd /opt/supplify
git checkout prod   # or dev / preprod
sudo ./deploy/scripts/deploy-prod.sh   # or deploy-dev.sh / deploy-preprod.sh
```

Secrets live in `deploy/env/.env.*` on the server. Re-deploy after `git pull`:

```bash
cd /opt/supplify && git pull origin prod && sudo ./deploy/scripts/deploy-prod.sh
```

For **Railway** hosting, see [railway.md](../docs/operations/railway.md). AWS CDK was removed from this repo.

## Files

| Path                                           | Purpose                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `deploy/docker-compose.{dev,staging,prod}.yml` | Full 12-service stack per env             |
| `deploy/env/.env.{dev,staging,prod}.example`   | Env templates                             |
| `deploy/scripts/_common.sh`                    | Bootstrap helpers (Docker, swap, secrets) |
| `deploy/scripts/deploy-*.sh`                   | One-command deploy                        |
| `docker-compose.yml`                           | Local dev stack (repo root)               |
