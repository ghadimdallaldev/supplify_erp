# Supplify Ops (Single VM) — Prod, Preprod, Dev

All scripts accept an optional **environment** as the first argument: `dev`, `preprod`, or `prod`. Default is `prod` if omitted.

## Directory layout (on the server)

- /opt/supplify
  - deploy/
  - env/
  - - .env (production)
  - - .env.dev
  - - .env.preprod
  - backups/ (production)
  - backups-dev/
  - backups-preprod/

## Setup (on the VM)

### Production

1. Create dirs:
   ```bash
   mkdir -p /opt/supplify/env /opt/supplify/backups
   ```
2. Copy env file:
   ```bash
   cp deploy/env/.env.example /opt/supplify/env/.env
   chmod 600 /opt/supplify/env/.env
   ```
3. Edit `/opt/supplify/env/.env` and set `POSTGRES_PASSWORD` and `DATABASE_URL`.
4. Make scripts executable: `chmod +x deploy/scripts/*.sh`
5. Start: `./deploy/scripts/start.sh` (or `./deploy/scripts/start.sh prod`)

### Dev

1. Create backup dir: `mkdir -p /opt/supplify/backups-dev`
2. Copy env: `cp deploy/env/.env.dev.example /opt/supplify/env/.env.dev` and `chmod 600 /opt/supplify/env/.env.dev`
3. Edit `/opt/supplify/env/.env.dev` (ports 3010/3011 by default).
4. Start: `./deploy/scripts/start.sh dev`

### Preprod

1. Create backup dir: `mkdir -p /opt/supplify/backups-preprod`
2. Copy env: `cp deploy/env/.env.preprod.example /opt/supplify/env/.env.preprod` and `chmod 600 /opt/supplify/env/.env.preprod`
3. Edit `/opt/supplify/env/.env.preprod` (ports 3020/3021 by default).
4. Start: `./deploy/scripts/start.sh preprod`

## Useful commands

Use `[env]` = `dev`, `preprod`, or `prod` (optional; default `prod`).

- Start: `./deploy/scripts/start.sh [env]`
- Stop: `./deploy/scripts/stop.sh [env]`
- Status: `./deploy/scripts/status.sh [env]`
- Logs (all): `./deploy/scripts/logs.sh [env]`
- Logs (service): `./deploy/scripts/logs.sh [env] backend|frontend|postgres|autoheal`
- Healthcheck: `./deploy/scripts/healthcheck.sh [env]`
- Restart backend: `./deploy/scripts/restart-backend.sh [env]`
- Restart frontend: `./deploy/scripts/restart-frontend.sh [env]`

## Backups

- Run now: `./deploy/scripts/backup-now.sh [env]`
- Restore latest: `./deploy/scripts/restore-latest.sh [env]`
- Restore file: `./deploy/scripts/restore-from-file.sh [env] /path/to/backup_xxx.dump`
- Retention: `BACKUP_RETENTION_DAYS` in env (default 14)
- Optional S3 upload: set `BACKUP_S3_BUCKET` (+ AWS creds) in the env file

Backup dirs: prod → `/opt/supplify/backups`, dev → `backups-dev`, preprod → `backups-preprod`.

## Daily backups via cron (recommended)

```bash
# Production only (example)
0 3 * * * /opt/supplify/deploy/scripts/backup-now.sh >> /opt/supplify/backups/backup-cron.log 2>&1
# Or for a specific env:
0 3 * * * /opt/supplify/deploy/scripts/backup-now.sh preprod >> /opt/supplify/backups-preprod/backup-cron.log 2>&1
```

## Autoheal

Autoheal restarts any container that becomes "unhealthy" (based on healthcheck). Each env has its own autoheal container.

## Systemd (start on reboot)

```bash
# Production
sudo cp deploy/systemd/supplify.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now supplify

# Dev
sudo cp deploy/systemd/supplify-dev.service /etc/systemd/system/
sudo systemctl enable --now supplify-dev

# Preprod
sudo cp deploy/systemd/supplify-preprod.service /etc/systemd/system/
sudo systemctl enable --now supplify-preprod
```

## Validate compose

```bash
docker compose --env-file /opt/supplify/env/.env -f deploy/docker-compose.prod.yml config
docker compose --env-file /opt/supplify/env/.env.dev -f deploy/docker-compose.dev.yml config
docker compose --env-file /opt/supplify/env/.env.preprod -f deploy/docker-compose.preprod.yml config
```

## Ports and project names

| Env     | Project name     | Backend port | Frontend port |
| ------- | ---------------- | ------------ | ------------- |
| prod    | supplify         | 3000         | 3001          |
| dev     | supplify-dev     | 3010         | 3011          |
| preprod | supplify-preprod | 3020         | 3021          |

Containers are named e.g. `supplify-postgres`, `supplify-dev-postgres`, `supplify-preprod-postgres`, so all three envs can run on the same host.

## EC2 production (first-time server setup)

For a fresh AWS EC2 instance (Amazon Linux 2023 or Ubuntu):

```bash
# On the instance (as root or with sudo)
export SUPPLIFY_REPO="https://github.com/ghadimdallaldev/supplify_erp.git"
export SUPPLIFY_DIR="/opt/supplify"
git clone --branch dev "$SUPPLIFY_REPO" "$SUPPLIFY_DIR"
sudo "$SUPPLIFY_DIR/deploy/ec2/bootstrap.sh"
cd "$SUPPLIFY_DIR" && ./deploy/ec2/deploy.sh
```

Or paste `deploy/ec2/user-data.example.sh` into EC2 **User data** at launch.

Bootstrap installs Docker, creates `/opt/supplify/env/.env` from `deploy/env/.env.example`, and enables the `supplify` systemd unit. Deploy builds `apps/api` and `apps/web` images, runs SQL migrations, and starts the stack behind nginx on port 80.

From your laptop (after SSH):

- `pnpm deploy:bootstrap` — run bootstrap on the server (if repo already cloned)
- `pnpm deploy:prod` — build images and start production stack

## Note: building from this repo

Production compose uses internal port **4000** for the API and **80** for the static frontend container. Nginx listens on **HTTP_PORT** (default 80) and proxies `/api`, `/auth`, and WebSocket traffic to the backend. Set `VITE_API_URL` and `PUBLIC_URL` to your public URL when building the frontend image on EC2.
