# Supplify Quick Audit

**Date:** 2026-06-15 · **Branch:** `refactoring-dev` · **Scope:** Performance, UI/UX, database, and security across API, web, auth/RBAC, imports/uploads, caching, Railway config, and mobile/PWA.

**Method:** **14 subagents launched in a single parallel wave** — 4 explore + 2 shell (route inventory, Railway env) + 3 shell (test suites) + 4 section-draft agents + 1 validator. Main-agent synthesis only. No app rewrites; findings only.

---

## Executive Summary

Supplify is feature-rich and demo-ready, but **production traffic at scale** will hit concentrated pain in four areas:

1. **Security** — unauthenticated file reads (`GET /api/files/object`), admin RBAC bypass, SSRF in image URL import, JWT audience/issuer gaps, email-only tenant binding
2. **Performance** — row-by-row CSV product import, uncached admin dashboard, OFFSET catalog pagination at 10k SKUs, full inventory table scans
3. **Database** — 0169 growth tables missing cron/integrity indexes; referral registration leaves subscriptions locked; `delivery_zone` polymorphic drift
4. **UI/UX** — catalog pagination gap, customer growth import preview missing, feature undiscoverable in sidebar

**Positives already in place:**

- Gzip compression enabled globally in [`apps/api/src/server.js`](../../apps/api/src/server.js)
- Batch pricing and order-item queries avoid N+1 on hot read paths
- Redis cache with in-memory fallback for RBAC, entitlements, orders calendar
- Image import ZIP path traversal protection (`isSafeZipEntryPath`)
- Growth routes scoped to supplier tenant + permissions
- RBAC test suite: **163/163 pass** (tests do not cover admin permission bypass in middleware)

**Test evidence (parallel shell agents):**

| Suite                                         | Result                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm test:rbac` (15 files, 163 tests)        | **PASS**                                                                                                      |
| Import/growth/image tests (5 files, 22 tests) | **PASS**                                                                                                      |
| Web: `ProductImageImportDialog.test.tsx`      | **PASS** (2/2)                                                                                                |
| Web: `AdminPlatformSettingsPanel.test.tsx`    | **1 FAIL** — validation toast drift (`"Enter a number between 7 and 90 days"` vs `"Failed to save settings"`) |

Redis connection warnings during API tests confirm memory-cache fallback is exercised when `REDIS_URL` is unset.

---

## Top 10 Highest Priority Fixes

| #   | Area        | Location                                                                                                                                                                         | Issue                                                                   | Suggested fix                                                                 |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Security    | [`files.routes.js`](../../apps/api/src/routes/files.routes.js) · `GET /api/files/object`                                                                                         | No authentication; any `uploads/*` key readable                         | Auth + ownership check or signed download tokens                              |
| 2   | Security    | [`rbac.js`](../../apps/api/src/lib/rbac.js) · `requirePermission`                                                                                                                | Any `ADMIN` with `adminContext` bypasses scoped permissions             | Remove blanket bypass (~L987–988, ~L1011–1012)                                |
| 3   | Security    | [`product-image-import.service.js`](../../apps/api/src/services/product-image-import.service.js)                                                                                 | SSRF via `fetch(..., { redirect: 'follow' })`                           | Block redirects; re-validate each hop; block private IPs                      |
| 4   | Performance | [`product-import.service.js`](../../apps/api/src/services/product-import.service.js) · `POST /api/supplier/products/import`                                                      | Row-by-row import (~3–6 queries × N rows); no SKU limit check           | Batch upsert + background job; enforce `checkLimit('supplier_products_skus')` |
| 5   | Performance | [`admin-overview-metrics.js`](../../apps/api/src/lib/admin-overview-metrics.js) · `GET /api/admin-dashboard/overview`                                                            | 17+ parallel uncached aggregates                                        | Redis cache 60–120s or materialized metrics                                   |
| 6   | Performance | [`ProductsPage.tsx`](../../apps/web/src/pages/ProductsPage.tsx) + [`products.routes.js`](../../apps/api/src/routes/products.routes.js)                                           | Web `limit: 100`, no pagination; OFFSET breaks at 10k SKUs              | Keyset pagination + server-side supplier filter                               |
| 7   | Security    | [`auth.js`](../../apps/api/src/lib/auth.js) · `verifyToken`                                                                                                                      | JWT with no `aud`/`azp` accepted; issuer mismatch warn-only             | Hard-fail missing audience and issuer mismatch                                |
| 8   | DB          | [`0169_supplier_growth_program.sql`](../../apps/api/db/migrations/0169_supplier_growth_program.sql) + [`register-account.js`](../../apps/api/src/lib/register-account.js)        | Referral registration leaves subscription locked (`pending_activation`) | Unlock subscription after referral accept                                     |
| 9   | UI          | [`SupplierCustomerGrowthPage.tsx`](../../apps/web/src/pages/SupplierCustomerGrowthPage.tsx) + [`sidebarNavConfig.ts`](../../apps/web/src/components/sidebar/sidebarNavConfig.ts) | Import preview errors hidden; no sidebar nav; no permission gate        | Preview table; nav entry; `RequirePermission`                                 |
| 10  | DB          | Growth tables (0169) + image import (0168)                                                                                                                                       | Missing cron indexes; no unique active-job constraint                   | Migration `0170_schema_hardening_and_integrity.sql`                           |

---

## Performance Findings

| Endpoint / File                                                                                                             | Issue                                                                  | Impact                                     | Suggested fix                                                | Priority |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ | -------- |
| [`product-import.service.js`](../../apps/api/src/services/product-import.service.js) · `POST /api/supplier/products/import` | Per-row SELECT + INSERT loop                                           | 10k SKUs = 30k–60k queries; timeouts       | Temp-table batch upsert; async job                           | **P0**   |
| [`products.routes.js`](../../apps/api/src/routes/products.routes.js) · `GET /api/products/`                                 | OFFSET pagination; `SELECT p.*`; duplicate price fetch for restaurants | Deep pages slow at 10k scale; bloated JSON | Keyset pagination; list DTO; reuse LATERAL price             | **P0**   |
| [`products.routes.js`](../../apps/api/src/routes/products.routes.js) · `includeStock=true`                                  | Full `inventory` GROUP BY on every list                                | Full-table scan per catalog page           | Supplier-scoped stock summary table/view                     | **P0**   |
| [`inventory.routes.js`](../../apps/api/src/routes/inventory.routes.js) · `GET /api/inventory`                               | No pagination                                                          | 10k SKUs returned in one response          | Add limit/cursor (50–100 default)                            | **P0**   |
| [`admin-overview-metrics.js`](../../apps/api/src/lib/admin-overview-metrics.js) · `GET /api/admin-dashboard/overview`       | 17+ parallel aggregates, no cache                                      | Admin dashboard hammers DB                 | Redis snapshot 60–120s                                       | **P0**   |
| [`admin-dashboard/tenants.js`](../../apps/api/src/routes/admin-dashboard/tenants.js)                                        | Correlated subqueries + revenue aggregation per row                    | Slow tenant directory                      | Materialized counts; slim SELECT                             | **P0**   |
| [`entitlements.js`](../../apps/api/src/lib/subscription/entitlements.js) · `GET /api/subscriptions/entitlements`            | Cache miss = 10–12 parallel COUNT queries                              | Slow app boot on cold cache                | Incremental usage meters; extend TTL                         | **P0**   |
| [`cache.js`](../../apps/api/src/lib/cache.js) + [`env.js`](../../apps/api/src/config/env.js)                                | `REDIS_URL` optional; unbounded memory Map fallback                    | Cross-replica inconsistency; OOM risk      | Require Redis in prod; LRU-cap fallback                      | **P0**   |
| [`register-cron-jobs.js`](../../apps/api/src/lib/register-cron-jobs.js)                                                     | 20+ crons in API process                                               | Cron bursts compete with request pool      | Split to worker service or `CRONS_ENABLED=false` on web tier | **P0**   |
| [`orders.calendar.routes.js`](../../apps/api/src/routes/orders.calendar.routes.js) · `GET /api/orders/calendar/`            | Over-fetch 600 rows; in-memory pagination                              | Calendar latency; wrong totals             | SQL pagination; CTEs for suppliers/categories                | **P1**   |
| [`products.routes.js`](../../apps/api/src/routes/products.routes.js) · `/favorites`                                         | Unpaginated                                                            | Unbounded response                         | Add limit/offset                                             | **P1**   |
| [`quick-lists.routes.js`](../../apps/api/src/routes/quick-lists.routes.js)                                                  | All lists + all items, no pagination                                   | Huge payloads for power users              | Paginate lists; lazy-load items                              | **P1**   |
| [`products.routes.js`](../../apps/api/src/routes/products.routes.js) · `/categories`, `/tags`                               | Redis cache never invalidated on CRUD                                  | Stale meta for 300s                        | Invalidate on catalog mutations                              | **P1**   |
| [`supplier-command-center.service.js`](../../apps/api/src/services/supplier-command-center.service.js)                      | 14+ queries; unbounded receivables                                     | Supplier home 500ms–5s+                    | Cache snapshot 30–60s                                        | **P1**   |
| [`chat/conversations.js`](../../apps/api/src/routes/chat/conversations.js)                                                  | Correlated last-message subquery × 200                                 | Inbox load degrades                        | Denormalize last_message on conversation                     | **P1**   |
| [`orders/list.js`](../../apps/api/src/routes/orders/list.js)                                                                | `o.*` + embedded all line items                                        | Large order list payloads                  | `?includeItems=false`; slim DTO                              | **P2**   |
| [`search.routes.js`](../../apps/api/src/routes/search.routes.js)                                                            | `p.*`; correlated product count per supplier                           | Oversized search                           | Slim columns; precomputed counts                             | **P2**   |
| [`ProductsPage.tsx`](../../apps/web/src/pages/ProductsPage.tsx)                                                             | Client-side supplier filter; full-page skeleton on refetch             | Wrong/incomplete results                   | Server filter; `isFetching` overlay                          | **P1**   |
| [`products.ts`](../../apps/web/src/services/api/endpoints/products.ts)                                                      | Favorite invalidates entire `Product` tag                              | Full catalog refetch per heart             | Narrow tag invalidation                                      | **P2**   |

**Infrastructure:** Compression OK (`compression()` in server.js). Redis partial — calendar/RBAC cached when Redis healthy; memory fallback per replica without `REDIS_URL`. Rate limits in-memory per process (not Redis-backed) — ineffective across replicas.

**Skipped:** Live Railway p95 profiling.

---

## UI/UX Findings

| Page / Component                                                                                      | UX problem                                                    | Suggested improvement                                    | Priority |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| [`ProductsPage.tsx`](../../apps/web/src/pages/ProductsPage.tsx)                                       | `limit: 100`, no pagination; supplier filter client-side only | Server-side filter + pagination + "Showing X of Y"       | **P0**   |
| [`SupplierCustomerGrowthPage.tsx`](../../apps/web/src/pages/SupplierCustomerGrowthPage.tsx)           | CSV preview errors discarded; only toast                      | Inline error table; block import when `validCount === 0` | **P0**   |
| [`sidebarNavConfig.ts`](../../apps/web/src/components/sidebar/sidebarNavConfig.ts)                    | No nav for `/app/customer-growth`                             | Add supplier nav item with permission gate               | **P0**   |
| [`App.tsx`](../../apps/web/src/App.tsx) / growth route                                                | No `RequirePermission` or supplier role guard                 | Wrap route like Products page                            | **P0**   |
| [`ProductImageImportDialog.tsx`](../../apps/web/src/components/products/ProductImageImportDialog.tsx) | Preview lacks unmatched SKU/file drill-down                   | Expandable failure tables                                | **P0**   |
| [`ProductCatalogTable.tsx`](../../apps/web/src/components/products/ProductCatalogTable.tsx)           | "Edit" shows "coming soon" toast                              | Hide or wire to edit flow                                | **P1**   |
| [`ProductsPage.tsx`](../../apps/web/src/pages/ProductsPage.tsx)                                       | Full-page skeleton on refetch; bare error with no retry       | Table overlay; `EmptyState` + retry                      | **P1**   |
| [`ProductImageImportDialog.tsx`](../../apps/web/src/components/products/ProductImageImportDialog.tsx) | Can close during active import; duplicate toasts              | Warn before close; toast-once guard                      | **P1**   |
| [`SupplierCustomerGrowthPage.tsx`](../../apps/web/src/pages/SupplierCustomerGrowthPage.tsx)           | Hardcoded `planCode: 'silver'`; no loading/error UI           | Plan picker; skeleton tiles + retry                      | **P1**   |
| [`Layout.tsx`](../../apps/web/src/components/Layout.tsx)                                              | No supplier mobile bottom nav                                 | Supplier bottom nav (Products, Orders, Growth)           | **P1**   |
| [`CartPage.tsx`](../../apps/web/src/pages/CartPage.tsx)                                               | Checkout CTA below fold on mobile                             | Sticky mobile checkout bar                               | **P1**   |
| [`Layout.tsx`](../../apps/web/src/components/Layout.tsx)                                              | Multiple stacked banners consume mobile viewport              | Collapse into single alerts drawer                       | **P1**   |
| [`AdminGrowthSettingsPanel.tsx`](../../apps/web/src/components/admin/AdminGrowthSettingsPanel.tsx)    | No client validation; sponsorship limits in copy but not UI   | Validate discount/validity; expose limits                | **P1**   |
| [`ProductCatalogTable.tsx`](../../apps/web/src/components/products/ProductCatalogTable.tsx)           | Duplicate DOM (mobile cards + desktop table)                  | Single responsive row component                          | **P2**   |
| [`manifest.webmanifest`](../../apps/web/static/manifest.webmanifest)                                  | Shortcuts to staff/order; `portrait-primary` lock             | ERP shortcuts; `orientation: any`                        | **P2**   |
| [`ChatPage.tsx`](../../apps/web/src/pages/ChatPage.tsx)                                               | `100vh` not `100dvh`; clips composer on mobile                | Use `100dvh` + safe-area                                 | **P2**   |
| [`OrdersPage.tsx`](../../apps/web/src/pages/OrdersPage.tsx)                                           | Silent `limit: 100` cap                                       | Server pagination with tab counts                        | **P1**   |

**Mobile/PWA:** Restaurant bottom nav works; supplier/driver rely on hamburger only. SW caches static assets only — no offline CRUD. See [`docs/mobile/MOBILE_PARITY_CHECKLIST.md`](../mobile/MOBILE_PARITY_CHECKLIST.md).

---

## Database Findings

| Table / Migration / File                                       | Issue                                                             | Recommended change                                                                                         | Priority |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| `supplier_referral_attribution` + `register-account.js` (0169) | Referral accept does not unlock subscription                      | Clear `account_locked_at`; set trial dates on accept                                                       | **P0**   |
| `delivery_zone` (0005/0161/0165)                               | Polymorphic supplier/branch columns; conflicting NOT NULL         | XOR CHECK + nullable FKs in 0170                                                                           | **P0**   |
| `platform_setting` (0169)                                      | `free_sandbox_days` ON CONFLICT DO UPDATE overwrites admin value  | Change to DO NOTHING or versioned seed                                                                     | **P0**   |
| `supplier_referral_attribution` (0169)                         | No partial unique on active attribution per restaurant            | `UNIQUE (restaurant_id) WHERE converted_at IS NULL AND first_paid_discount_used = false`                   | **P0**   |
| `catalog_image_import_job` (0168)                              | No DB-level active-job uniqueness; stuck `processing` after crash | Partial unique `(supplier_id) WHERE status IN ('pending','processing')`; add `updated_at` + stale-job cron | **P0**   |
| Growth expiry crons (0169)                                     | Missing `(status, expires_at)` partial indexes                    | Indexes on invitations, connection requests, sponsorship                                                   | **P0**   |
| `billing_invoice`                                              | No PAID tenant index for growth revenue JOIN                      | `(tenant_id, tenant_type, paid_at DESC) WHERE status = 'PAID'`                                             | **P1**   |
| `supplier_sponsorship` (0169)                                  | Direct subscription UPDATE bypasses `subscription_change_log`     | Log plan changes; FK on `supplier_billing_invoice_id`                                                      | **P1**   |
| `supplier_customer_prospect` (0169)                            | No audit log on CSV import (unlike image import)                  | `writeAuditLog` on batch completion                                                                        | **P1**   |
| `supplier_customer_prospect`                                   | Phone/name matching non-indexable                                 | Generated `phone_digits` column + trigram on name                                                          | **P1**   |
| `subscription`                                                 | No unique active subscription per tenant                          | Partial unique `(tenant_id, tenant_type) WHERE status NOT IN ('CANCELLED')`                                | **P1**   |
| `catalog_image_import_job`                                     | Unbounded `preview_json` / `result_json`                          | Row-detail table; job retention policy                                                                     | **P1**   |
| `reorder_ai_request_log` (0167)                                | No retention in `log-retention.job.js`                            | Add 90-day purge task                                                                                      | **P2**   |
| `audit_logs` (0046)                                            | No retention (unlike `admin_audit_log`)                           | Add to retention job                                                                                       | **P2**   |
| `sql-migrator.js`                                              | Treats `42P07` (relation exists) as migration success             | Stop marking failed partial migrations as applied                                                          | **P1**   |

**Recommended bundle:** [`0170_schema_hardening_and_integrity.sql`](../../apps/api/db/migrations/) — cron indexes, referral uniqueness, image import concurrency, delivery_zone fix, reorder forecast stale index.

---

## Security Findings

| Route / File                                                                                                | Security risk                                     | Exploit scenario                                   | Fix                                            | Priority |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- | -------- |
| [`files.routes.js`](../../apps/api/src/routes/files.routes.js) · `GET /api/files/object`                    | Unauthenticated read                              | Guess/leak storage keys → download private uploads | Auth + ownership or signed tokens              | **P0**   |
| [`server.js`](../../apps/api/src/server.js) · `express.static('/uploads')`                                  | Public static tree (local storage)                | Direct GET bypasses RBAC                           | Disable static serving in prod                 | **P0**   |
| [`product-image-import.service.js`](../../apps/api/src/services/product-image-import.service.js)            | SSRF on redirect follow                           | Redirect to cloud metadata/internal IP             | Block redirects; validate hops                 | **P0**   |
| [`auth.js`](../../apps/api/src/lib/auth.js) · `verifyToken`                                                 | No `aud`/`azp` → token accepted; issuer warn-only | Cross-client token replay; wrong realm tokens      | Hard-fail missing audience and issuer mismatch | **P0**   |
| [`tenant-switch.js`](../../apps/api/src/lib/tenant-switch.js) + [`rbac.js`](../../apps/api/src/lib/rbac.js) | Tenant binding by `contact_email` only            | Register as supplier contact email → auto Owner    | Invite-token-only linking                      | **P0**   |
| [`product-import.service.js`](../../apps/api/src/services/product-import.service.js)                        | No SKU limit enforcement on bulk import           | Bypass plan cap via CSV import                     | Enforce `checkLimit` before import             | **P0**   |
| [`rbac.js`](../../apps/api/src/lib/rbac.js) · `requirePermission`                                           | Scoped admin bypass                               | Finance admin passes all permission checks         | Remove ADMIN blanket bypass                    | **P1**   |
| [`rbac.js`](../../apps/api/src/lib/rbac.js) · `ensureDefaultAdminRole` / `upsertUser`                       | Auto SUPER_ADMIN; hardcoded demo emails           | Misconfigured account → full platform access       | Explicit bootstrap only                        | **P1**   |
| [`products.routes.js`](../../apps/api/src/routes/products.routes.js) · `GET /api/products/:id`              | No relationship check; exposes `supplier_email`   | UUID scrape competitor pricing/PII                 | Scope reads; strip PII                         | **P1**   |
| [`restaurants.routes.js`](../../apps/api/src/routes/restaurants.routes.js) · `GET /api/restaurants/:id`     | Supplier can read any restaurant by UUID          | Enumerate restaurant PII                           | Relationship-scoped reads                      | **P1**   |
| [`public-supplier-catalog.service.js`](../../apps/api/src/services/public-supplier-catalog.service.js)      | Missing column → all suppliers public             | Full catalog scrape without auth                   | Default deny when column absent                | **P1**   |
| [`supplier-growth.routes.js`](../../apps/api/src/routes/supplier-growth.routes.js)                          | No `requireFeature()` on growth/sponsor           | Base plan sponsors without paying                  | Gate with plan feature flags                   | **P1**   |
| CSV exports (multiple)                                                                                      | Formula injection (`=`, `+`, `@`)                 | Malicious CSV → Excel RCE on open                  | Prefix risky cells with `'`                    | **P1**   |
| [`files.routes.js`](../../apps/api/src/routes/files.routes.js) · PUT upload                                 | No magic-byte validation                          | Polyglot upload → stored XSS                       | Sharp/libmagic on complete                     | **P1**   |
| [`auth.routes.js`](../../apps/api/src/routes/auth.routes.js) · `GET /auth/logout?redirect=`                 | Open redirect                                     | Phishing via post-logout redirect                  | Allowlist redirect targets                     | **P1**   |
| [`public.routes.js`](../../apps/api/src/routes/public.routes.js)                                            | Staff tokens in query string; CSRF-exempt writes  | Token leakage via Referer/logs                     | Move tokens to header/body                     | **P1**   |
| [`prices.routes.js`](../../apps/api/src/routes/prices.routes.js) · `GET /api/prices/product/:id`            | Unauthenticated price history                     | Enumerate product UUIDs                            | requireAuth + tenant scope                     | **P1**   |
| [`inventory.routes.js`](../../apps/api/src/routes/inventory.routes.js) · `GET /api/inventory/product/:id`   | No supplier tenant check                          | Cross-tenant stock read                            | Enforce supplier_id match                      | **P1**   |
| [`billingAccess.js`](../../apps/api/src/middlewares/billingAccess.js)                                       | Expired trial allows all GET                      | Read exfil while writes blocked                    | Narrow GET when locked                         | **P2**   |
| [`admin.routes.js`](../../apps/api/src/routes/admin.routes.js) · `GET /api/admin/dashboard`                 | `requireAuth` only                                | Any user gets platform product count               | Add `requireRole(['ADMIN'])`                   | **P2**   |

**Route inventory:** 541 handlers across 82 modules. [`public.routes.js`](../../apps/api/src/routes/public.routes.js): 23 endpoints (22 unauthenticated by design). 8 legacy `contact_email !== req.userData.email` ownership checks remain.

**RBAC tests:** 163/163 pass — does not cover admin middleware bypass.

---

## Railway / Config Findings

| Area          | Status                                                 | Gap / recommendation                                            |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Compression   | OK — global `compression()`                            | Not in env-matrix (code-only)                                   |
| Redis         | Optional; memory fallback per replica                  | **Not required by validate-config** — mandate for multi-replica |
| Rate limiting | Prod requires `RATE_LIMIT_ENABLED=true`                | In-memory per process; no upload/import limits                  |
| Storage       | Prod: `STORAGE_PUBLIC_READ=false`, `STORAGE_DRIVER=s3` | **Preprod omits `STORAGE_PUBLIC_READ`** → defaults public       |
| Object reads  | Private bucket uses `/api/files/object`                | Unauthenticated — authorization fix required                    |
| Doc drift     | env-matrix says dev `local` storage                    | Committed `development/api.env` uses `s3`                       |
| Staging       | No `staging/api.env`                                   | Loader maps staging → preprod                                   |

See [`docs/operations/storage-uploads.md`](../operations/storage-uploads.md), [`docs/operations/env-matrix.md`](../operations/env-matrix.md).

---

## Quick Wins

1. Add Redis cache (120s TTL) to admin overview + conversion-stats
2. Remove admin RBAC bypass in `requirePermission` (~4 lines)
3. Add Customer Growth to supplier sidebar nav
4. Show customer import preview errors on growth page (UI-only)
5. Prefix CSV formula characters in export helpers
6. Hide dead "Edit" button in `ProductCatalogTable`
7. Set `STORAGE_PUBLIC_READ=false` in preprod `api.env`
8. Draft `0170_schema_hardening_and_integrity.sql` (indexes + uniqueness only)
9. Fix `AdminPlatformSettingsPanel` validation toast or test expectation
10. Invalidate product categories/tags cache on catalog CRUD

---

## Recommended Next Implementation Order

1. **Security P0** — File object auth, RBAC bypass, SSRF, JWT audience/issuer, SKU import limit
2. **DB P0** — Referral unlock fix, 0170 indexes/uniqueness, delivery_zone integrity
3. **Performance P0** — CSV import batching, admin overview cache, catalog keyset pagination
4. **UI P0** — Growth preview, sidebar nav, route guards, catalog pagination
5. **Security P1** — Prices/inventory scope, legacy admin routes, growth feature gates
6. **Performance P1** — Orders calendar SQL pagination, inventory pagination, entitlements cache
7. **Ops** — audit_logs retention, Redis required in prod validation, preprod storage flag
8. **Mobile/PWA** — Supplier bottom nav, manifest shortcuts, sticky cart checkout

---

## Manual Decisions Required

| Decision                          | Options                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `/api/files/object` auth model    | Signed tokens (CDN-friendly) vs session auth                 |
| Locked tenant GET allowance       | Intentional read-only sandbox vs block sensitive GET exports |
| Admin bootstrap                   | Keep or remove `ensureDefaultAdminRole` auto-SUPER_ADMIN     |
| Sponsorship plan picker           | Admin-configurable eligible plans vs hardcoded silver        |
| Image import job retention        | TTL for `preview_json` rows (30/90/365 days)                 |
| CSV product import                | Sync with row limit vs mandatory async job for >N rows       |
| `delivery_zone` polymorphic model | Single table with XOR vs split supplier/B2C tables           |

---

## Skipped Checks

| Check                              | Reason                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Live Railway p95 latency           | Requires deployed environment and representative traffic                                                |
| Dynamic penetration testing        | Static review only; no exploit attempts against running services                                        |
| `supplify-mobile` repo review      | Sibling repo not in workspace; see [`MOBILE_PARITY_CHECKLIST.md`](../mobile/MOBILE_PARITY_CHECKLIST.md) |
| Full API route manual auth review  | 218 GET lines without inline `requireAuth` — many protected at `router.use` level                       |
| Bugbot / security-review subagents | Not run for this audit pass                                                                             |

---

## Acceptance Criteria

- [x] Audit document at `docs/audits/supplify-quick-performance-ui-db-security-audit.md`
- [x] Findings ranked by priority (P0/P1/P2)
- [x] Performance, UI, DB, and security all covered
- [x] File paths and route names included
- [x] Suggested fixes provided, not problems only
- [x] No app rewrite or subscription logic changes
- [x] Tests run: RBAC 163/163 pass, import/growth 22/22 pass, web 3/4 pass
- [x] Skipped checks documented
- [x] **14 subagents launched in single parallel wave** (4 explore + 5 shell + 4 section + 1 validator)

---

## Agent Execution Log

| Wave                              | Agents                                                     | Outcome                                                                   |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| **All parallel (single message)** | 4 explore + 2 shell + 3 shell + 4 generalPurpose + 1 shell | Research, tests, section drafts, validation — **14 concurrent subagents** |
| Synthesis                         | Main agent                                                 | This document (merged + deduped)                                          |

**Test results (shell agents):** RBAC exit 0 (163 pass) · Import/growth exit 0 (22 pass) · Web exit 1 (1 fail: `AdminPlatformSettingsPanel` validation toast)

**Validation (shell agent):** PASS — all required H2 headers, 10/10 cited paths exist, Skipped Checks present

---

## Fix Log (2026-06-15 — parallel implementation)

**4 implementation agents + test fix.** RBAC **164/164**, targeted API **51/51**, web component **4/4** pass.

### Security — fixed

| Item                   | Change                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Admin RBAC bypass      | Removed blanket bypass in `requirePermission` / `requireAnyPermission`                        |
| File object reads      | `object-download-auth.js` — HMAC signed URLs + auth/ownership + public catalog product images |
| SSRF image import      | `redirect: 'manual'` + response URL re-validation                                             |
| JWT hardening          | Prod: reject missing aud/azp; hard-fail issuer mismatch                                       |
| Price history          | `GET /api/prices/product/:id` requires auth + tenant scope                                    |
| Inventory cross-tenant | Supplier/restaurant tenant checks on `GET /inventory/product/:id`                             |
| Logout open redirect   | Allowlist to `WEB_ORIGINS` only                                                               |
| CSV formula injection  | `neutralizeCsvField` in `sanitize-upload.js` used across exports                              |
| Orders remind spam     | `requireAnyPermission(ORDERS_CREATE, ORDERS_MANAGE)` on `/remind`                             |

### Performance / API — fixed

| Item                    | Change                                                   |
| ----------------------- | -------------------------------------------------------- |
| Admin overview cache    | Redis `admin:overview:v1` TTL 120s                       |
| Duplicate AI metrics    | Single `getAiReorderMetrics()` call in overview builder  |
| SKU import limit bypass | `checkLimit('supplier_products_skus')` before CSV import |
| Audit log retention     | `audit_logs` added to log-retention job (365d)           |

### Database — fixed

| Item            | Change                                                                |
| --------------- | --------------------------------------------------------------------- |
| Migration 0170  | Cron indexes, PAID invoice index, import job uniqueness, `updated_at` |
| Referral unlock | Subscription unlocked after `acceptReferralOnRegistration`            |

### UI — fixed

| Item                       | Change                                                   |
| -------------------------- | -------------------------------------------------------- |
| Customer Growth nav        | Sidebar entry + `RequirePermission` on route             |
| Growth import preview      | Error table + loading/error states                       |
| Products pagination        | Server `supplier` filter, offset pagination, error retry |
| Catalog Edit dead-end      | Edit button removed                                      |
| Image import dialog        | Unmatched/duplicate sections; `skipPollingIfUnfocused`   |
| Admin growth validation    | Client-side discount/validity checks                     |
| Favorites refetch storm    | Optimistic updates; narrow tag invalidation              |
| PWA manifest               | `orientation: any`; ERP shortcuts                        |
| AdminPlatformSettings test | Fixed out-of-range test value (5 not 10)                 |

### Config — fixed

| Item               | Change                                                    |
| ------------------ | --------------------------------------------------------- |
| Preprod storage    | `STORAGE_PUBLIC_READ=false` in preprod `api.env`          |
| Redis prod warning | `validate-config.js` warns when `REDIS_URL` unset in prod |

### Fix Log (2026-06-15 — wave 2, parallel agents)

**4 agents.** RBAC **164/164**; billing/admin **19/19**; web **6/6** on changed suites.

#### Security / DB — wave 2

| Item                        | Change                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Auto SUPER_ADMIN            | Gated behind `ALLOW_AUTO_SUPER_ADMIN` (default false)                                          |
| Static `/uploads`           | Disabled in prod unless `STORAGE_PUBLIC_READ=true`                                             |
| Import rate limits          | Product CSV 10/15min; image job 5/hr per user                                                  |
| Billing lock GET            | Blocks `/api/reports/*`, exports, invoice PDFs when locked                                     |
| `contact_email` checks      | Replaced with `getSupplierIdForRequest` in products, invoices, suppliers, fulfillment          |
| Public catalog default deny | Missing column → not public                                                                    |
| Legacy admin dashboard      | `requireRole(['ADMIN'])` only                                                                  |
| Email tenant binding        | Removed contact_email-only access in tenant-switch                                             |
| Migration 0171              | delivery_zone XOR, referral/subscription partial uniques, prospect phone index, sponsorship FK |
| Migration 0172              | `supplier_growth` feature on silver+ plans                                                     |
| Growth `requireFeature`     | Wired on supplier-growth routes                                                                |

#### Performance / API — wave 2

| Item                      | Change                                             |
| ------------------------- | -------------------------------------------------- |
| Batch CSV import          | Transaction + unnest bulk INSERT/UPDATE            |
| Product keyset pagination | Optional `cursor` param + `nextCursor` response    |
| Orders calendar           | SQL LIMIT/OFFSET; no 600-row in-memory slice       |
| Inventory list pagination | Default limit 100, max 500 + total                 |
| Categories/tags cache     | Invalidated on product CRUD                        |
| Admin activity cache      | Redis 90s TTL                                      |
| Entitlements cache        | TTL 300s                                           |
| Referral revenue JOIN     | LATERAL latest PAID invoice per tenant             |
| Prospect CSV audit log    | `customers.import.completed` on batch finish       |
| reorder_ai log retention  | 90-day purge in log-retention job                  |
| sql-migrator              | No longer marks failed migrations applied on 42P07 |

#### UI — wave 2

| Item                            | Change                                             |
| ------------------------------- | -------------------------------------------------- |
| Supplier mobile bottom nav      | Products, Orders, Customer Growth                  |
| Sticky cart checkout            | Mobile fixed bar with total + CTA                  |
| Banner consolidation            | `LayoutTenantAlerts` — priority + "View all"       |
| Chat viewport                   | `100dvh`                                           |
| Products cursor pagination      | Wired when API returns `nextCursor`                |
| Admin growth sponsorship limits | Per-tier limits in settings panel                  |
| Referral token preservation     | `/register?ref=` → sessionStorage through Keycloak |

### Fix Log (2026-06-15 — wave 3, parallel agents)

**4 agents.** RBAC **164/164**; wave 3 API **27/27**; web **8/8** on changed suites.

#### Infra / security — wave 3

| Item                   | Change                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Redis rate limiting    | `rate-limit-store.js` — INCR/EXPIRE store on shared ioredis; wired in `server.js` + supplier-ops limiters |
| Upload magic bytes     | `assertImageUploadBytes()` in `sanitize-upload.js`; validated on upload complete                          |
| Product PII            | Removed `supplier_email` from product list/detail/favorites; added `supplier_id`                          |
| Admin tenant directory | Slim explicit column SELECTs; correlated counts → LEFT JOIN aggregates                                    |

#### Performance / API — wave 3

| Item                          | Change                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| Admin activity feed           | Single `UNION ALL` query + COUNT; fallback to per-branch on error                                      |
| Supplier command center cache | Redis `supplier:command-center:{id}` TTL 45s                                                           |
| Async product CSV import      | Migration `0173`, `product-import-worker.js`; async when rows > `PRODUCT_IMPORT_ASYNC_THRESHOLD` (200) |
| Orders list slim payload      | `?includeItems=false` omits embedded line items (default true)                                         |
| Invoices pagination           | `limit` (default 50, max 200) + `offset`; returns `pagination.total`                                   |
| Favorites pagination          | `GET /api/products/favorites` limit/offset + total count                                               |
| Receivables bounds            | Aggregate summary; invoice list + top debtors capped at 100 rows                                       |
| platform_setting seed         | Migration `0174` — `free_sandbox_days` uses `ON CONFLICT DO NOTHING`                                   |

#### UI — wave 3

| Item                  | Change                                                      |
| --------------------- | ----------------------------------------------------------- |
| OrdersPage pagination | Server offset pagination; "Showing X–Y of Z" + prev/next    |
| ProductCatalogTable   | Shared `ProductCatalogRow` for mobile cards + desktop table |

### Fix Log (2026-06-15 — wave 4, parallel agents)

**4 agents.** RBAC **164/164**; wave 4 API **43/43**; web image import **3/3**.

#### Security / Ops — wave 4

| Item                                | Change                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Product detail relationship check   | `GET /api/products/:id` scoped to tenant relationship before returning detail        |
| Restaurants/:id relationship scope  | `GET /api/restaurants/:id` limited to supplier–restaurant links                      |
| Public staff token deprecation      | Staff tokens accepted via header/body; query-string tokens deprecated with warn      |
| REDIS_URL prod hard-fail            | `validate-config.js` exits when `REDIS_URL` unset in production                      |
| Memory cache LRU cap                | Bounded in-memory fallback in `cache.js` (LRU max entries)                           |
| Sponsorship subscription_change_log | Sponsorship plan changes recorded in `subscription_change_log`                       |
| Image/product import job retention  | `preview_json` / `result_json` purged per retention policy in `log-retention.job.js` |

#### Performance / API — wave 4

| Item                                   | Change                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Quick lists pagination + includeItems  | Paginated list endpoint; `?includeItems=false` lazy-loads line items      |
| Search slim columns                    | Explicit column list replaces `p.*` on search results                     |
| Chat inbox pagination                  | Conversation list limit/offset (or cursor) instead of fixed 200-row fetch |
| Products list DTO + includeStock scope | Slim list projection; stock summary scoped to supplier tenant             |

#### UI — wave 4

| Item                            | Change                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Async CSV import web polling    | Product import dialog polls async job status when row count exceeds threshold |
| Growth plan picker              | Replaces hardcoded `planCode: 'silver'` with eligible-plan selector           |
| ProductsPage isFetching overlay | Table overlay during refetch; no full-page skeleton on background fetch       |
| Image import close guard        | Confirm before closing dialog while import job is active                      |

### Still deferred (wave 5 + external)

**Wave 5 (ops / backlog):**

- Residual `contact_email` in admin display columns and legacy route SELECTs (ownership checks migrated in wave 2)
- Materialized admin tenant metrics table (join aggregates used instead)
- `express.static` vs signed-URL CDN model (document in storage-uploads.md)
- Entitlements incremental usage meters (cache TTL extended only in wave 2)
- Cron/worker split — 20+ crons in API process; dedicated worker or `CRONS_ENABLED=false` on web tier

**External / manual:**

- Live Railway p95 profiling
- `supplify-mobile` repo review (sibling repo not in workspace)
