# Railway environment files (committed defaults)

Non-secret configuration for Railway lives here. On deploy, the API and web Docker images load these files automatically so you do not need to duplicate URLs and flags in the Railway dashboard.

**Secrets** (passwords, client secrets, session keys) are **not** committed. Set them once per service using `secrets.env.example` as a checklist, or paste that file into Railway’s **Raw Editor**.

## Layout

| Environment     | API            | Web build             | Keycloak URIs + realm import                       |
| --------------- | -------------- | --------------------- | -------------------------------------------------- |
| **development** | `development/` | `development/web.env` | `KEYCLOAK_CLIENT.md` + `realm-export.json`         |
| **preprod**     | `preprod/`     | `preprod/web.env`     | `KEYCLOAK_CLIENT.md` + `realm-export.preprod.json` |
| **production**  | `production/`  | `production/web.env`  | `KEYCLOAK_CLIENT.md` + `realm-export.prod.json`    |

Each folder: `api.env`, `web.env`, `secrets.env.example`, `keycloak.env`.

## One-time Railway setup

1. **API** service → Variables → Raw Editor → paste contents of `development/secrets.env.example` and fill `CHANGE_ME` values.
2. Add reference: `DATABASE_URL=${{Postgres-dev.DATABASE_URL}}` (service name must match your Postgres plugin).
3. **Web** service — no runtime vars required if you deploy from this repo (build uses `development/web.env`). Optionally set secrets if you add any later.
4. **Keycloak** service → paste `development/keycloak.env` + secrets from `secrets.env.example` in Raw Editor.
5. Clear any dashboard **`PORT`** override on API (let Railway inject `PORT`).
6. Push to git → redeploy all services.

## Changing URLs

Edit `development/*.env` in this repo, push, and redeploy. Dashboard variables with the same name still win over these files.

## Preprod / production

Set on each Railway service (or name the Railway environment `preprod` / `prod`):

```env
RAILWAY_DEPLOY_ENV=preprod
```

Web Docker build: Railway variable or build arg `RAILWAY_DEPLOY_ENV=preprod` or `production`.

See `deploy/keycloak/README.md` for realm imports and redirect URI lists.

## Disable file loading (local Docker)

```env
SKIP_RAILWAY_ENV_FILE=1
```
