# Supplify ERP — Agent Instructions (Codex / OpenAI Agents / Claude)

## Project

Supplify ERP is a multi-tenant restaurant–supplier marketplace monorepo.
Stack: React/Vite (`apps/web`), Node/Express (`apps/api`), PostgreSQL, Keycloak, Redis, S3.

Full technical context: `docs/onboarding/`, `docs/architecture/`, `docs/guides/setup.md`.

---

## ⛔ MANDATORY — Mobile Parity

**Any change to API behavior, auth, RBAC, types, notifications, or feature flags MUST be propagated to BOTH sibling mobile repos:**

- `C:/myProjects/supplify-mobile` (React Native / Expo — Android)
- `C:/myProjects/supplify-mobile-ios` (React Native / Expo — iOS)

**Do not output "done", "complete", or any task-completion signal until this is satisfied.**

### Triggers (must update both mobile repos)

- New or modified API endpoint → update API client, types
- Auth / session / token change → update auth flow, token storage, guards
- New or changed permission key → update permission guards and navigation
- New or changed feature key → update feature gates
- Order / fulfillment / delivery / GPS change → update affected flows
- Notification event or payload change → update handlers
- New required env var → add to all three `.env.example` files

### Exceptions (mobile skip allowed IF documented)

- Admin-only features
- Web-only UI/layout changes
- Server-side infra changes with no client contract change

When skipping mobile, add a dated entry to `docs/mobile/MOBILE_FEATURE_PARITY.md` explaining why.

---

## ⛔ MANDATORY — Docs Update

**Every substantive change must update relevant docs before the task is complete.**

Priority docs to check:

1. `docs/mobile/MOBILE_FEATURE_PARITY.md` — dated entry always required
2. `docs/features/`, `docs/architecture/`, `docs/operations/` — update if behavior documented there changed
3. `docs/guides/environment-variables.md` — new env vars
4. `docs/admin/feature-flags.md` — new feature keys
5. `docs/architecture/rbac-overview.md` — new permission keys or roles

---

## Completion gate

Before marking any API/auth/feature task done, confirm:

1. Both `C:/myProjects/supplify-mobile` and `C:/myProjects/supplify-mobile-ios` updated (or skip documented)
2. `docs/mobile/MOBILE_FEATURE_PARITY.md` has a dated entry
3. All affected domain docs updated
4. `pnpm typecheck` passes

---

## Key file locations

| What            | Path                                   |
| --------------- | -------------------------------------- |
| Permission keys | `apps/api/src/lib/permission-keys.js`  |
| Feature keys    | `apps/api/src/lib/feature-keys.js`     |
| Role matrix     | `apps/api/src/lib/role-matrix.js`      |
| Web types       | `apps/web/src/types/index.ts`          |
| Android mobile  | `C:/myProjects/supplify-mobile`        |
| iOS mobile      | `C:/myProjects/supplify-mobile-ios`    |
| Parity log      | `docs/mobile/MOBILE_FEATURE_PARITY.md` |

## General rules

- Keycloak port: **8180** (not 8080). PostgreSQL: **5432**.
- Never edit a committed SQL migration. New behavior = new migration file.
- Never push to `main` or `prod` directly.
- `pnpm` only — no npm/yarn in this repo.

## Cursor Cloud specific instructions

Native dev is Docker infrastructure plus the API and Vite on the host.

- Install with `pnpm install --frozen-lockfile` (pnpm 8.15.9 via Corepack). Do not use npm or yarn.
- Docker runs nested. If the daemon is down: `sudo service docker start`, then `sudo chmod 666 /var/run/docker.sock` when the socket is root-only. The daemon uses `fuse-overlayfs` and legacy iptables.
- `minio/minio` and `minio/mc` are no longer on Docker Hub. This environment keeps locally built images tagged `minio/minio:latest` and `minio/mc:latest` (MinIO `RELEASE.2025-10-15T17-29-55Z`). Do not `docker compose pull` those services.
- Keycloak's entrypoint waits on `KEYCLOAK_DB_ADMIN`. Local Postgres creates `supplify`, not Railway's `railway` database. `docker-compose.yml` sets `KEYCLOAK_DB_ADMIN` and `host.docker.internal:host-gateway` so login email OTP can reach the API.
- `pnpm local:infra` starts Postgres, Redis, Mailpit, MinIO, and Keycloak. Then `pnpm db:migrate`. App processes: `node scripts/dev-apps.mjs` (API http://localhost:4000/health, web http://localhost:5173). Vite binds IPv6 localhost; `http://127.0.0.1:5173` can refuse connections.
- Keycloak admin UI: http://localhost:8180 (`admin` / `admin`). Mailpit: http://localhost:8025.
- Demo restaurant sign-in: username `restaurant`, password `SupplifyRestaurant1!` (`restaurant@supplify.com`). The prepared Keycloak realm has the email OTP browser step turned off so sign-in does not wait on Mailpit. After a fresh realm import, OTP is on: the API needs `AUTH_EMAIL_OTP_INTERNAL_SECRET=dev-email-otp-internal-secret` and Mailpit SMTP (`SMTP_HOST=localhost`, `SMTP_PORT=1025`).
- A restaurant user created in Keycloak after migrations has no `user_workspace_membership` row, so `/app/orders` is forbidden until the contact-email insert from `apps/api/db/migrations/0104_user_workspace_membership.sql` runs. The prepared database already links `restaurant@supplify.com` to Golden Fork.
- `CRONS_ENABLED=false` is a reasonable local default when memory is tight. The API still serves traffic.
