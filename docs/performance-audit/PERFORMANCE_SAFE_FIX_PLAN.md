# Supplify Performance-Safe Fix Plan

**Status:** Proposal only — no application code changes in this document.  
**Date:** 2026-06-04  
**Goal:** Preserve speed gains (~6s → &lt;1.5s on many APIs) while eliminating stale auth, billing, RBAC, and catalog data.

**Prerequisite reading:**

| Document                                                                                   | Role                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| [PERFORMANCE_CURRENT_STATE.md](./PERFORMANCE_CURRENT_STATE.md)                             | Full inventory of what makes the app fast |
| [../cache-audit/CACHE_AUDIT_CURRENT_STATE.md](../cache-audit/CACHE_AUDIT_CURRENT_STATE.md) | Cache keys, gaps, risk table              |
| [../cache-audit/CACHE_FIX_PLAN.md](../cache-audit/CACHE_FIX_PLAN.md)                       | Detailed cache remediation steps          |

**Guiding principle:** Fix correctness through **targeted invalidation, guardrails, and tests** — not by removing performance layers.

---

## Executive summary

Supplify’s latency improvement comes from **stacked optimizations** (pool warmth, middleware fast paths, Redis + singleflight, entitlements batching, compression, indexes, frontend RTK tuning, prefetching, async registration). Removing or weakening any layer without benchmarking risks regressing to 4–7s API times.

The remaining problems are **mostly invalidation gaps** on otherwise-good caches (`orgbill`, catalog meta, orders calendar) and **client/server coherence** after auth-changing mutations. This plan sequences fixes so each phase:

1. Adds invalidation or refetch where stale data appears.
2. Keeps all performance mechanisms intact.
3. Is measured, tested, and independently rollbackable.

**Partial progress:** Cache Fix Plan Phase 1 items (auth hub, tenant-roles invalidation, registration async, `refetchAppSession`, logout `resetApiState`, job await logging) are **partially or fully implemented** in the codebase. Phases A–C below consolidate remaining Phase 1 work plus observability; Phases D–F align with Cache Fix Plan Phases 2–6.

---

## 1. What must never be removed without benchmarking

These mechanisms are **load-bearing for performance**. Do not disable, revert, or “simplify away” without before/after p95 measurements on the [benchmark checklist](#5-benchmark-checklist) and explicit sign-off.

| Mechanism                               | Location                                                               | Why it matters                                  | If removed (expected regression)                         |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| **DB pool `min: 2`**                    | `apps/api/src/lib/db.js`                                               | Keeps warm TCP/TLS connections                  | +100–400ms per request after idle                        |
| **Pool warmup on boot**                 | `warmupPool()` in `server.js`                                          | First request after deploy avoids cold connect  | +200–800ms first API hit                                 |
| **DB keepalive (`SELECT 1` every 60s)** | `startPoolKeepalive()`                                                 | Railway/proxy idle disconnect mitigation        | Intermittent slow bursts after 30s–5min idle             |
| **`allowExitOnIdle: false`**            | `db.js`                                                                | Prevents pool draining to zero                  | Same as cold connect                                     |
| **Redis (`REDIS_URL`)**                 | `lib/cache.js`                                                         | Cross-replica cache sharing + coherence         | Divergent stale reads per replica; duplicate DB load     |
| **Memory fallback (not replacement)**   | `cache.js`                                                             | Graceful degrade when Redis blips               | Keep as fallback only — do not prefer over Redis in prod |
| **singleflight**                        | `lib/singleflight.js`                                                  | Coalesces concurrent cache misses               | Thundering herd on hot keys                              |
| **Per-request memoization**             | `req._requestTenantCache`, `req._rolesMemo`, `req.billingSubscription` | Avoid duplicate work in one HTTP request        | +2–5 redundant queries per request                       |
| **RBAC role-bootstrap skip**            | `lib/rbac.js`                                                          | Skip `ensureTenantSystemRoles` when roles exist | +3–4 DB queries per authenticated request                |
| **Auth/RBAC caches**                    | `user:sub`, `tctx`, `perms`, `roles`, `tenant:req`, `ws:assign`        | Hot path for every API call                     | Return to multi-second `/auth/me` and middleware         |
| **Billing middleware fast path**        | `middlewares/billingAccess.js`                                         | 1 query when unlocked vs 3                      | +2 queries on &gt;99% of requests                        |
| **Entitlements batching**               | `lib/limit-resolution.js`, `lib/subscription.js`                       | 2 batched limit queries vs N×2                  | `/api/entitlements` back toward ~6.6s                    |
| **Entitlements cache (`ent:*`)**        | `lib/subscription.js`                                                  | 50–200ms on cache hit                           | +400–900ms every entitlements load                       |
| **Subscription/billing caches**         | `sub:*`, `billingSub:*`                                                | Dedup middleware + billing status               | Stacked subscription queries per request                 |
| **Express `compression()`**             | `server.js`                                                            | gzip JSON on wire                               | Large lists 5–20× slower TTFB on slow networks           |
| **CORS `maxAge: 600`**                  | `server.js`                                                            | Preflight cache 10 min                          | +~200ms OPTIONS per new endpoint per session             |
| **Frontend RTK Query cache**            | `apps/web/src/services/api.ts`                                         | Global 120s; shell endpoints tuned              | Request storm; 2–3s repeat navigations                   |
| **Route prefetching**                   | `Layout.tsx`, `routeChunkPrefetch.ts`                                  | Preloads top route chunks                       | +500–1500ms first navigation per page                    |
| **Vite vendor chunking**                | `vite.config.ts`                                                       | Stable shared chunks                            | Re-download libs per route                               |
| **Lazy route splitting**                | `App.tsx`                                                              | Smaller initial bundle                          | Larger first paint                                       |
| **Service worker static cache**         | `static/sw.js`                                                         | Cache-first hashed assets                       | Slower repeat visits (not API-related)                   |
| **DB indexes (0138–0140 + prior)**      | `apps/api/db/migrations/`                                              | Index-backed sorts/filters                      | 500–980ms scans on lists                                 |
| **Query optimizations**                 | inventory CTE, parallel list+count, LIMITs                             | Bounded SQL cost                                | Full table scans; unbounded rows                         |
| **Async registration work**             | `register-account.js`                                                  | Keycloak/email off hot path                     | ~43s blocking `POST /api/register/complete`              |
| **Notification unread-count endpoint**  | `notifications.routes.js`                                              | COUNT vs full list when socket up               | Heavier polling payload                                  |
| **`skipPollingIfUnfocused`**            | web hooks/pages                                                        | No poll storm on background tabs                | +3–5 req/min/user wasted                                 |
| **Request timing / slow breakdown**     | `request-timing.js`                                                    | Regression detection                            | Blind to latency regressions                             |

**Benchmark gate:** Any PR that removes or materially weakens an item above must include p95 before/after for `/auth/me`, `/api/entitlements`, and one list endpoint (orders or products).

---

## 2. What can be safely fixed with targeted invalidation

These are **correctness fixes that preserve caches**. Pattern: **invalidate on write** (server) + **force refetch on sensitive mutation** (client) — never “turn off caching.”

### 2.1 Auth / user access (`user:sub` and related)

| Trigger                         | Server action                                                                                         | Client action                             | Hub               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------- |
| Registration complete           | `invalidateUserAuthCaches({ userId, keycloakSub, tenantId, tenantType })`                             | `refetchAppSession`                       | `access-cache.js` |
| Invitation accept               | Same via `assignInvitationTenantRole` / accept handlers                                               | `resetApiState` + `refetchAppSession`     | hub               |
| Tenant role assign/revoke       | `invalidateUserAuthCaches` (not permission-only)                                                      | Staff UI: navigate or invalidate User tag | hub               |
| Role permission template update | `invalidateUserAuthCaches` per affected `tenant_user_roles` row                                       | —                                         | hub               |
| Admin user role/password reset  | `invalidateUserBySubCache` or hub                                                                     | —                                         | audit grep        |
| Org permission bulk change      | Keep `invalidateRestaurantOrgPermissionCaches` / `invalidateOrgPermissionCaches`; hub for direct user | —                                         | both              |

**Keys cleared by hub:** `user:sub:*`, `perms:*`, `roles:*`, `tctx:*`, `ws:assign:*`, `tenant:req:*`, `sub:*`, `ent:*`, `billingSub:*`.

### 2.2 Subscription / billing (`sub`, `billingSub`, `ent`)

| Trigger                          | Server action                                              | Notes                     |
| -------------------------------- | ---------------------------------------------------------- | ------------------------- |
| Checkout / pay-now               | `await invalidateTenantSubscriptionCache`                  | Already on billing routes |
| Free plan activation             | `invalidateBillingSubscriptionCache` + hub path            | `billing-service.js`      |
| Admin unlock / subscription edit | `await invalidateTenantSubscriptionCache`                  | admin-dashboard routes    |
| Feature flag override            | `invalidateFeatureFlagCache` (also clears `ent`)           |                           |
| Auto-renewal job success         | `await invalidateTenantSubscriptionCache` + log on failure | subscription-billing job  |
| Free sandbox expiry lock         | `await invalidateTenantSubscriptionCache` + log on failure | free-sandbox-expiry job   |
| Grace-period account lock        | **Add** awaited invalidation (gap)                         | subscription-billing job  |

**Rule:** Always use `invalidateTenantSubscriptionCache(tenantId, tenantType)` — never delete `sub` or `billingSub` alone.

### 2.3 Org billing mapping (`orgbill:*`) — TTL-only today

| Trigger                   | Proposed invalidator                              |
| ------------------------- | ------------------------------------------------- |
| Org create / restructure  | `invalidateOrgBillingCache(tenantId, tenantType)` |
| Main-branch flag change   | Same for org + affected branches                  |
| Branch create/delete/link | Same for branch tenant ids                        |

**Do not remove** the 300s cache — add `deleteCache` on writes only.

### 2.4 Catalog meta (`productCats`, `productTags`) — TTL-only today

| Trigger                      | Proposed invalidator                             |
| ---------------------------- | ------------------------------------------------ |
| Product create/update/delete | `invalidateCatalogMetaCache(supplierId)`         |
| Category/tag admin mutations | Same + `'all'` variant when global list affected |

**Do not remove** 300s Redis cache — writes are rare vs reads.

### 2.5 Orders calendar (`orders-calendar:*`) — TTL-only today

| Strategy                            | Performance                                                                                         | Correctness                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Option A (preferred for safety)** | Keep TanStack 5min stale; **remove Redis layer** only after benchmark shows acceptable calendar p95 | Immediate client freshness via TanStack; slightly more DB on calendar views                                                |
| **Option B (preferred for speed)**  | Keep Redis 300s                                                                                     | Add `invalidateOrdersCalendarForTenant(tenantId, tenantType)` on order create/update/cancel + TanStack `invalidateQueries` |

**Do not remove both layers without benchmarking.**

### 2.6 Client coherence (no server TTL change required)

| Flow                                           | Client action                                        |
| ---------------------------------------------- | ---------------------------------------------------- |
| Registration / activation / checkout / pay-now | `refetchAppSession` (already wired on mutations)     |
| Invite accept                                  | `resetApiState` + `refetchAppSession`                |
| Logout                                         | `api.util.resetApiState()` before redirect           |
| Branch switch                                  | `resetApiState` + reload (existing)                  |
| Admin unlock (when affecting current session)  | `refetchAppSession` or socket `entitlements_refresh` |

---

## 3. What should NOT be done

Explicit anti-patterns — these “fix staleness” by destroying performance:

| Anti-pattern                                                                    | Why it is harmful                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Remove Redis / stop setting `REDIS_URL`**                                     | Per-replica memory caches; stale divergence; lost cross-replica invalidation |
| **Remove Express `compression()`**                                              | Large JSON payloads dominate TTFB on Railway                                 |
| **Disable RTK Query caching globally** (`keepUnusedDataFor: 0`, always refetch) | Request storm; 2–3s navigations; server load multiplier                      |
| **Lower all TTLs aggressively** (e.g. everything → 10s)                         | Defeats caching purpose; +DB load without fixing missed invalidations        |
| **Remove frontend route prefetching**                                           | First-open pages regress 500–1500ms                                          |
| **Remove DB pool warmup / keepalive / `min: 2`**                                | Cold connect penalty returns (~980ms baseline symptoms)                      |
| **Drop performance indexes (0138–0140)**                                        | List/sort queries return to full scans                                       |
| **Replace targeted invalidation with global `FLUSHALL` or full cache clear**    | Thundering herd; temporary outage of all cache benefit                       |
| **Make every read uncached “to be safe”**                                       | Unsustainable at current traffic; negates months of optimization             |
| **Revert async registration** (await Keycloak before 201)                       | 43s signup blocking returns                                                  |
| **Remove billing fast path** (always call full `getBillingStatus`)              | +2 DB queries per request                                                    |
| **Remove entitlements batching** (sequential per-limit queries)                 | 6.6s entitlements returns                                                    |
| **Remove RBAC bootstrap skip**                                                  | +3–4 queries per request forever                                             |
| **Remove singleflight**                                                         | Concurrent cache misses duplicate expensive work                             |
| **Remove CORS `maxAge`**                                                        | OPTIONS storm on SPA navigations                                             |

**If staleness persists after targeted invalidation:** add tests and fix the missing write-path hook — do not widen the anti-pattern.

---

## 4. Safe implementation phases

Phases are **sequential but independently deployable**. Complete benchmark checklist (Section 5) before marking a phase done.

---

### Phase A — Guardrails and measurement

**Maps to:** Cache Fix Plan Phase 0 + performance inventory Section 13.

**Purpose:** Prove the performance stack is active in each environment before changing invalidation behavior.

| Step | Action                                                                                                                                                | Files / config                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| A.1  | Confirm `REDIS_URL` set on **all** Railway API services (staging, preprod, production)                                                                | Railway dashboard; `deploy/railway/*/secrets.env.example` |
| A.2  | Confirm DB pool envs: `DATABASE_POOL_MAX=20`, `DATABASE_POOL_IDLE_TIMEOUT_MS=600000`, `DB_KEEPALIVE_ENABLED=true`, `DB_KEEPALIVE_INTERVAL_SECONDS=60` | `deploy/railway/production/api.env`                       |
| A.3  | Confirm migrations **0138, 0139, 0140** applied in each environment                                                                                   | Migration logs / `RUN_MIGRATIONS_ON_START`                |
| A.4  | Enable staging observability temporarily: `IDLE_PERF_LOG_MS=500`, monitor `http.request.slow_breakdown` and `db.query.slow`                           | Railway staging env                                       |
| A.5  | Add `/health` field `redisCache: true/false` (if not present)                                                                                         | health route                                              |
| A.6  | **Baseline benchmark run** — record p50/p95 for checklist endpoints (Section 5)                                                                       | Spreadsheet or doc appendix                               |
| A.7  | Document “performance stack checklist” in PR template                                                                                                 | `.github` or `docs/performance-audit/`                    |

**Exit criteria:** Staging logs show Redis connected; pool warmup on boot; baseline p95 documented; no env missing pool/Redis in production.

| Risk control       | Detail                                            |
| ------------------ | ------------------------------------------------- |
| Performance impact | **None** (read-only verification)                 |
| Stale data fixed   | **None yet** — measurement only                   |
| Rollback           | N/A                                               |
| Tests required     | Smoke: `/health`, `/ready`, one authenticated GET |

---

### Phase B — Auth / session correctness

**Maps to:** Cache Fix Plan Phase 1 (remaining items) + Phase 4 (partial).

**Purpose:** Fix stale `user:sub`, permissions, and client auth shell after access-changing flows **without removing auth caches**.

| Step | Action                                                                                    | Status note                                                |
| ---- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| B.1  | Grep audit: every `UPDATE app_user SET role` → `invalidateUserAuthCaches`                 | Verify no gaps                                             |
| B.2  | `tenant-roles.routes.js`: hub on assign + permission template update                      | **Implemented** — verify in prod                           |
| B.3  | Consolidate duplicate invalidation in `register-account.js` (keep org caches)             | **Implemented** — verify tests                             |
| B.4  | `refetchAppSession` after: registration, activation, checkout, pay-now, invite accept     | **Mostly implemented** — verify admin unlock if applicable |
| B.5  | Logout: `dispatch(api.util.resetApiState())` before redirect                              | **Implemented**                                            |
| B.6  | Keep RTK `keepUnusedDataFor: 120` on auth shell — **do not** reduce further without cause | Current policy                                             |
| B.7  | Integration tests: register → role ≠ PENDING; role assign → permissions update            | Extend API + web tests                                     |

**Exit criteria:** Signup + activation lands in app without double refresh; role change visible on next navigation; logout does not leak prior user RTK data.

| Risk control       | Detail                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Performance impact | **Neutral to positive** — invalidation only on writes; auth cache hits unchanged on normal reads                                |
| Stale data fixed   | `user:sub`, `tctx`, `perms`, `roles`, client `getMe` / `getRegisterStatus`                                                      |
| Rollback           | Revert invalidation calls only — **do not** remove caches; worst case stale window returns                                      |
| Tests required     | `access-cache.test.js`, `register-account.test.js`, `tenant-roles.routes.test.js`, `refetchAppSession.test.js`, logout RTK test |

---

### Phase C — Subscription / billing correctness

**Maps to:** Cache Fix Plan Phase 2 (partial) + job fixes.

**Purpose:** Ensure `sub`, `billingSub`, and `ent` stay coherent after billing events **without removing subscription caches or billing fast path**.

| Step | Action                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| C.1  | **Canonical rule:** all subscription mutations call `invalidateTenantSubscriptionCache` (never isolated key deletes) |
| C.2  | Verify billing routes + admin-dashboard await invalidation                                                           | **Implemented** — regression test                   |
| C.3  | Jobs: `await invalidateTenantSubscriptionCache` + structured error log (not `.catch(() => {})`)                      | **Partially implemented** — add grace **lock** path |
| C.4  | `applyFreePlan` / checkout / pay-now: server invalidation + client `refetchAppSession`                               | Verify end-to-end                                   |
| C.5  | Unit test: `invalidateTenantSubscriptionCache` clears `sub`, `ent`, `billingSub`                                     | **Implemented** — keep in CI                        |
| C.6  | Document hub in code comment or `INVALIDATION_CHECKLIST.md`                                                          | Phase F                                             |

**Exit criteria:** After checkout/activation/unlock, `getBillingStatus` and `getEntitlements` reflect new state within one client refetch; jobs log invalidation failures clearly.

| Risk control       | Detail                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| Performance impact | **Low** — invalidation on rare writes; billing middleware fast path **unchanged** |
| Stale data fixed   | Locked/unlocked billing state, plan changes, trial expiry                         |
| Rollback           | Revert job await changes independently                                            |
| Tests required     | `subscription.test.js`, billing route tests, job tests                            |

---

### Phase D — TTL-only cache invalidation

**Maps to:** Cache Fix Plan Phase 2 (org billing) + Phase 3 (catalog + calendar).

**Purpose:** Close invalidation gaps **without removing caches** unless Option A calendar benchmark proves safe.

| Step | Action                                                                                       |
| ---- | -------------------------------------------------------------------------------------------- |
| D.1  | Implement `invalidateOrgBillingCache(tenantId, tenantType)` → delete `orgbill:{type}:{id}`   |
| D.2  | Call from org/branch/main-branch mutation routes                                             |
| D.3  | Implement `invalidateCatalogMetaCache(supplierId)` → delete `productCats:*`, `productTags:*` |
| D.4  | Call from product/category/tag write handlers                                                |
| D.5  | Orders calendar — choose Option A or B (Section 2.5); **benchmark before removing Redis**    |
| D.6  | Tests: product create → categories update; org change → billing tenant resolution update     |

**Exit criteria:** Catalog edits visible within one request; org billing mapping fresh after branch changes; calendar strategy documented with measured p95.

| Risk control       | Detail                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance impact | **Negligible** for catalog/org (writes rare). Calendar Option A: +DB load on calendar GET — measure; Option B: none if invalidation correct |
| Stale data fixed   | productCats/productTags, orgbill, orders-calendar                                                                                           |
| Rollback           | Option A: re-enable Redis calendar cache. Option B: remove invalidator calls only                                                           |
| Tests required     | New invalidator unit tests; route integration tests                                                                                         |

---

### Phase E — Frontend cache safety

**Maps to:** Cache Fix Plan Phase 5.

**Purpose:** Keep RTK/TanStack performance tuning; add refetch **only** where mutations change identity or billing.

| Step | Action                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| E.1  | **Keep** global RTK `keepUnusedDataFor: 120`, `refetchOnFocus: false`                                                      |
| E.2  | **Keep** longer TTL (300s) on stable catalog/branches/roles endpoints                                                      |
| E.3  | Maintain `refetchAppSession` on sensitive mutations (checklist in 2.6)                                                     |
| E.4  | Do **not** globally lower TTLs — use mutation-driven refetch                                                               |
| E.5  | If TanStack calendar kept: wire `queryClient.invalidateQueries` from order mutation `onQueryStarted` when Phase D Option B |
| E.6  | Tag audit: billing mutations invalidate `Billing` + `Subscription` tags                                                    |

**Exit criteria:** No auth-shell endpoint at 600s with refetch disabled unless documented; tab refocus does not storm API; activation flows still one-shot refetch.

| Risk control       | Detail                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| Performance impact | **Neutral** — refetch only on mutations (~4 GETs per activation, not per page) |
| Stale data fixed   | Client-side billing/entitlements/me after writes                               |
| Rollback           | Remove specific `onQueryStarted` hooks — caches remain                         |
| Tests required     | `refetchAppSession.test.ts`, mutation integration tests                        |

---

### Phase F — Tests and documentation

**Maps to:** Cache Fix Plan Phase 6.

| Step | Action                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F.1  | Create `docs/cache-audit/INVALIDATION_CHECKLIST.md` for PR authors                                                                         |
| F.2  | PR checklist items: new `setCache(` → paired invalidator; auth mutation → hub; subscription mutation → `invalidateTenantSubscriptionCache` |
| F.3  | Expand testing matrix (below) into CI-critical subset                                                                                      |
| F.4  | Fix stale TTL comments in code (rbac 180s, feature-flags 180s) — docs only alignment                                                       |
| F.5  | Update QA regression checklist with cache-sensitive flows                                                                                  |
| F.6  | Optional CI grep: flag new `setCache` without `invalidate*` in same module                                                                 |

**Testing matrix (minimum):**

| Scenario                | Server assertion                                | Client assertion                           |
| ----------------------- | ----------------------------------------------- | ------------------------------------------ |
| Registration            | `user:sub` cleared                              | `getMe.role` ≠ PENDING before navigate     |
| Free plan activation    | `billingSub` unlocked                           | `getBillingStatus.pendingActivation` false |
| Checkout / pay-now      | `sub`, `ent`, `billingSub` cleared              | Billing UI updates after refetch           |
| Admin unlock            | same                                            | Entitlements/plan update                   |
| Role assign             | hub keys cleared                                | Permissions visible                        |
| Product create          | `productCats` cleared                           | Categories refetch                         |
| Order create (calendar) | calendar key cleared or TanStack invalidated    | Calendar updates                           |
| Logout                  | N/A                                             | RTK state empty                            |
| Multi-replica           | Redis key deleted once, visible on all replicas | N/A                                        |

**Exit criteria:** Checklist linked from CONTRIBUTING or PR template; CI runs invalidation unit tests on every PR.

| Risk control       | Detail                      |
| ------------------ | --------------------------- |
| Performance impact | **None**                    |
| Stale data fixed   | Prevents future regressions |
| Rollback           | Docs-only                   |
| Tests required     | Full matrix over time       |

---

## 5. Benchmark checklist

Run **before Phase A baseline**, **after each phase**, and **before any PR that weakens Section 1 mechanisms**.

### 5.1 API endpoints (server-side)

Measure **p50 and p95** (minimum 20 requests each scenario). Use staging with production-like env (Redis, pool, migrations).

| Endpoint                                   | Scenarios to measure                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `GET /auth/me`                             | Cold first / warm repeat / after role mutation           |
| `GET /api/billing/status`                  | Cold / warm / after checkout or activation               |
| `GET /api/subscriptions/entitlements`      | Cold (cache miss) / warm (cache hit) / after plan change |
| `GET /api/products/categories` (+ tags)    | Warm / after product create                              |
| `GET /api/orders` (list)                   | Cold / warm / after new order                            |
| `GET /api/orders/calendar` (or equivalent) | Cold / warm / after order mutation                       |
| `GET /api/admin-dashboard/overview`        | Warm admin session                                       |
| `GET /api/supplier-ops/command-center`     | Warm supplier session                                    |
| `GET /api/notifications/unread-count`      | Warm / after mark-read                                   |
| `POST /api/register/complete`              | End-to-end duration (not p95 of GET)                     |
| Free plan activation flow                  | Time to navigable app                                    |

**Scenario definitions:**

| Scenario                   | How to reproduce                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| **Cold first request**     | New deploy or idle &gt;5 min; first hit to endpoint; note `dbConnectMs` in logs if present        |
| **Warm repeated request**  | Same session; 10 sequential identical GETs; report last 5 p95                                     |
| **After mutation request** | Perform write (role assign, product create, checkout); immediate GET; assert fresh data + latency |
| **Cache hit confirmation** | Check logs for `cacheHits` in `http.request.slow_breakdown` or staging metrics                    |

**Targets (warm pool + Redis, from performance inventory):**

| Request type               | p95 target                       |
| -------------------------- | -------------------------------- |
| Typical authenticated GET  | &lt; 800ms                       |
| Entitlements cache hit     | &lt; 200ms                       |
| Entitlements cache miss    | &lt; 900ms                       |
| Heavy list/report          | &lt; 1500ms                      |
| Registration complete POST | &lt; 5s (excluding user network) |

### 5.2 Browser (HAR)

| Measurement       | First-open                        | Repeat-open                     |
| ----------------- | --------------------------------- | ------------------------------- |
| Dashboard load    | HAR: TTFB + DOMContentLoaded      | Same route within 2 min         |
| Orders page       | HAR + chunk download time         | Sidebar navigation (prefetched) |
| Staff / Inventory | First nav cold chunk              | Hover-prefetched nav            |
| Activation flow   | Register → activate → land `/app` | N/A                             |

**Record:** total page load, largest API TTFB, number of API requests in first 10s, duplicate GETs to same endpoint.

### 5.3 Regression gate

If **any** of these regress by &gt;30% p95 vs Phase A baseline without documented cause, **stop rollout** and investigate before proceeding:

- `/auth/me` warm p95
- `/api/subscriptions/entitlements` warm hit p95
- `/api/orders` list warm p95
- Registration complete POST duration

---

## 6. Risk controls by phase

| Phase | Performance impact                    | Stale data risk addressed           | Rollback strategy                                                    | Tests required                                        |
| ----- | ------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| **A** | None                                  | None (measurement)                  | N/A                                                                  | Health smoke                                          |
| **B** | Neutral; write-path invalidation only | Auth, RBAC, registration, logout    | Revert invalidation calls; keep caches                               | access-cache, register, tenant-roles, refetch, logout |
| **C** | Low; jobs + billing writes only       | Subscription, billing, trial lock   | Revert job changes independently                                     | subscription.test, billing routes                     |
| **D** | Low (catalog/org); calendar TBD       | Catalog meta, org billing, calendar | Per-invalidator revert; calendar Option A rollback = re-enable Redis | New invalidator + route tests                         |
| **E** | Neutral; mutation refetch only        | Client billing/me/entitlements      | Remove `onQueryStarted` hooks                                        | refetchAppSession, mutation tests                     |
| **F** | None                                  | Future regressions                  | Docs revert                                                          | CI matrix subset                                      |

**Cross-cutting rollback principles:**

1. Never rollback by disabling Redis, compression, or pool warmth — fix forward.
2. Each phase is a separate deploy; cherry-pick revert commits per phase if needed.
3. Keep benchmark spreadsheet tagged with git SHA per phase.

---

## 7. Phase mapping to cache fix plan

| This plan | Cache Fix Plan      | Performance focus                      |
| --------- | ------------------- | -------------------------------------- |
| Phase A   | Phase 0             | Confirm speed stack is live            |
| Phase B   | Phase 1 + part of 4 | Auth correctness without cache removal |
| Phase C   | Phase 2 (partial)   | Subscription hub + jobs                |
| Phase D   | Phase 2 + 3         | TTL-only invalidation                  |
| Phase E   | Phase 5             | Client policy without global TTL slash |
| Phase F   | Phase 6             | Tests + PR guardrails                  |

---

## 8. Performance budget (invalidation work)

Expected cost of **correctness fixes** — acceptable if benchmarks stay within targets:

| Change                                | Expected impact                                      |
| ------------------------------------- | ---------------------------------------------------- |
| `invalidateUserAuthCaches` on writes  | Negligible; writes are rare vs reads                 |
| `refetchAppSession` (4 parallel GETs) | +4 requests per activation/checkout only             |
| Catalog/org invalidation              | Negligible                                           |
| Calendar Option B invalidation        | Negligible                                           |
| Calendar Option A (remove Redis)      | +DB time on calendar views — **must benchmark**      |
| Require Redis in production           | Slight latency vs pure memory; major consistency win |

**Do not fund correctness by:** disabling caching globally, shortening all TTLs, or removing compression.

---

## 9. Final recommendation

**Keep the full performance architecture.** The app is faster because of deliberate layering — pool warmth, middleware fast paths, Redis + singleflight, entitlements batching, compression, indexes, frontend RTK tuning, prefetching, and async registration. None of these should be removed to address staleness.

**Fix correctness through:**

1. **Targeted invalidation** on every write path that affects cached reads (`invalidateUserAuthCaches`, `invalidateTenantSubscriptionCache`, new catalog/org/calendar invalidators).
2. **Guardrails** — Redis required in multi-replica prod, health checks, PR invalidation checklist, benchmark gates.
3. **Tests** — server key deletion + client freshness after mutations.
4. **Surgical client refetch** — `refetchAppSession` and `resetApiState` on sensitive flows only, not global refetch.

**Implementation order:** A → B → C → D → E → F. Phases B and C are partially complete; verify in staging with the benchmark checklist, then proceed to D (highest remaining user-visible staleness: catalog meta, org billing, calendar).

**Success definition:** Same p95 latency as Phase A baseline **and** no stale auth, billing, or catalog data after mutations — measured, tested, and documented.

---

_End of performance-safe fix plan._
