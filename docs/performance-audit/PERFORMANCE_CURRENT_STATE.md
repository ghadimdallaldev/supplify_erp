# Supplify Performance — Current State Inventory

**Date:** 2026-06-04  
**Scope:** Full inventory of performance-related mechanisms across API, web, database, Redis, compression, and deployment.  
**Purpose:** Preserve speed gains (~6s → &lt;1.5s on many APIs) while guiding safe invalidation, guardrails, and observability.  
**Related docs:** [`docs/operations/railway-performance-report.md`](../operations/railway-performance-report.md), [`docs/cache-audit/CACHE_AUDIT_CURRENT_STATE.md`](../cache-audit/CACHE_AUDIT_CURRENT_STATE.md)

**Do not remove mechanisms listed here without re-measuring latency and load.**

---

## 1. Executive summary

Supplify’s performance work (Phases 1–9, June 2026) addressed a **4–7 second** baseline on Railway where simple queries could take **~980ms** due to cold DB connections, redundant middleware DB work, missing indexes, unbounded list queries, heavy entitlements SQL, uncompressed JSON over the wire, and aggressive frontend polling/refetching.

The project now uses a **layered strategy**:

| Layer                   | Mechanism                                                                                                                           | Impact                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Database**            | Pool warmth (min:2, keepalive), 75+ index migrations (0138–0140 hot/cold paths), query rewrites (CTEs, LIMITs, parallel list+count) | Eliminates cold-connect penalty; bounds scans           |
| **Middleware**          | Skip role bootstrap when roles exist; billing fast path (1 vs 3 queries); per-request subscription memo; staged request timing      | ~5–6 fewer DB queries per authenticated request         |
| **Cross-request cache** | Redis + memory fallback via `cache.js`; singleflight coalescing; 20+ key families                                                   | Sub-200ms on cache hits for auth, entitlements, billing |
| **Per-request memo**    | `req._requestTenantCache`, `req._rolesMemo`, `req.billingSubscription`                                                              | Avoid duplicate work within one HTTP request            |
| **HTTP**                | Express `compression()` (gzip, 1KB threshold); CORS preflight `maxAge: 600`                                                         | Large JSON ~95% smaller on wire; fewer OPTIONS          |
| **Frontend**            | RTK Query tuning, route prefetch, vendor chunking, lazy routes, SW static cache, socket-aware notification polling                  | Fewer requests; faster first navigation                 |
| **Async deferral**      | Registration Keycloak/email off hot path                                                                                            | `/api/register/complete` no longer blocks ~40s          |

**Typical outcome (warm pool + Redis + migrations):** authenticated GETs **300–800ms**; entitlements cache hit **50–200ms**; repeat navigation **&lt;500ms perceived**.

**Critical dependency:** `REDIS_URL` on API for multi-replica cache sharing. Without Redis, each replica has isolated in-memory caches and singleflight maps.

---

## 2. Performance improvement map

| #   | Area                  | Mechanism                                                   | Primary files                                    | Before (inferred)             | After (target/observed)      | Redis?            | Stale risk                  | Tenant leak risk               |
| --- | --------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ----------------------------- | ---------------------------- | ----------------- | --------------------------- | ------------------------------ |
| 1   | DB pool               | `min: 2`, `allowExitOnIdle: false`, warmup + keepalive      | `lib/db.js`, `server.js`                         | 100–400ms/connect after idle  | ~0 on warm pool              | No                | Low                         | No                             |
| 2   | RBAC middleware       | Skip `ensureTenantSystemRoles` when roles exist             | `lib/rbac.js`                                    | 3–4 queries/request           | 0 when established           | No                | Low                         | No                             |
| 3   | Billing middleware    | Fast path: 1 query + compute                                | `middlewares/billingAccess.js`                   | 3 queries/request             | 1 query (&gt;99% requests)   | Via billing cache | Medium (billing)            | No                             |
| 4   | User lookup           | `user:sub:{sub}` cache 300s + singleflight                  | `lib/rbac.js`                                    | DB every request              | Cache hit after first        | Yes               | **High** if not invalidated | No (keyed by sub)              |
| 5   | Tenant context bundle | `tctx:{userId}:{tenantId}:{type}` 120s                      | `lib/tenant-context-cache.js`                    | 6+ permission queries         | 1 bundle load                | Yes               | Medium                      | Bypass on impersonation/branch |
| 6   | Entitlements          | Batched limits + full payload cache 300s                    | `lib/subscription.js`, `lib/limit-resolution.js` | ~26 sequential queries, ~6.6s | 400–900ms cold; 50–200ms hit | Yes               | Medium                      | No (tenant-scoped)             |
| 7   | Subscription dedup    | `req.billingSubscription` / `req.subscription` once/request | `lib/request-subscription.js`                    | Stacked subscription queries  | 1 load/request               | Partial           | Low                         | No                             |
| 8   | Feature flags         | `ff:*` / `ff:all:*` 180s                                    | `lib/feature-flags.js`                           | 2–4 queries/request           | Cache hit                    | Yes               | Medium                      | No                             |
| 9   | HTTP compression      | `compression()` middleware                                  | `server.js`                                      | Full JSON on wire             | ~5–20% size on lists         | No                | No                          | No                             |
| 10  | CORS preflight        | `maxAge: 600`                                               | `server.js`                                      | ~200ms OPTIONS each endpoint  | Cached 10 min                | No                | No                          | No                             |
| 11  | Indexes 0138–0140     | Notifications, disputes, orders, inventory, products        | `db/migrations/0138–0140`                        | 500–980ms scans               | Sub-50ms indexed             | No                | N/A                         | No                             |
| 12  | Frontend polling      | `skipPollingIfUnfocused`, unified cache keys, unread-count  | `hooks/useNotificationBadge.ts`, `api.ts`        | 5 req/min/user                | 1–2 req/min                  | No                | Low                         | No                             |
| 13  | Route prefetch        | Layout + Sidebar dynamic imports                            | `Layout.tsx`, `routeChunkPrefetch.ts`            | 500–1500ms chunk download     | ~0 if prefetched             | No                | No                          | No                             |
| 14  | Vite chunking         | `manualChunks` vendor splits                                | `vite.config.ts`                                 | Re-download libs per route    | Shared stable chunks         | No                | No                          | No                             |
| 15  | Staff list cache      | `staff:list:*` 45s                                          | `lib/staff-list-cache.js`                        | Full SQL each visit           | Cache hit                    | Yes               | Medium                      | Restaurant-scoped              |
| 16  | Registration async    | Keycloak + email fire-and-forget                            | `lib/register-account.js`                        | ~43s blocking                 | 201 in seconds               | N/A               | N/A                         | N/A                            |
| 17  | Request timing        | `http.request.slow_breakdown` &gt;800ms                     | `middlewares/request-timing.js`                  | Opaque latency                | Stage breakdown in logs      | No                | N/A                         | N/A                            |
| 18  | Auth shell refetch    | `refetchAppSession` after sensitive flows                   | `lib/refetchAppSession.ts`                       | Stale RTK after signup        | Fresh me/billing/ent         | No                | Correctness fix             | No                             |
| 19  | Central invalidation  | `invalidateUserAuthCaches`                                  | `lib/access-cache.js`                            | Stale role after register     | Clears auth keys             | Yes               | Fixes staleness             | No                             |
| 20  | Notification unread   | `GET /unread-count` + 30s cache                             | `notification.service.js`                        | Full list poll                | COUNT only when socket up    | Yes               | Low (30s)                   | User-scoped                    |

---

## 3. Redis + cache section

### 3.1 Architecture layers

```
Browser RTK Query (120–300s) ──► API ──► Redis/Memory (cache.js)
                              │         └── singleflight (process-local)
                              │         └── per-request memo (req._*)
                              └── Socket.IO (separate Redis pub/sub adapter)
```

### 3.2 Redis initialization (`apps/api/src/lib/cache.js`)

| Aspect                          | Behavior                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Init**                        | `ioredis` when `REDIS_URL` set; options in `config/resolve-redis-url.js` (`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`) |
| **Required?**                   | **Optional** — API starts without Redis                                                                                           |
| **Fallback**                    | In-process `Map` with TTL; lazy expiry on read; **unbounded size**                                                                |
| **On Redis error**              | `get`/`set`/`del` fall back to memory for that operation                                                                          |
| **Multi-replica without Redis** | **High risk** — divergent caches, duplicate DB load, stale reads up to TTL                                                        |
| **Socket adapter**              | Separate clients in `lib/socket-redis-adapter.js` (not data cache)                                                                |

### 3.3 Complete Redis key patterns and TTLs

| Key pattern                                                  | TTL (s) | Module                       | singleflight | Invalidation                                            |
| ------------------------------------------------------------ | ------- | ---------------------------- | ------------ | ------------------------------------------------------- |
| `user:sub:{sub}`                                             | 300     | `rbac.js`                    | Yes          | `invalidateUserBySubCache`, `invalidateUserAuthCaches`  |
| `tenant:req:{userId}:{type}`                                 | 180     | `rbac.js`                    | Yes          | `invalidateRequestTenantCache`, hub                     |
| `ws:assign:{userId}:{type}`                                  | 180     | `workspace-tenant.js`        | Yes          | `invalidateWorkspaceAssignmentCache`, hub               |
| `perms:{userId}:{tenantId}:{type}`                           | 120     | `permissions.js`             | Yes          | `invalidateUserPermissionCache`, hub                    |
| `roles:{userId}:{tenantId}:{type}`                           | 180     | `permissions.js`             | Yes          | same                                                    |
| `tctx:{userId}:{tenantId}:{type}`                            | 120     | `tenant-context-cache.js`    | Yes          | `invalidateTenantContextCache`, permission invalidation |
| `sub:{type}:{tenantId}`                                      | 180     | `subscription.js`            | Yes          | `invalidateTenantSubscriptionCache`                     |
| `ent:{type}:{tenantId}`                                      | 300     | `subscription.js`            | Yes          | entitlements + subscription invalidation                |
| `billingSub:{tenantId}:{type}`                               | 180     | `billing/billing-service.js` | Yes          | `invalidateBillingSubscriptionCache`, chained           |
| `orgbill:{type}:{tenantId}`                                  | 300     | `org-billing-tenant.js`      | Yes          | **None (TTL only)**                                     |
| `tenant:profile:{type}:{id}`                                 | 300     | `tenant-profile-cache.js`    | Yes          | `invalidateTenantProfileCache` (PATCH routes)           |
| `ff:{tenantId}:{type}:{key}`                                 | 180     | `feature-flags.js`           | No           | `invalidateFeatureFlagCache`                            |
| `ff:all:{tenantId}:{type}`                                   | 180     | `feature-flags.js`           | Yes          | same                                                    |
| `staff:list:{endpoint}:{restaurantId}`                       | 45      | `staff-list-cache.js`        | Yes          | `invalidateStaffListCache`, mutation middleware         |
| `prefs:{userId}:{userType}`                                  | 180     | `notification.service.js`    | No           | `invalidateNotificationPreferencesCache`                |
| `notif:unread:{userId}:{userType}`                           | 30      | `notification.service.js`    | Yes          | `invalidateUserNotificationsListCache`                  |
| `notif:list:{userId}:{userType}:{limit}:{offset}:{readFlag}` | 25      | `notification.service.js`    | Yes          | partial (limits 25/50, offset 0)                        |
| `productCats:{supplierId\|'all'}`                            | 300     | `products.routes.js`         | No           | **None (TTL only)**                                     |
| `productTags:{supplierId\|'all'}`                            | 300     | `products.routes.js`         | No           | **None (TTL only)**                                     |
| `orders-calendar:{tenantId}:{role}:{filtersJSON}`            | 300     | `orders.calendar.routes.js`  | No           | **None (TTL only)**                                     |

**Default TTL** when caller omits: **300s** (`cache.js`).

### 3.4 Central invalidation hub

**`invalidateUserAuthCaches`** (`lib/access-cache.js`) clears: `user:sub`, `perms`, `roles`, `tctx`, `ws:assign`, `tenant:req`, `sub`, `ent`, `billingSub`.

**Callers:** registration, invitation accept, tenant role assign/update.

### 3.5 Per-request memoization

| Field                                                          | Set in                    | Purpose                              |
| -------------------------------------------------------------- | ------------------------- | ------------------------------------ |
| `req._requestTenantResolved` / `req._requestTenantCache`       | `getRequestTenant`        | Tenant resolved once per request     |
| `req._rolesMemoKey` / `req._rolesMemo`                         | `getRolesForUser`         | Roles loaded once per request        |
| `req._billingSubscriptionResolved` / `req.billingSubscription` | `request-subscription.js` | Billing row once per request         |
| `req.subscription`                                             | `request-subscription.js` | Active subscription once per request |
| `req._perf`                                                    | `request-timing.js`       | Stage timings, cache hit maps        |

**Cache bypass paths (correctness):** impersonation, `x-branch-id`, active-tenant cookie, admin without impersonation on some paths — see `canUseCrossRequestTenantCaches`.

### 3.6 Frontend caches

| System             | Location                                                             | Settings                                                                                                            |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **RTK Query**      | `apps/web/src/services/api.ts`                                       | Global `keepUnusedDataFor: 120`, `refetchOnFocus: false`; auth shell 120s; catalog/branches 300s; notifications 60s |
| **Staff API**      | `apps/web/src/services/staffApi.ts`                                  | 300s, no focus refetch                                                                                              |
| **TanStack Query** | `hooks/useOrdersCalendar.ts` only                                    | `staleTime: 5min`, no focus refetch                                                                                 |
| **localStorage**   | Cart (`cartPersistence.ts`), monetization blocks, staff portal token | Not server cache; reduces re-fetch of cart state                                                                    |
| **Service worker** | `static/sw.js`                                                       | Cache-first static assets; **never** caches `/api/`, `/auth/`, `/socket.io/`                                        |

**Session refresh:** `refetchAppSession.ts` force-refetches `getMe`, `getRegisterStatus`, `getBillingStatus`, `getEntitlements` after signup, activation, checkout, invite accept.

**Logout hygiene:** `api.util.resetApiState()` in `Header.tsx`, invite flows, `BranchContext.tsx`.

### 3.7 Observability

- `noteCacheHit` / `noteCacheMiss` on: `userBySub`, `requestTenant`, `entitlements`, `tctx`, `staffList`
- Included in `http.request.slow_breakdown` when total &gt; `SLOW_REQUEST_MS` (default **800ms**)

---

## 4. Compression section

### 4.1 API (`apps/api/src/server.js`)

| Setting    | Value                                              |
| ---------- | -------------------------------------------------- |
| Middleware | `compression()` (gzip/deflate)                     |
| Position   | Immediately after `requestTiming`, before routes   |
| Threshold  | **1 KB** (library default)                         |
| Filter     | `compressible` — JSON/text yes; images/PDF skipped |
| BREACH     | Mitigated — CSRF is header-based, not body token   |
| SSE        | Not used in API                                    |
| WebSockets | Socket.IO bypasses HTTP compression middleware     |
| Uploads    | `express.json` 10MB; file routes separate          |

### 4.2 Nginx

| File                      | gzip           | Notes                                                                                                   |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web/nginx.conf`     | Yes            | `gzip_min_length 1024`, `gzip_vary on`; static assets `immutable` 1y                                    |
| `deploy/nginx/nginx.conf` | Yes            | Proxy to API; no brotli; `client_max_body_size 50m`                                                     |
| **Risk**                  | Docker compose | Possible double-compression API JSON if nginx + Express both compress — Railway direct Node avoids this |

### 4.3 Measured effect (local test, performance report)

500-item JSON list ~90KB → **~3KB** gzip (~95% reduction).

### 4.4 Frontend build

- Vite production build; hashed filenames + nginx immutable caching
- No explicit brotli in build pipeline

---

## 5. DB / index / query section

### 5.1 Pool configuration (`apps/api/src/lib/db.js`)

| Setting                   | Production typical                                    |
| ------------------------- | ----------------------------------------------------- |
| `max`                     | 20 (`DATABASE_POOL_MAX`)                              |
| `min`                     | **2** (always warm)                                   |
| `idleTimeoutMillis`       | **600000** (10 min)                                   |
| `connectionTimeoutMillis` | 5000                                                  |
| `allowExitOnIdle`         | **false**                                             |
| `keepAlive`               | **true** (TCP)                                        |
| `warmupPool()`            | `SELECT 1` × min(2) on boot                           |
| `startPoolKeepalive()`    | `SELECT 1` every 60s when `DB_KEEPALIVE_ENABLED=true` |
| Slow query log            | **&gt;500ms** → `event: db.query.slow`                |
| Statement timeout         | Optional `DATABASE_STATEMENT_TIMEOUT`                 |

### 5.2 Performance migrations (representative)

| Migration                                    | Focus                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `0091_performance_indexes.sql`               | Subscription, feature overrides, usage_meter                                  |
| `0128_staging_launch_perf_indexes.sql`       | Messages, drivers, invoices                                                   |
| `0132_production_readiness_perf_indexes.sql` | Dispatch, conversion events                                                   |
| `0138_performance_indexes.sql`               | Notifications, disputes, COALESCE date, app_user.email                        |
| `0139_railway_hot_path_indexes.sql`          | Inventory movement, receiving, restaurant_inventory, subscription, quick_list |
| `0140_railway_cold_path_indexes.sql`         | Products, pricing, staff docs, orders, disputes                               |
| `0038_orders_list_indexes.sql`               | Orders list + order_item                                                      |
| `0071_reports_analytics_indexes.sql`         | Reports paths                                                                 |

**Techniques:** partial indexes, expression indexes (`COALESCE(placed_at, created_at)`), GIN on product tags (`0026`).

### 5.3 Query optimizations (application)

| Area                 | Change                                                              | File(s)                            |
| -------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| Entitlements         | `resolveAllEffectiveLimits()` — batched `ANY(limit_keys)`           | `lib/limit-resolution.js`          |
| Entitlements         | Parallel limits + features + addons + usage                         | `lib/subscription.js`              |
| Inventory list       | Single `usage` CTE vs 4× correlated subqueries                      | `restaurant-inventory.routes.js`   |
| Receiving pending    | LEFT JOIN anti-join + LIMIT 50                                      | receiving routes                   |
| Orders list          | Parallel list + count; skip DISTINCT when safe                      | `orders.routes.js`                 |
| Products list        | Cap limit 100; skip inventory aggregate unless needed               | `products.routes.js`               |
| Disputes             | LIMIT 50 default, max 100                                           | `disputes.service.js`              |
| Notifications        | Parallel list + unread count                                        | `notification.service.js`          |
| Pricing / staff docs | LIMIT 500 / 100                                                     | respective routes                  |
| Batch pricing        | `resolveProductPricesBatch`                                         | `resolve-product-price.service.js` |
| N+1 avoidance        | Documented in orders, chat, deals, driver-location, delivery-routes | various services                   |

### 5.4 Materialized views

**None deployed.** Precomputed tables: `usage_meter`, `tenant_usage`, `tenant_plan_snapshot` (audit/snapshot, not MVs).

### 5.5 EXPLAIN / slow query

- App-side slow query at 500ms; request breakdown at 800ms
- Migrations 0132/0138 document intended query plans
- No Postgres `log_min_duration_statement` in repo

---

## 6. Backend runtime section

### 6.1 Server entry (`apps/api/src/server.js`)

- Express + `http.createServer` + Socket.IO
- Middleware order: **timing → compression → helmet → cors → rate limits → parsers → …**
- Listens **before** migrations (healthcheck-friendly on Railway)
- Cron jobs: scheduled orders, billing, sandbox expiry, promotions, invitations, etc. (`lib/cron-runner.js`, advisory locks)

### 6.2 Request timing (`middlewares/request-timing.js`)

| Env                | Default | Effect                                                                                      |
| ------------------ | ------- | ------------------------------------------------------------------------------------------- |
| `SLOW_REQUEST_MS`  | 800     | `http.request.slow_breakdown` with auth/tenant/RBAC/subscription/query/serialization stages |
| `IDLE_PERF_LOG_MS` | 0       | If set (e.g. 500), logs `http.request.perf_sample` with cache hits/misses                   |

**No** `X-Response-Time` header.

### 6.3 Rate limiting (`express-rate-limit`)

| Limiter           | Prod max / 15min |
| ----------------- | ---------------- |
| Global            | 300              |
| Auth/register     | 30               |
| Public staff link | 10               |
| Public API        | 60               |
| Chat send         | 300              |
| Orders write      | 120              |
| Promotions write  | 80               |

`standardHeaders: true` (RateLimit-\* headers).

### 6.4 Body limits

- JSON / urlencoded: **10MB**
- Nginx proxy: **50MB**

### 6.5 Async / background (moved off request path)

| Flow                         | Pattern                                                 | File                  |
| ---------------------------- | ------------------------------------------------------- | --------------------- |
| Registration complete        | `void ensureKeycloakRealmRole`, `void sendNotification` | `register-account.js` |
| Reservation/promotion notify | fire-and-forget                                         | various routes        |
| Push notifications           | non-blocking                                            | `push.service.js`     |
| Socket init                  | `void initializeSocket`                                 | `server.js`           |

**Still synchronous:** staff portal Keycloak on create (`staff-portal-account.service.js`).

### 6.6 Auth in-memory caches (`lib/auth.js`)

- Keycloak config + JWKS cached in process (deduped concurrent load)

### 6.7 Keycloak HTTP timeout

- **10s** on OIDC requests

---

## 7. Frontend performance section

### 7.1 Vite (`apps/web/vite.config.ts`)

- `manualChunks`: `ui-vendor`, `router-vendor`, `redux-vendor`, `query-vendor`, `vendor`
- `resolve.dedupe` for React stack
- `optimizeDeps.include` for RTK Query + TanStack

### 7.2 Code splitting (`App.tsx`)

- **37 lazy routes** via `React.lazy` + `Suspense`
- Eager: login, register, invite accept, guards, layout

### 7.3 Prefetching

| Trigger               | Routes                                                                         | File                                   |
| --------------------- | ------------------------------------------------------------------------------ | -------------------------------------- |
| Post-auth 500ms delay | Dashboard, Orders, Staff, Inventory, Disputes, Reports, Products, Reservations | `Layout.tsx`                           |
| Sidebar hover/focus   | 11 common routes                                                               | `routeChunkPrefetch.ts`, `Sidebar.tsx` |

### 7.4 RTK Query tuning (`services/api.ts`)

- Global: 120s cache, no focus refetch
- Polling: 30s orders/receiving/reservations with `skipPollingIfUnfocused: true`
- Notifications: 60s; badge uses unread-count when socket connected
- Mutations: `refetchAppSession` on register, checkout, pay-now, unlock admin subscription
- Deduping: built-in RTK (same endpoint+args → one in-flight request)

### 7.5 TanStack Query

- Only `useOrdersCalendar.ts` in production (`staleTime: 5min`)
- Provider in `main.tsx` with default options

### 7.6 Memoization / virtualization

- Widespread `useMemo` in heavy pages (Staff, Cart, Calendar, Layout)
- **No** list virtualization library detected (e.g. react-window) — calendar uses pagination in UI

### 7.7 Service worker (`static/sw.js`, `registerServiceWorker.ts`)

- Production only; dev clears SW
- Precache offline/manifest/icons
- Navigate: network-first with offline fallback
- Push notification handlers

### 7.8 WebSocket (`lib/socket.js`)

- Redis adapter when `REDIS_URL` set
- Events: chat, `notification_new`, `entitlements_refresh`
- Reduces need for aggressive notification list polling when connected

---

## 8. Infrastructure / deployment section

### 8.1 Railway

| File                                                      | Notes                                    |
| --------------------------------------------------------- | ---------------------------------------- |
| `apps/api/railway.json`                                   | Healthcheck `/health`, timeout 120s      |
| `apps/web/railway.json`                                   | Docker nginx, healthcheck `/health`      |
| `deploy/railway/{dev,staging,preprod,production}/api.env` | Pool, keepalive, slow request thresholds |
| `deploy/railway/*/secrets.env.example`                    | `REDIS_URL` placeholder                  |

**Recommendations (documented):** same region API+Postgres, min 1 replica (no scale-to-zero), private `DATABASE_URL`, `NODE_ENV=production`, Redis on API.

### 8.2 Docker

- `apps/api/Dockerfile` — Node 22 Alpine
- `apps/web/Dockerfile` — pnpm build → nginx:alpine
- `deploy/docker-compose.*.yml` — full stack with nginx reverse proxy

### 8.3 Health / readiness

- `/health` — liveness (responds during migrations)
- `/ready` — `SELECT 1`
- Dev: pool stats on health when `MEMORY_HEALTH_EXPOSE`

### 8.4 Static serving

- Web container: nginx SPA `try_files`, 1y immutable hashed assets
- API: no static file serving for app shell

### 8.5 Cold start mitigation

- Pool warmup on boot
- DB keepalive every 60s
- Keycloak config pre-warm
- HTTP server listens before heavy startup tasks

---

## 9. Feature-by-feature performance notes

### 9.1 auth/me

| Mechanism             | Detail                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `user:sub` cache      | 300s; singleflight; **must** invalidate on role change                                      |
| Tenant profile cache  | `tenant:profile:{type}:{id}` 300s for supplier/restaurant row on `/auth/me`                 |
| Tenant context bundle | `tctx` when `canUseCrossRequestTenantCaches` true                                           |
| Frontend              | `getMe` RTK 120s; `refetchAppSession` after register/invite                                 |
| Risk                  | Stale `PENDING` role if `user:sub` not cleared — Phase 1 fix via `invalidateUserAuthCaches` |

### 9.2 Registration / activation / free plan

| Mechanism              | Detail                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Async Keycloak + email | `register-account.js` — response after DB + cache invalidation only                         |
| Hub invalidation       | `invalidateUserAuthCaches` post-transaction                                                 |
| Billing                | `applyFreePlan` → `invalidateBillingSubscriptionCache`                                      |
| Frontend               | `RegisterCompletePage`, `AccountActivationPage`, `activateFreePlan.ts`, `refetchAppSession` |
| Before/after           | ~43s register complete → seconds                                                            |

### 9.3 Billing status

| Mechanism                      | Detail                                              |
| ------------------------------ | --------------------------------------------------- |
| `billingSub:{tenantId}:{type}` | 180s cache + singleflight                           |
| Middleware fast path           | 1 query when unlocked                               |
| Checkout/pay-now               | Awaited cache invalidation on server                |
| Frontend                       | `getBillingStatus` 120s RTK; refetch after checkout |

### 9.4 Entitlements

| Mechanism                | Detail                                                 |
| ------------------------ | ------------------------------------------------------ |
| Batched limit resolution | 2 queries vs N×2                                       |
| Full payload cache       | `ent:{type}:{tenantId}` 300s                           |
| Before/after             | ~6.6s → 400–900ms cold, 50–200ms hit                   |
| Socket                   | `entitlements_refresh` event can prompt client refresh |

### 9.5 Dashboard stats

| Mechanism | Detail                                                                                  |
| --------- | --------------------------------------------------------------------------------------- |
| Route     | `GET /api/admin/dashboard` — role-aware                                                 |
| Caching   | No dedicated response cache documented; relies on underlying tenant/subscription caches |
| Frontend  | `getDashboardStats` RTK 120s                                                            |

### 9.6 Supplier catalog / products

| Mechanism             | Detail                                         |
| --------------------- | ---------------------------------------------- |
| Categories/tags cache | 300s, **no invalidation** on catalog mutate    |
| Product list          | LIMIT cap 100; conditional inventory aggregate |
| Indexes               | 0140 product supplier/category                 |
| Frontend              | Categories/tags RTK 300s                       |

### 9.7 Orders

| Mechanism | Detail                                                                                      |
| --------- | ------------------------------------------------------------------------------------------- |
| List      | Parallel count; optimized joins; indexes 0038, 0138, 0140                                   |
| Polling   | 30s with unfocus skip                                                                       |
| Calendar  | **Double cache**: RTK 5min (TanStack) + server `orders-calendar:*` 300s **no invalidation** |

### 9.8 Cart

| Mechanism                 | Detail                                                     |
| ------------------------- | ---------------------------------------------------------- |
| localStorage persistence  | `cartPersistence.ts` — avoids re-building cart from server |
| No server-side cart cache |                                                            |

### 9.9 Command center

| Mechanism | Detail                                                            |
| --------- | ----------------------------------------------------------------- |
| Route     | `GET /api/supplier-ops/command-center`                            |
| Service   | `supplier-command-center.service.js` — aggregates KPIs            |
| Caching   | No dedicated cache layer; benefits from general middleware caches |

### 9.10 Notifications

| Mechanism             | Detail                                              |
| --------------------- | --------------------------------------------------- |
| Unread count endpoint | 30s cache; badge polls this when socket up          |
| List cache            | 25s for fixed limit/offset keys                     |
| Indexes               | 0138 notification user+created, partial unread      |
| Polling reduction     | Unified RTK cache key `{ limit: 25 }`; 60s interval |

### 9.11 Staff

| Mechanism           | Detail                                                  |
| ------------------- | ------------------------------------------------------- |
| List response cache | 45s per endpoint (`members`, `pto`, `swaps`, `payroll`) |
| Invalidation        | On staff mutations via middleware                       |
| Indexes             | 0140 staff_document                                     |

### 9.12 Admin dashboard

| Mechanism          | Detail                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Overview           | `buildAdminOverviewMetrics` — resilient per-query (partial on failure) |
| Subscription admin | Awaited cache invalidation on unlock/update                            |
| Pagination         | `parseAdminListPagination` limit max 100                               |

### 9.13 Tenant / branch switching

| Mechanism    | Detail                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Bypass       | `x-branch-id`, active-tenant cookie disable cross-request tenant caches |
| Frontend     | `BranchContext.tsx` — `resetApiState()` on switch                       |
| Invalidation | Hub on role/invitation changes                                          |

### 9.14 Impersonation

| Mechanism  | Detail                                                    |
| ---------- | --------------------------------------------------------- |
| Bypass     | `canUseCrossRequestTenantCaches` false when impersonating |
| Billing    | Admin bypasses lock unless impersonating                  |
| Cache keys | Still user/tenant scoped — no cross-tenant key sharing    |

---

## 10. Risk table

| ID  | Risk                                   | Severity     | Mechanism                                          | Mitigation                                               |
| --- | -------------------------------------- | ------------ | -------------------------------------------------- | -------------------------------------------------------- |
| R1  | Multi-replica without Redis            | **Critical** | Memory cache per process                           | Set `REDIS_URL` on all API replicas                      |
| R2  | Stale `user:sub` after role change     | **High**     | 300s TTL                                           | Always call `invalidateUserAuthCaches` on auth mutations |
| R3  | TTL-only caches never invalidated      | **High**     | productCats, productTags, orders-calendar, orgbill | Phase 2+ targeted invalidation                           |
| R4  | Duplicate subscription keys            | **Medium**   | `sub:*` vs `billingSub:*`                          | Use `invalidateTenantSubscriptionCache` hub              |
| R5  | Memory cache unbounded                 | **Medium**   | No LRU on fallback                                 | Monitor RSS; prefer Redis                                |
| R6  | Singleflight process-local             | **Medium**   | Thundering herd on cold replica                    | Redis + singleflight together                            |
| R7  | RTK 120s auth shell staleness          | **Medium**   | If refetch missed                                  | `refetchAppSession` on sensitive flows                   |
| R8  | Billing job grace lock no cache clear  | **Medium**   | subscription-billing.job                           | Add invalidation on lock path                            |
| R9  | Double gzip (nginx + Express)          | **Low**      | Docker compose                                     | Railway direct or nginx config                           |
| R10 | Notification partial list invalidation | **Low**      | Only limit 25/50 offset 0                          | Short TTL (25s) bounds staleness                         |
| R11 | index.html no cache header             | **Low**      | SPA shell                                          | Accept or add no-cache for HTML                          |
| R12 | Impersonation + cache bypass gaps      | **Low**      | New cache paths must call bypass check             | Test with impersonation                                  |

---

## 11. What we must NOT remove because it gave us speed

1. **DB pool `min: 2` + `allowExitOnIdle: false` + warmup + keepalive** — eliminates 100–400ms cold connects
2. **Skip role bootstrap when roles exist** — saves 3–4 queries/request
3. **Billing middleware fast path** — saves 2 queries on &gt;99% of requests
4. **`user:sub` + `tctx` + permission caches + singleflight** — core auth path speed
5. **Entitlements batching + `ent:*` cache** — 6.6s → sub-second
6. **`billingSub` / `sub` caches + per-request subscription memo** — deduplicates middleware
7. **Express `compression()`** — major TTFB improvement on large JSON
8. **CORS `maxAge: 600`** — removes repeated OPTIONS
9. **Migrations 0138–0140** — index-backed list/sort paths
10. **Frontend: `skipPollingIfUnfocused`, unread-count, RTK 120s global, route prefetch, vendor chunks**
11. **Registration async Keycloak/email** — unblocks signup UX
12. **Redis when running multiple replicas** — shared cache coherence
13. **Request timing / slow breakdown logging** — essential for regression detection
14. **Staff list cache + notification unread endpoint** — staff tab and badge performance
15. **`refetchAppSession` + `invalidateUserAuthCaches`** — correctness without sacrificing cache TTLs

---

## 12. What needs safer invalidation or guardrails

| Item                                  | Current state  | Recommended guardrail                                     |
| ------------------------------------- | -------------- | --------------------------------------------------------- |
| `productCats` / `productTags`         | TTL-only 300s  | Invalidate on product/category/tag CRUD                   |
| `orders-calendar:*`                   | TTL-only 300s  | Invalidate on order create/update/cancel                  |
| `orgbill:*`                           | TTL-only 300s  | Invalidate on org/branch billing mapping change           |
| Billing job account lock              | No cache clear | Await `invalidateTenantSubscriptionCache` + log           |
| New cache keys                        | Ad-hoc         | Route through hub or document invalidation                |
| Auth mutations                        | Hub exists     | Lint/test: any `UPDATE app_user.role` must call hub       |
| Multi-replica deploy                  | Optional Redis | CI/deploy check: warn if `REDIS_URL` missing in prod      |
| Cache bypass for impersonation/branch | Implemented    | Required in code review for new caches                    |
| RTK auth endpoints                    | 120s           | Keep `refetchAppSession` on all access-changing mutations |
| Memory fallback                       | Silent degrade | Alert when Redis disconnected in production               |

---

## 13. Recommended next steps

1. **Operational:** Confirm `REDIS_URL`, pool env vars, and migrations 0138–0140 on all Railway environments; min 1 API replica; same region as Postgres.
2. **Observability:** Enable `IDLE_PERF_LOG_MS=500` temporarily after deploys; watch `http.request.slow_breakdown` and `db.query.slow`.
3. **Cache Phase 2** (from cache audit): TTL-only invalidation for catalog meta, orders calendar, org billing — **do not remove caches**, add targeted `deleteCache`.
4. **Tests:** Expand integration tests for invalidation paths (already started in Phase 1 cache fix).
5. **Billing job:** Add awaited invalidation when grace lock fires.
6. **Documentation:** Keep this file updated when adding new caches or performance paths.
7. **HAR validation:** Re-run first-open vs repeat navigation benchmarks after each phase.
8. **Optional:** `Server-Timing` header for dev/staging only (no behavior change).
9. **Optional:** PgBouncer if connection count becomes bottleneck (not required at current pool max 20).
10. **Do not:** Remove compression, pool warmth, middleware skips, or entitlements batching without replacement.

---

## Appendix A — Source documents

| Document                                            | Content                                |
| --------------------------------------------------- | -------------------------------------- |
| `docs/operations/railway-performance-report.md`     | Phases 1–7, 9 with before/after tables |
| `docs/cache-audit/CACHE_AUDIT_CURRENT_STATE.md`     | Full cache inventory and conflicts     |
| `docs/cache-audit/CACHE_FIX_PLAN.md`                | Phased cache correctness plan          |
| `docs/archive/audits/performance-audit.md`          | Earlier audit                          |
| `docs/archive/audits/production-readiness-audit.md` | EXPLAIN recommendations                |

---

## Appendix B — Environment variables (performance-related)

```env
# Database
DATABASE_POOL_MAX=20
DATABASE_POOL_IDLE_TIMEOUT_MS=600000
DB_KEEPALIVE_ENABLED=true
DB_KEEPALIVE_INTERVAL_SECONDS=60
DATABASE_STATEMENT_TIMEOUT=          # optional

# Cache
REDIS_URL=                           # strongly recommended multi-replica

# Observability
SLOW_REQUEST_MS=800
IDLE_PERF_LOG_MS=0                   # set 500 for sampling
LOG_SQL=                             # must NOT be 1 in prod
ENABLE_REQUEST_LOGGING=false

# Rate limit
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=300
RATE_LIMIT_WINDOW_MS=900000
```

---

_End of performance current state inventory._
