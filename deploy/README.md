# Supplify deployment

One-command deploy per environment (run from repo root on the server):

| Environment | Command |
|---|---|
| Dev | `sudo ./deploy/scripts/deploy-dev.sh` |
| Staging | `sudo ./deploy/scripts/deploy-staging.sh` |
| Production | `sudo ./deploy/scripts/deploy-prod.sh` |

Each script bootstraps Docker, creates `deploy/env/.env.<env>`, builds images, starts infra (Postgres, Redis, MinIO, Keycloak), runs migrations + Keycloak realm init, then starts the app behind nginx.

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

## Files

| Path | Purpose |
|---|---|
| `deploy/docker-compose.{dev,staging,prod}.yml` | Full 12-service stack per env |
| `deploy/env/.env.{dev,staging,prod}.example` | Env templates |
| `deploy/scripts/_common.sh` | Bootstrap helpers (Docker, swap, secrets) |
| `deploy/scripts/deploy-*.sh` | One-command deploy |
| `docker-compose.yml` | Local dev stack (repo root) |
