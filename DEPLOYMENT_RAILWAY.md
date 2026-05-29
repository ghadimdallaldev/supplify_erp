# Deploying Supplify on Railway

**Multi-environment guide (dev / preprod / prod):** [DEPLOYMENT_RAILWAY_ENVIRONMENTS.md](DEPLOYMENT_RAILWAY_ENVIRONMENTS.md)  
**Variable reference:** [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) · [`.env.matrix.md`](.env.matrix.md)

This page is a quick single-service overview. **AWS CDK and GitHub Actions CI were removed**; use Railway for deploys.

## Architecture overview

| Service      | Source         | Notes                                     |
| ------------ | -------------- | ----------------------------------------- |
| **API**      | `apps/api`     | Node.js, `GET /health`, port from `PORT`  |
| **Web**      | `apps/web`     | Static Vite build (nginx Dockerfile)      |
| **Postgres** | Railway plugin | Set `DATABASE_URL` on the API service     |
| **Keycloak** | Optional       | External or self-hosted; set `KEYCLOAK_*` |
| **Storage**  | Optional       | `STORAGE_DRIVER=local` (MVP) or `s3` (R2) |

## 1. Create Railway project

1. Create a new Railway project.
2. Add a **PostgreSQL** database. Railway injects `DATABASE_URL` — reference it on the API service.
3. Add a **service** for the API (root directory: repo root, Dockerfile: `apps/api/Dockerfile`, or use `apps/api/railway.json`).
4. Add a **service** for the web (Dockerfile: `apps/web/Dockerfile`, build arg `VITE_API_URL`).

## 2. API service

### Build

- **Dockerfile path:** `apps/api/Dockerfile` (build context: repository root)
- **Start command:** `node apps/api/src/server.js` (default in Dockerfile)

### Health check

- Path: `/health`
- Expect `200` when storage and app are ready (`503` if S3 driver cannot reach bucket)

### Required environment variables

| Variable                  | Example                           | Description                                                    |
| ------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `NODE_ENV`                | `production`                      |                                                                |
| `PORT`                    | _(Railway sets this)_             | API listen port                                                |
| `DATABASE_URL`            | _(from Postgres plugin)_          | Railway Postgres connection string                             |
| `DATABASE_SSL`            | `true`                            | Required for Railway Postgres                                  |
| `WEB_ORIGIN`              | `https://your-web.up.railway.app` | Primary frontend URL                                           |
| `WEB_ORIGINS`             | same as above                     | Comma-separated CORS origins                                   |
| `SESSION_SECRET`          | _(32+ random hex)_                | `openssl rand -hex 32`                                         |
| `KEYCLOAK_BASE_URL`       | `https://keycloak.example.com`    | Server-to-server Keycloak URL                                  |
| `KEYCLOAK_PUBLIC_URL`     | same or public URL                | Browser OIDC redirects                                         |
| `KEYCLOAK_REALM`          | `Supplify`                        |                                                                |
| `KEYCLOAK_CLIENT_ID`      | `supplify-api`                    |                                                                |
| `KEYCLOAK_CLIENT_SECRET`  | _(strong secret)_                 |                                                                |
| `KEYCLOAK_ADMIN`          | `admin`                           | For invite user provisioning                                   |
| `KEYCLOAK_ADMIN_PASSWORD` | _(strong)_                        |                                                                |
| `STORAGE_DRIVER`          | `local`                           | `local` or `s3`                                                |
| `STORAGE_LOCAL_PATH`      | `uploads`                         | Local disk root (ephemeral on Railway unless you add a volume) |
| `STORAGE_PUBLIC_URL`      | `https://api.example.com/uploads` | Public URL for stored files                                    |
| `API_PUBLIC_URL`          | `https://api.example.com`         | Used for local upload PUT URLs                                 |

### Storage (MVP: local disk)

```env
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=uploads
API_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
STORAGE_PUBLIC_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}/uploads
```

Uploads are served at `/uploads/*`. **Without a Railway volume, files are lost on redeploy** — use `STORAGE_DRIVER=s3` with Cloudflare R2 or another S3-compatible endpoint for production media.

### Storage (S3-compatible, e.g. Cloudflare R2)

```env
STORAGE_DRIVER=s3
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://pub-<bucket>.r2.dev
STORAGE_BUCKET=supplify
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_REGION=auto
STORAGE_PUBLIC_READ=true
```

### Migrations

Run once after deploy (Railway one-off command or local with production `DATABASE_URL`):

```bash
pnpm db:migrate
```

## 3. Web service

### Build args (Docker)

| Build arg             | Value                             |
| --------------------- | --------------------------------- |
| `VITE_API_URL`        | `https://your-api.up.railway.app` |
| `VITE_KEYCLOAK_URL`   | Public Keycloak URL               |
| `VITE_KEYCLOAK_REALM` | `Supplify`                        |

### Runtime

The web image serves static files with nginx (`apps/web/Dockerfile`). No runtime env vars are required if build args are set correctly.

See `apps/web/.env.railway.example` for local Vite development.

## 4. Keycloak (optional)

Keycloak is **not** bundled in the Railway templates. Options:

- Run Keycloak on a separate Railway service or VM using `deploy/keycloak/realm-export.json`
- Use a managed IdP and map claims to Supplify roles

Set `KEYCLOAK_*` on the API to match your deployment.

## 5. Connect frontend to API

On the web Railway service, set build-time:

```text
VITE_API_URL=https://<api-service>.up.railway.app
```

Redeploy the web service after changing API URL.

## 6. Local development (unchanged)

```bash
pnpm setup
pnpm dev
```

Docker Compose still runs Postgres, Redis, MinIO, and Keycloak for full local stack. MinIO uses `STORAGE_DRIVER=s3` via `.env.docker-sync`.

## 7. What was removed

- `infra/` AWS CDK stacks (ECS, CloudFront, RDS CDK, IAM deploy roles)
- `.github/workflows/ci.yml` (GitHub Actions unit-test workflow)
- Root `package.json` `cdk:*` scripts
- `deploy/scripts/backup-now.sh` AWS CLI `s3 cp` upload (use `BACKUP_REMOTE_URL` note or your own backup)

Run tests locally before deploy:

```bash
pnpm test:ci
pnpm build
```

## Example env files

- API: `apps/api/.env.railway.example`
- Web: `apps/web/.env.railway.example`
