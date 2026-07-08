# Supplify Performance Audit — July 2026

**Date:** 2026-07-08  
**Environment:** Railway preprod (`api-preprod.supplifyerp.com`) for health/public probes; authenticated latency harness blocked (no staging Keycloak credentials in CI)  
**Scope:** Web (`apps/web`), API (`apps/api`), Postgres migrations, deployment configs  
**Baseline:** [PERFORMANCE_CURRENT_STATE.md](./PERFORMANCE_CURRENT_STATE.md), June 2026 optimization work preserved

---

## Executive summary

Supplify's performance foundation remains strong: lazy routes, vendor chunking, Redis-backed auth caches, 75+ index migrations, request timing middleware, and polling guardrails are intact. This audit found **no catastrophic regressions** in architecture, but identified **targeted gaps** from recent feature growth:

1. **Unbounded restaurant inventory list** — fixed with pagination caps (default 100, max 500).
2. **Orders list defaulting to embedded line items** — fixed (`includeItems` default `false`; Orders page still requests items explicitly).
3. **Dashboard loading 200 orders with line items** — fixed (`includeItems: false`).
4. **Aggressive frontend polling** — tuned (consumer orders 5s→15s, sidebar disputes 30s→60s).
5. **Product catalog images** — lazy-loaded with dimensions.
6. **Dead frontend dependencies** — removed (`framer-motion`, `papaparse`).
7. **Invoice list sort/index mismatch** — migration `0188` adds `issue_date` indexes.

**Build:** `pnpm build` succeeds (API + web).  
**Core functionality:** No business logic intentionally changed; only bounds, defaults, polling intervals, and safe indexes.

---

## Measurement results

### Preprod infrastructure (`GET /health`)

| Check                                                            | Result                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| API reachable                                                    | Yes — `{"status":"ok","service":"supplify-api","env":"preprod"}`                                           |
| Health latency (5 samples)                                       | p50 ~247ms, p95 ~255ms (includes Railway network RTT)                                                      |
| Redis/pool in health                                             | Not exposed on preprod (`MEMORY_HEALTH_EXPOSE` off) — verify via Railway dashboard                         |
| Config ([preprod/api.env](../../deploy/railway/preprod/api.env)) | `DATABASE_POOL_MAX=20`, `DB_KEEPALIVE_ENABLED=true`, `SLOW_REQUEST_MS=800`, `RUN_MIGRATIONS_ON_START=true` |
| Redis                                                            | Required in Railway secrets (`deploy/railway/staging/secrets.env.example`) — not in committed env          |

### API latency harness (`scripts/perf-audit-api.mjs`)

Authenticated endpoints **could not be measured** on preprod without `SUPPLIFY_*_TOKEN` or valid Keycloak password-grant credentials. Public endpoints measured:

| Endpoint  | p50   | p95   | Budget | Over |
| --------- | ----- | ----- | ------ | ---- |
| `/health` | 247ms | 255ms | 500ms  | No   |
| `/ready`  | 232ms | 272ms | 500ms  | No   |

**Action:** Run `pnpm perf:api` with tokens against preprod for full matrix. See [perf-audit-api-results.md](./perf-audit-api-results.md).

### Frontend bundle (production build)

| Chunk           | Raw    | Gzip   | Notes                         |
| --------------- | ------ | ------ | ----------------------------- |
| `index` (entry) | 423 KB | 106 KB | Main app shell                |
| `vendor`        | 416 KB | 136 KB | Shared utilities              |
| `charts`        | 321 KB | 82 KB  | Lazy — dashboard/reports only |
| `calendar`      | 268 KB | 78 KB  | Lazy — dashboard calendar     |
| `react-vendor`  | 143 KB | 46 KB  | Stable shared                 |
| `ui-vendor`     | 135 KB | 30 KB  | Radix + lucide                |
| `router-vendor` | 64 KB  | 22 KB  |                               |
| `redux-vendor`  | 58 KB  | 20 KB  |                               |
| `query-vendor`  | 38 KB  | 11 KB  | TanStack Query                |

**Removed from graph:** `framer-motion` / `motion` chunk (unused dependency).  
**Analyze:** `pnpm --filter @supplify/web analyze` (requires `rollup-plugin-visualizer` install).

### Lighthouse (preprod web)

Not run in this pass (no browser automation credentials for authenticated routes). Recommend manual Lighthouse on `app-preprod.supplifyerp.com` for `/login`, `/app/dashboard`, `/app/orders`.

### EXPLAIN ANALYZE

Local Postgres credentials unavailable in this environment. Script added: `pnpm perf:explain` with `DATABASE_URL`. Static analysis confirms invoice list sorts on `issue_date` while prior indexes used `invoice_date`.

---

## Findings table

| Route / page / endpoint          | Issue                                         | Severity   | Cause                         | Recommended fix                             | Implemented  | Files changed                                                              | Expected improvement                             |
| -------------------------------- | --------------------------------------------- | ---------- | ----------------------------- | ------------------------------------------- | ------------ | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/restaurant-inventory`  | Unbounded full-table fetch + usage CTE        | **High**   | No LIMIT on main list         | Paginate default 100, max 500 + total count | **Yes**      | `restaurant-inventory.routes.js`, `restaurantInventory.ts`, inventory tabs | Bounded DB/memory; faster large tenants          |
| `GET /api/orders` default        | `includeItems=true` doubled DB work           | **Medium** | Legacy default                | Default `false`; explicit opt-in            | **Yes**      | `orders.helpers.js`                                                        | ~50% less payload/DB on list views without items |
| `/app/dashboard`                 | 200 orders with line items on load            | **High**   | Missing `includeItems: false` | Pass `includeItems: false`                  | **Yes**      | `DashboardPage.tsx`                                                        | Smaller dashboard orders response                |
| `/app/products` table            | 50 images without lazy load                   | **Medium** | Missing `loading="lazy"`      | Lazy + dimensions                           | **Yes**      | `ProductCatalogRow.tsx`                                                    | Faster paint, less bandwidth                     |
| `ConsumerOrdersPage`             | 5s polling                                    | **Medium** | Kitchen board freshness       | 15s + unfocus skip (already had)            | **Yes**      | `ConsumerOrdersPage.tsx`                                                   | −67% poll requests                               |
| `Sidebar` disputes badges        | 2×30s polls on every page                     | **Medium** | Badge freshness               | 60s interval                                | **Yes**      | `Sidebar.tsx`                                                              | −50% dispute poll load                           |
| `framer-motion`, `papaparse`     | Dead dependencies                             | **Low**    | Never imported                | Remove packages                             | **Yes**      | `package.json`, `vite.config.ts`, `vite-env.d.ts`                          | Smaller install graph                            |
| Invoice list supplier/restaurant | Sort on `issue_date`, index on `invoice_date` | **Medium** | Schema/index mismatch         | Add `issue_date` indexes                    | **Yes**      | `0188_perf_audit_indexes.sql`                                              | Faster invoice list sorts                        |
| Preprod API auth benchmark       | No p95 for hot endpoints                      | **Medium** | Missing tokens                | Document + `perf:api` script                | **Partial**  | `scripts/perf-audit-api.mjs`                                               | Repeatable regression checks                     |
| Dashboard widget fan-out         | 10 parallel RTK queries                       | **Medium** | Per-widget endpoints          | Defer via entitlements (already partial)    | **Deferred** | —                                                                          | Future: consolidated dashboard API               |
| Fulfillment dispatch             | 4× heavy SQL buckets                          | **Medium** | Board design                  | Monitor p95 on preprod                      | **Deferred** | —                                                                          | OK if <1.5s warm                                 |
| Supplier order list              | DISTINCT + join path                          | **Medium** | No supplier_id on order       | Query rewrite / index review                | **Deferred** | —                                                                          | Needs EXPLAIN on prod data                       |
| Table virtualization             | 50–100 DOM rows                               | **Low**    | Paginated server-side         | react-window if needed                      | **Deferred** | —                                                                          | Only if tenants exceed caps routinely            |
| Bundle size CI                   | No budget guardrails                          | **Medium** | No visualizer in CI           | `pnpm analyze` + thresholds                 | **Partial**  | `vite.config.ts`, `package.json`                                           | Catch chunk regressions                          |
| Lighthouse / RUM                 | No automated scores                           | **Low**    | Not in CI                     | Add Lighthouse CI or web-vitals             | **Deferred** | —                                                                          | Production monitoring                            |

---

## Top 10 performance risks (validated)

| #   | Risk                                      | Severity       | Status                                           |
| --- | ----------------------------------------- | -------------- | ------------------------------------------------ |
| 1   | Unbounded restaurant inventory API        | High           | **Fixed**                                        |
| 2   | Dashboard orders with embedded line items | High           | **Fixed**                                        |
| 3   | Redis missing on any API replica          | Critical (ops) | **Verify in Railway** — not testable from repo   |
| 4   | Dashboard 10+ parallel API calls          | Medium         | **Deferred** — entitlements already gate several |
| 5   | Orders list default includeItems          | Medium         | **Fixed**                                        |
| 6   | Consumer orders 5s polling                | Medium         | **Fixed** (15s)                                  |
| 7   | Sidebar disputes always-on polling        | Medium         | **Fixed** (60s)                                  |
| 8   | Invoice list index/sort mismatch          | Medium         | **Fixed** (migration)                            |
| 9   | No bundle size CI guardrails              | Medium         | **Partial** (analyze script)                     |
| 10  | Supplier order DISTINCT join path         | Medium         | **Deferred** — needs EXPLAIN                     |

---

## Fixes implemented in this audit

| Fix                                                  | Files                                                                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restaurant inventory pagination (limit/offset/total) | `apps/api/src/routes/restaurant-inventory.routes.js`, `apps/web/src/services/api/endpoints/restaurantInventory.ts`, `InventoryTab.tsx`, `TotalsTab.tsx`, `WasteTab.tsx` |
| Orders `includeItems` default false                  | `apps/api/src/routes/orders/orders.helpers.js`                                                                                                                          |
| Dashboard orders slim payload                        | `apps/web/src/pages/DashboardPage.tsx`                                                                                                                                  |
| Product image lazy loading                           | `apps/web/src/components/products/ProductCatalogRow.tsx`                                                                                                                |
| Consumer orders poll 15s                             | `apps/web/src/pages/consumer/ConsumerOrdersPage.tsx`                                                                                                                    |
| Sidebar disputes poll 60s                            | `apps/web/src/components/Sidebar.tsx`                                                                                                                                   |
| Remove unused deps                                   | `apps/web/package.json`, `vite.config.ts`, `vite-env.d.ts`                                                                                                              |
| Bundle analyze mode                                  | `apps/web/vite.config.ts`, `apps/web/package.json`                                                                                                                      |
| API perf harness                                     | `scripts/perf-audit-api.mjs`, `package.json` (`perf:api`)                                                                                                               |
| EXPLAIN harness                                      | `scripts/perf-explain-queries.mjs`, `package.json` (`perf:explain`)                                                                                                     |
| Invoice issue_date indexes                           | `apps/api/db/migrations/0188_perf_audit_indexes.sql`                                                                                                                    |

---

## Future improvements (not implemented)

1. **Consolidated dashboard API** — single endpoint for KPIs + widgets to cut 10 HTTP round-trips.
2. **Server-side restaurant inventory filters** — search/category filters in SQL when tenants exceed 500 SKUs.
3. **Table virtualization** — `ProductsPage` / `OrdersPage` if row counts grow beyond pagination.
4. **Supplier order list rewrite** — reduce DISTINCT + multi-join supplier path.
5. **Fulfillment dispatch optimization** — if preprod p95 exceeds 1.5s under load.
6. **Lighthouse CI + web-vitals** — automated frontend regression detection.
7. **Authenticated preprod benchmark** — wire `SUPPLIFY_*_TOKEN` into CI or scheduled job.
8. **Dedicated worker tier** for crons — reduce API CPU contention at scale.

---

## Database indexes / migrations added

**Migration:** [`0188_perf_audit_indexes.sql`](../../apps/api/db/migrations/0188_perf_audit_indexes.sql)

```sql
CREATE INDEX IF NOT EXISTS idx_invoice_supplier_issue_date
  ON invoice (supplier_id, issue_date DESC, invoice_number DESC)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_restaurant_issue_date
  ON invoice (restaurant_id, issue_date DESC, invoice_number DESC)
  WHERE restaurant_id IS NOT NULL;
```

**Rationale:** Invoice list routes order by `issue_date DESC, invoice_number DESC`; existing indexes targeted `invoice_date`.

---

## API routes still potentially slow (and why)

| Route                               | Why it may be slow                                    | Mitigation in place                           |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `GET /api/fulfillment/dispatch`     | 4 parallel heavy bucket queries (up to 500 rows each) | Indexes 0127–0141; needs warm pool + Redis    |
| `POST /api/orders` (multi-supplier) | O(suppliers) subscription/feature checks before TX    | Indexes 0142; parallel checks                 |
| `GET /api/admin-dashboard/overview` | ~17 metrics on cache miss                             | Redis cache + singleflight                    |
| `GET /auth/me`                      | Permission bundle on cache miss                       | `tctx` / `user:sub` caches 120–300s           |
| `GET /api/products?inStock=true`    | DISTINCT count + inventory join                       | Keyset pagination available                   |
| `GET /api/restaurant-inventory`     | Usage CTE over 30-day movements                       | Now capped at 500 rows; CTE still per-request |

---

## Frontend pages needing deeper redesign (if scale grows)

| Page                     | Concern                              | When to act                               |
| ------------------------ | ------------------------------------ | ----------------------------------------- |
| **Dashboard**            | 10+ parallel queries                 | p95 > 1.5s or mobile complaints           |
| **Products**             | 50 rows × images in table            | Add virtualization if page size increases |
| **Restaurant inventory** | Client-side filter on up to 500 rows | Server-side search if >500 SKUs           |
| **Admin dashboard tabs** | Large tenant payloads                | API-side field projection                 |
| **Fulfillment**          | Maps + dispatch board + polls        | Already lazy maps; monitor poll overlap   |

---

## Verification

| Check                                 | Result                                                   |
| ------------------------------------- | -------------------------------------------------------- |
| `pnpm build`                          | **Pass**                                                 |
| `orders.routes.test.js`               | **Pass**                                                 |
| `restaurant-inventory.routes.test.js` | **Pass**                                                 |
| `request-timing.test.js`              | **Pass** (included in suite)                             |
| Pre-existing API test failures        | 3 unrelated (`tenant-roles`, `register-cron-jobs` count) |
| Pre-existing web test failures        | 10 unrelated (i18n parity, inventory UI mocks, etc.)     |
| Core functionality changed            | **No** — bounds, defaults, polling, indexes only         |

---

## How to re-run this audit

```bash
# Full build
pnpm build

# API latency (set tokens or Keycloak env first)
API_URL=https://api-preprod.supplifyerp.com \
KEYCLOAK_URL=https://keycloak-preprod.supplifyerp.com \
KEYCLOAK_REALM=supplify-preprod \
pnpm perf:api

# Bundle analysis
pnpm --filter @supplify/web analyze

# EXPLAIN (local or staging DATABASE_URL)
DATABASE_URL=postgresql://... pnpm perf:explain
```

---

## Polling matrix (after fixes)

| Component                | Interval          | Stops when              |
| ------------------------ | ----------------- | ----------------------- |
| `OrdersPage`             | 60s               | Unfocused               |
| `ConsumerOrdersPage`     | **15s** (was 5s)  | Unfocused               |
| `Sidebar` disputes       | **60s** (was 30s) | Unfocused / feature off |
| `FulfillmentTrackingTab` | 30s               | Unfocused               |
| Delivery tracking panels | 15–30s            | Terminal / inactive     |
| Notifications badge      | 60s / socket      | Socket connected        |
