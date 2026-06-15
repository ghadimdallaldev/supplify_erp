# Supplify (Pre-production branch)

**Restaurant & F&B supplier marketplace** — B2B ordering between restaurants and suppliers, plus front-of-house (reservations, staff), fulfillment & GPS tracking, finance, subscriptions, and a platform admin console. Optional **B2C consumer ordering** and **public supplier mini-stores**.

| Package    | Stack                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| `apps/web` | React 18 · Vite · TypeScript · Tailwind · shadcn/ui · RTK Query · Socket.IO client |
| `apps/api` | Node.js · Express (ESM) · PostgreSQL · Redis · Keycloak OIDC · MinIO/S3 · Vitest   |

**~169 SQL migrations** in `apps/api/db/migrations/` · **200+ API tests** · **20+ web tests** · Primary hosting: **Railway** (dev / preprod / prod).

---

## Platform at a glance

### Restaurant tenants

Catalog browse · cart & orders · quick lists & scheduled reorders · supplier discovery & deals · chat · receiving · inventory & expiry · waste tracking · invoices · disputes · reports · reservations (FOH cockpit) · staff roster & portal · multi-branch org · contract pricing · order GPS tracking · Web Push · tenant roles (RBAC).

### Supplier tenants

Product catalog CRUD · **Bulk Upload** (CSV) · **Import Product Images** (ZIP async job) · inventory & warehouses · multi-warehouse fulfillment · driver dispatch & live GPS · command center KPIs · receivables · promotions & paid boosts · quote inbox (RFQ) · **customer growth** (import / referral / sponsorship) · invoices · chat · branches · custom branding (Gold+).

### Platform admin

Tenant management · plans & usage limits · global/per-tenant **feature toggles** · deal approvals · growth program settings · **impersonation** (full tenant workspace) · billing unlock / extend Free Trial · platform health.

### Public & consumer

Guest **reservation booking** (`/reserve`) · **staff self-service** portal (`/staff/login`) · **supplier mini-store** (`/supplier/:slug`) · **consumer B2C ordering** (storefront hours, guest checkout) · quote request flows.

### Mobile

**Web-first cockpit** for catalog admin, RFQ, growth CRM, and bulk image import. Separate mobile app targets operational ordering/fulfillment; see [docs/mobile/MOBILE_FEATURE_PARITY.md](docs/mobile/MOBILE_FEATURE_PARITY.md). Web app is a **PWA** (Web Push via VAPID).

Full route map & smoke tests: [docs/product/features.md](docs/product/features.md) · capability indexes: [restaurant](docs/product/restaurant-capabilities.md) · [supplier](docs/product/supplier-capabilities.md).

---

## Prerequisites

- **Node.js 18+** · **pnpm 8+** (or run `pnpm setup` to bootstrap via corepack)
- **Docker & Docker Compose** (Postgres, Redis, MinIO, Keycloak — and optional full stack)

---

## Quick start

### Native dev (recommended for coding)

Infra in Docker; API + web on the host with hot reload (no image rebuild on save):

```cmd
pnpm setup
pnpm dev
```

| Service        | URL                                             |
| -------------- | ----------------------------------------------- |
| Web (Vite)     | http://localhost:5173                           |
| API            | http://localhost:4000                           |
| Health         | http://localhost:4000/health                    |
| Keycloak       | http://localhost:8180 (realm **Supplify**)      |
| Keycloak admin | http://localhost:8180/admin (`admin` / `admin`) |

`pnpm dev` syncs API env from `docker/.env`, runs migrations, then starts API (`node --watch`) + web (HMR). Infra only: `pnpm local:infra`.

### Full Docker stack

nginx fronts API + web + all infra:

```cmd
pnpm local:up
pnpm local:seed
```

App: **http://localhost** · `pnpm local:status` · `pnpm local:logs` · `pnpm local:down`

Windows wrappers: `scripts\run-local.cmd up|seed|down|dev`

### Demo accounts

After `pnpm seed:demo-users` (or `local:seed`):

| Role           | Email                     |
| -------------- | ------------------------- |
| Restaurant     | `restaurant@supplify.com` |
| Supplier       | `supplier@supplify.com`   |
| Platform admin | `admin@supplify.com`      |

Passwords: `apps/api/scripts/seed-demo-users.js`

**Richer dataset:** [docs/guides/seed-prodlike.md](docs/guides/seed-prodlike.md) (`seed:prodlike`, `seed:accounts`, `seed:full`).

New tenant flow: `/register/complete` → `/app/activate` — [tenant-registration.md](docs/features/tenant-registration.md).

---

## Repository layout

```text
apps/
  api/          Express API, services, migrations, cron jobs, Socket.IO
  web/          React SPA, pages, RTK Query, PWA service worker
docs/           All product, ops, QA, and feature specs (dev branch only)
deploy/         Docker compose, EC2 scripts, Railway env templates
docker/         Local compose overrides, .env for infra
scripts/        dev-native.mjs, run-local.mjs, promote-release.mjs, …
tests/          Playwright E2E, shared test data
```

---

## Architecture

| Layer        | Details                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| Auth         | Keycloak OIDC — `/auth/login` → callback → HTTP-only session cookies                 |
| Tenancy      | Restaurant / supplier / admin roles; branch orgs; `resolveTenantContext`             |
| RBAC         | Custom tenant roles + system permissions (`CATALOG_EDIT`, `FULFILLMENT_*`, …)        |
| Plans        | Subscription tiers gate features via `requireFeature()` + admin overrides            |
| Realtime     | Socket.IO (Redis adapter when `REDIS_URL` set) — chat, notifications                 |
| Storage      | Presigned uploads to MinIO/S3; bulk ZIP via `PUT /api/files/upload-import/:token`    |
| Background   | **16 in-process cron jobs** (advisory locks) + async workers (e.g. image import job) |
| Billing lock | Locked tenants get **402** on writes; read-only Free Trial expiry mode               |

Deep dive: [docs/guides/developer-handbook.md](docs/guides/developer-handbook.md) · cron: [docs/operations/cron-jobs.md](docs/operations/cron-jobs.md).

---

## Notable features (2025–2026)

| Area          | Highlights                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------- |
| Fulfillment   | Driver roster, dispatch board, POD, live GPS (supplier + restaurant tracking)               |
| Supplier ops  | Command center, CSV catalog import, receivables aging, reorder intelligence                 |
| Catalog media | Bulk product image import (ZIP by SKU / mapping CSV / CSV `image_url`) — migration **0168** |
| Growth        | Supplier customer import, referral links, sponsorship — migration **0169**                  |
| Commerce      | Deals & boosts (admin approval), quote requests (RFQ), public mini-store                    |
| Intelligence  | Smart reorder, reorder forecasts, AI platform usage metering — migration **0167**           |
| Consumer      | B2C guest ordering, storefront hours — migrations **0163–0165**                             |
| Admin         | Impersonation, feature flags, limit overrides, extend Free Trial (default **30** days)      |
| Compliance    | Legal pack re-acceptance gates, tenant audit log                                            |

Spec index: [docs/features/README.md](docs/features/README.md) · master catalog: [docs/product/feature-catalog-full.md](docs/product/feature-catalog-full.md).

---

## Documentation

**Hub:** [docs/README.md](docs/README.md) (full index — docs live on **`dev`** only; release branches are runtime-only).

| Topic                          | Document                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Feature catalog & verification | [docs/product/features.md](docs/product/features.md)                                                              |
| Plans, tiers & limits          | [docs/product/plans-and-limits.md](docs/product/plans-and-limits.md)                                              |
| Bulk product image import      | [docs/features/bulk-product-image-import.md](docs/features/bulk-product-image-import.md)                          |
| Supplier customer growth       | [docs/features/supplier-customer-growth.md](docs/features/supplier-customer-growth.md)                            |
| Supplier ops API               | [docs/features/supplier-ops.md](docs/features/supplier-ops.md)                                                    |
| GPS & drivers                  | [docs/features/drivers-and-gps-tracking.md](docs/features/drivers-and-gps-tracking.md)                            |
| Quote requests & mini-store    | [docs/product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md](docs/product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md)    |
| Developer handbook             | [docs/guides/developer-handbook.md](docs/guides/developer-handbook.md)                                            |
| Database migrations            | [docs/guides/database-migrations.md](docs/guides/database-migrations.md)                                          |
| Testing & regression           | [docs/qa/testing-guide.md](docs/qa/testing-guide.md) · [regression-checklist.md](docs/qa/regression-checklist.md) |
| API route index                | [docs/api/README.md](docs/api/README.md)                                                                          |
| RBAC & security                | [docs/security/rbac.md](docs/security/rbac.md)                                                                    |
| Env variables                  | [docs/operations/environment-variables.md](docs/operations/environment-variables.md)                              |
| Storage & uploads              | [docs/operations/storage-uploads.md](docs/operations/storage-uploads.md)                                          |
| Railway deploy                 | [docs/operations/railway-environments.md](docs/operations/railway-environments.md)                                |
| Docker / EC2 deploy            | [deploy/README.md](deploy/README.md)                                                                              |
| Admin console & flags          | [docs/admin/admin-operations-console.md](docs/admin/admin-operations-console.md)                                  |
| Mobile parity                  | [docs/mobile/MOBILE_FEATURE_PARITY.md](docs/mobile/MOBILE_FEATURE_PARITY.md)                                      |

---

## Scripts

### Daily development

```bash
pnpm dev              # native API + web (migrates on start)
pnpm local:infra      # Docker infra only (Postgres, Redis, MinIO, Keycloak)
pnpm build            # production build
pnpm typecheck        # web TypeScript
pnpm lint             # ESLint (API + web)
pnpm lint:fix         # auto-fix
pnpm format           # Prettier
```

### Testing & QA

```bash
pnpm test:api         # API unit tests (vitest run — use before PR)
pnpm test:web         # web unit tests
pnpm test:ci          # both (alias: test:all)
pnpm test:rbac        # RBAC-focused API + web tests
pnpm qa               # lint + typecheck + test:ci + tier matrix + build
pnpm e2e:playwright   # Playwright E2E (optional)
pnpm verify:tier-matrix
```

Use `pnpm test:api:watch` while developing; **`pnpm test` runs in watch mode** — use `pnpm test:api` for CI-style runs. Mock patterns: [docs/API_TEST_SUITE_STABILIZATION.md](docs/API_TEST_SUITE_STABILIZATION.md).

### Database & seeds

```bash
pnpm db:migrate       # apply all SQL migrations
pnpm db:seed          # reference seed data
pnpm db:reset         # drop + migrate + seed
pnpm seed:demo-users  # Keycloak demo accounts
pnpm seed:prodlike    # rich dev dataset (see seed-prodlike guide)
pnpm seed:full        # comprehensive seed bundle
pnpm db:sync-roles    # sync system role permissions
pnpm storage:ensure-buckets
pnpm openapi:gen      # regenerate web API client types
```

### Docker / local stack

```bash
pnpm local:up         # full stack (nginx + API + web + infra)
pnpm local:seed       # migrate + seed in Docker context
pnpm local:status
pnpm local:logs
pnpm local:down
```

### Release & deploy

```bash
pnpm promote:preprod  # promote dev → preprod branch
pnpm promote:prod     # promote dev → prod branch
pnpm deploy:preprod   # legacy EC2 Docker (see deploy/README.md)
pnpm railway:keycloak:sync
pnpm vapid:generate   # Web Push keys
```

Branch workflow: [docs/operations/branching.md](docs/operations/branching.md).

---

## Before you push (CI)

```bash
pnpm qa
```

Or minimum: `pnpm lint && pnpm test:ci && pnpm build`. Commits use **Conventional Commits** (Husky + commitlint).

Hosted deploys: **Railway** — [docs/operations/railway-environments.md](docs/operations/railway-environments.md). Legacy VM Docker: [deploy/README.md](deploy/README.md).

---

## Branches

| Branch    | Use                                              |
| --------- | ------------------------------------------------ |
| `dev`     | Development — docs, tests, seeds, all migrations |
| `preprod` | Pre-production deploy (pruned tree, no `docs/`)  |
| `prod`    | Production deploy (pruned tree)                  |

Promote: `pnpm promote:preprod` · `pnpm promote:prod`

---

## Environment variables

Copy templates: `apps/api/.env.dev.example` → `apps/api/.env` (and matching `apps/web/.env.*.example`). Local infra credentials: `docker/.env`. Native dev auto-syncs `apps/api/.env.docker-sync`.

| Key                                               | Purpose                                             |
| ------------------------------------------------- | --------------------------------------------------- |
| `POSTGRES_*` / `DATABASE_URL`                     | PostgreSQL                                          |
| `REDIS_URL`                                       | Permissions cache, feature flags, Socket.IO adapter |
| `WEB_ORIGIN` / `WEB_ORIGINS`                      | CORS allowed origins                                |
| `SESSION_SECRET`                                  | Express session signing                             |
| `KEYCLOAK_*`                                      | OIDC realm, client, admin API                       |
| `STORAGE_*` / `S3_*`                              | Object storage (`local` or S3-compatible)           |
| `IMPORT_ZIP_MAX_BYTES` / `IMPORT_IMAGE_MAX_BYTES` | Bulk catalog image import limits                    |
| `GPS_TRACKING_ENABLED`                            | Driver/restaurant delivery GPS                      |
| `VITE_GOOGLE_MAPS_API_KEY`                        | Map embeds (web)                                    |
| `VAPID_*`                                         | Web Push (PWA)                                      |
| `SMTP_*` / `EMAIL_*`                              | Transactional email (Mailpit local, Resend prod)    |
| `CRONS_ENABLED`                                   | In-process scheduled jobs (default `true`)          |
| `PAYMENTS_MODE`                                   | `mock` / `test` / `live`                            |
| `E2E_SECRET`                                      | Enables `/api/e2e` test helpers                     |

Full list with defaults: `apps/api/src/config/env.js` · matrix: [docs/operations/env-matrix.md](docs/operations/env-matrix.md).

---

## API conventions

- Base: `http://localhost:4000` (dev)
- Envelope: `{ ok, data, error, requestId }`
- Auth: session cookie after Keycloak login (`/auth/*`)
- Gates: RBAC permissions + subscription `requireFeature()` + plan usage meters
- Route groups: [docs/api/README.md](docs/api/README.md)

---

## License

MIT
