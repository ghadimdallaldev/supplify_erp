# Supplify deployment

**Release branches (`preprod`, `prod`) contain runtime code only** — no docs, tests, or IDE/agent config. Promote from `dev` with `pnpm promote:preprod` or `pnpm promote:prod` (see `docs/BRANCHING.md`).

One-command **EC2 Docker** deploy per environment (run from repo root on the server):

| Environment    | Git branch | Command                                   |
| -------------- | ---------- | ----------------------------------------- |
| Dev            | `dev`      | `sudo ./deploy/scripts/deploy-dev.sh`     |
| Pre-production | `preprod`  | `sudo ./deploy/scripts/deploy-preprod.sh` |
| Production     | `prod`     | `sudo ./deploy/scripts/deploy-prod.sh`    |

Legacy: `deploy-staging.sh` remains for servers already on staging compose files (same as preprod).

Each script bootstraps Docker, creates `deploy/env/.env.<env>`, builds images, starts infra (Postgres, Redis, MinIO, Keycloak), runs migrations + tenant role backfill + **system role sync** (`sync-system-roles.mjs`) + Keycloak realm init, then starts the app behind nginx.

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

## GitHub Actions → EC2 (Docker deploy)

This repo has **two deploy paths**:

| Path                     | Workflows                                         | Target                                       |
| ------------------------ | ------------------------------------------------- | -------------------------------------------- |
| **EC2 + Docker Compose** | `deploy-ec2-prod.yml`, `deploy-ec2-dev.yml`       | Your VM running `deploy/scripts/deploy-*.sh` |
| **AWS CDK / ECS / S3**   | `deploy-prod.yml`, `deploy-dev.yml`, `deploy.yml` | ECR, ECS, CloudFront (legacy CDK infra)      |

For **EC2**, use the new workflows.

### 1) One-time server bootstrap

On the EC2 instance:

```bash
sudo mkdir -p /opt/supplify && sudo chown $USER:$USER /opt/supplify
git clone https://github.com/<org>/supplify_erp.git /opt/supplify
cd /opt/supplify
sudo ./deploy/scripts/deploy-prod.sh   # or deploy-dev.sh
```

This creates `deploy/env/.env.prod` (secrets stay **on the server**, not in GitHub).

### 2) SSH key for GitHub Actions

On your laptop:

```bash
ssh-keygen -t ed25519 -f supplify-deploy -N ""
```

- Add `supplify-deploy.pub` to the EC2 instance: `~/.ssh/authorized_keys`
- Add **private** key contents to GitHub → **Settings → Secrets and variables → Actions**

| Secret              | Example                         |
| ------------------- | ------------------------------- |
| `EC2_HOST`          | `3.28.x.x` or `app.example.com` |
| `EC2_USER`          | `ubuntu` or `ec2-user`          |
| `EC2_SSH_KEY`       | full PEM private key            |
| `EC2_DEPLOY_PATH`   | `/opt/supplify` (optional)      |
| `EC2_DEPLOY_BRANCH` | `main` or `dev` (optional)      |

Use **GitHub Environments** (`production`, `dev`) so dev and prod can use different hosts/secrets.

### 3) Git pull on the server

The workflow runs `git pull` on EC2. Allow that once:

- **HTTPS:** create a fine-grained PAT and `git remote set-url origin https://<token>@github.com/...` on the server, or
- **SSH:** add a **deploy key** (read-only) on the repo and use `git@github.com:...` remote on EC2

### 4) What runs automatically

| Event          | Workflow                                           |
| -------------- | -------------------------------------------------- |
| Push to `dev`  | `Deploy EC2 Dev` → `deploy-dev.sh`                 |
| Push to `main` | `Deploy EC2 Production` → tests + `deploy-prod.sh` |
| Manual         | Actions tab → **Run workflow**                     |

### 5) Security group

EC2 security group: allow **22** from GitHub Actions IPs (or a bastion), **80** (and **443** if TLS) from the internet. GitHub-hosted runners use dynamic IPs; many teams use a **self-hosted runner** on the EC2 box to avoid opening SSH to the world.

## Files

| Path                                           | Purpose                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `deploy/docker-compose.{dev,staging,prod}.yml` | Full 12-service stack per env             |
| `deploy/env/.env.{dev,staging,prod}.example`   | Env templates                             |
| `deploy/scripts/_common.sh`                    | Bootstrap helpers (Docker, swap, secrets) |
| `deploy/scripts/deploy-*.sh`                   | One-command deploy                        |
| `docker-compose.yml`                           | Local dev stack (repo root)               |
