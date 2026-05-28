# Supplify (Production branch)

Deploy-only branch. **Do not develop here** — merge from `dev`, then run:

```bash
pnpm install
pnpm dev          # native API + web (infra via Docker)
pnpm build        # production build (web TypeScript + Vite)
pnpm test:ci      # unit tests
pnpm db:migrate   # SQL migrations
```

## Environment variables (keys only)

Copy `apps/api/.env.example` to `apps/api/.env` for app secrets (Twilio, VAPID, etc.). **Local Postgres/Redis/Keycloak** credentials and ports live in `docker/.env` (created from `docker/.env.example` on first `pnpm local:infra` or `pnpm dev`). Native dev syncs `apps/api/.env.docker-sync` automatically — do not hand-edit that file.

| Key                                  | Purpose                                  |
| ------------------------------------ | ---------------------------------------- |
| `docker/.env` `POSTGRES_*`           | Local PostgreSQL (source of truth)       |
| `DATABASE_URL` in `apps/api/.env`    | Optional override (remote DB, CI)        |
| `REDIS_URL`                          | Cache (permissions, feature flags)       |
| `WEB_ORIGIN` / `WEB_ORIGINS`         | Allowed browser origins (CORS)           |
| `SESSION_SECRET`                     | Express session signing                  |
| `KEYCLOAK_*`                         | OIDC realm, client, admin API            |
| `S3_*`                               | Object storage for uploads               |
| `VAPID_*`                            | Web Push                                 |
| `TWILIO_*` / `SENDGRID_*` / `SMTP_*` | Messaging                                |
| `E2E_SECRET`                         | Enables `/api/e2e` test helpers when set |

See `apps/api/src/config/env.js` for the full list with defaults.

## API reference

Route groups: **[docs/api/README.md](docs/api/README.md)**

## License

| Environment | Command |
| --- | --- |
| Production | `sudo ./deploy/scripts/deploy-prod.sh` |

Migrations: `pnpm db:migrate`

Branching guide: see `docs/BRANCHING.md` on the `dev` branch.
