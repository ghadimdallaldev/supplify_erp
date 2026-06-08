# Supplify (Pre-production branch)

Deploy-only branch ΓÇö **do not develop here**. On `dev`: `node scripts/promote-release.mjs --tier preprod`, then after UAT `--tier prod` (prod merges **preprod**, not dev).

```bash
node scripts/promote-release.mjs --tier preprod
```

## Deploy (EC2 Docker)

```bash
sudo ./deploy/scripts/deploy-preprod.sh
```

Copy env templates per target: `apps/api/.env.dev.example`, `.env.preprod.example`, `.env.prod.example` (and matching `apps/web/.env.*.example`). For local work, copy `apps/api/.env.dev.example` → `apps/api/.env`. **Local Postgres/Redis/Keycloak** live in `docker/.env`. Native dev syncs `apps/api/.env.docker-sync` automatically.

| Key                               | Purpose                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `docker/.env` `POSTGRES_*`        | Local PostgreSQL (source of truth)                                                                                        |
| `DATABASE_URL` in `apps/api/.env` | Optional override (remote DB, CI)                                                                                         |
| `REDIS_URL`                       | Cache (permissions, feature flags)                                                                                        |
| `WEB_ORIGIN` / `WEB_ORIGINS`      | Allowed browser origins (CORS)                                                                                            |
| `SESSION_SECRET`                  | Express session signing                                                                                                   |
| `KEYCLOAK_*`                      | OIDC realm, client, admin API                                                                                             |
| `STORAGE_*`                       | Object storage (`local` or `s3`-compatible); see [docs/operations/storage-uploads.md](docs/operations/storage-uploads.md) |
| `VAPID_*`                         | Web Push                                                                                                                  |
| `SMTP_*` / `EMAIL_*`              | Transactional email (Mailpit local, Resend SMTP prod)                                                                     |
| `E2E_SECRET`                      | Enables `/api/e2e` test helpers when set                                                                                  |

See `apps/api/src/config/env.js` for the full list with defaults.

## API reference

Route groups: **[docs/api/README.md](docs/api/README.md)**

## License

MIT
