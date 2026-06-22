# Supplify Cache Audit — Current State

**Audit date:** 2026-06-04  
**Scope:** Full codebase inspection (read-only). No behavior changes were made.  
**Context:** Recent registration/activation incidents exposed stale data across Redis, RTK Query, and overlapping subscription caches. This document inventories every cache layer, flags conflicts, and rates risk.

---

## Executive summary

Supplify uses **four distinct caching planes** that do not share a single invalidation contract:

| Plane                          | Technology                                     | Shared across API replicas?            |
| ------------------------------ | ---------------------------------------------- | -------------------------------------- |
| A. Redis / in-memory API cache | `apps/api/src/lib/cache.js`                    | Yes (Redis) / **No** (memory fallback) |
| B. In-process coalescing       | `apps/api/src/lib/singleflight.js`             | No (per Node process)                  |
| C. Per-request memoization     | `req._requestTenantCache`, `req._perf`         | No (single HTTP request)               |
| D. Browser client cache        | RTK Query + TanStack Query + localStorage + SW | Per browser tab/user                   |

**Highest-risk findings:**

1. **Critical — Auth/profile staleness:** `user:sub:*` cached 300s; historically not invalidated on registration (partially fixed via `access-cache.js`). Frontend `getMe` / `getBillingStatus` kept 600s with `refetchOnMountOrArgChange: false`.
2. **Critical — Catalog meta never invalidated:** `productCats:*` / `productTags:*` Redis keys (300s) have **no** `deleteCache` on product CRUD.
3. **High — Duplicate subscription rows in Redis:** `sub:TYPE:id` and `billingSub:id:TYPE` store the same logical data under different keys (unified invalidation exists in `invalidateTenantSubscriptionCache` but easy to miss on new code paths).
4. **High — Org billing mapping never invalidated:** `orgbill:TYPE:id` (300s) has **no** invalidation when org/main-branch changes.
5. **High — Orders calendar double-cache:** API Redis (300s) + TanStack Query `staleTime: 5min`; **no** invalidation on order mutations.
6. **High — Multi-replica without Redis:** In-memory fallback is **per replica** → divergent reads until TTL expires.
7. **Medium — RBAC/role assignment gaps:** `tenant-roles.routes.js` invalidates permissions but not `user:sub:*` or `tenant:req:*`.
8. **Medium — Logout / tenant switch inconsistency:** Branch switch does `resetApiState()` + reload; normal logout only invalidates `User` tag and redirects (may rely on full navigation).

Recent mitigations (already in tree, not yet universally deployed): `invalidateUserAuthCaches`, `refetchAppSession`, billing cache clearing in `invalidateTenantSubscriptionCache`, awaited admin invalidations.

---

## Cache map table

| ID  | Layer              | Key / mechanism                        | TTL              | Tenant-aware     | User/role-aware | Invalidation                                                              | Risk         |
| --- | ------------------ | -------------------------------------- | ---------------- | ---------------- | --------------- | ------------------------------------------------------------------------- | ------------ |
| C1  | Redis/memory       | `user:sub:{keycloakSub}`               | 300s             | No (user global) | Yes             | `invalidateUserBySubCache`, `invalidateUserAuthCaches`                    | **Critical** |
| C2  | Redis/memory       | `tenant:req:{userId}:{role}`           | 180s             | Yes              | Yes             | `invalidateRequestTenantCache`, `invalidateUserAuthCaches`                | High         |
| C3  | Redis/memory       | `ws:assign:{userId}:{tenantType}`      | 180s             | Yes              | Yes             | `invalidateWorkspaceAssignmentCache`, `invalidateUserAuthCaches`          | High         |
| C4  | Redis/memory       | `perms:{userId}:{tenantId}:{type}`     | 120s             | Yes              | Yes             | `invalidateUserPermissionCache`                                           | High         |
| C5  | Redis/memory       | `roles:{userId}:{tenantId}:{type}`     | 180s             | Yes              | Yes             | `invalidateUserPermissionCache`                                           | High         |
| C6  | Redis/memory       | `tctx:{userId}:{tenantId}:{type}`      | 120s             | Yes              | Yes             | `invalidateTenantContextCache` (via permission invalidation)              | High         |
| C7  | Redis/memory       | `sub:{type}:{tenantId}`                | 180s             | Yes              | No              | `invalidateTenantSubscriptionCache`                                       | High         |
| C8  | Redis/memory       | `billingSub:{tenantId}:{type}`         | 180s             | Yes              | No              | `invalidateBillingSubscriptionCache`, `invalidateTenantSubscriptionCache` | High         |
| C9  | Redis/memory       | `ent:{type}:{tenantId}`                | 300s             | Yes              | No              | `invalidateEntitlementsCache`, `invalidateTenantSubscriptionCache`        | High         |
| C10 | Redis/memory       | `orgbill:{type}:{tenantId}`            | 300s             | Yes              | No              | **None**                                                                  | **High**     |
| C11 | Redis/memory       | `tenant:profile:{type}:{id}`           | 300s             | Yes              | No              | `invalidateTenantProfileCache` (supplier/restaurant PATCH)                | Medium       |
| C12 | Redis/memory       | `ff:{tenantId}:{type}:{featureKey}`    | 180s             | Yes              | No              | `invalidateFeatureFlagCache`                                              | Medium       |
| C13 | Redis/memory       | `ff:all:{tenantId}:{type}`             | 180s             | Yes              | No              | `invalidateFeatureFlagCache`                                              | Medium       |
| C14 | Redis/memory       | `productCats:{supplierId\|all}`        | 300s             | Partial          | No              | **None**                                                                  | **Critical** |
| C15 | Redis/memory       | `productTags:{supplierId\|all}`        | 300s             | Partial          | No              | **None**                                                                  | **Critical** |
| C16 | Redis/memory       | `orders-calendar:{tenant}:…`           | 300s             | Yes              | Role in key     | **None**                                                                  | High         |
| C17 | Redis/memory       | `staff:list:{endpoint}:{restaurantId}` | 45s              | Yes              | No              | `invalidateStaffListCache` (middleware)                                   | Medium       |
| C18 | Redis/memory       | `prefs:{userId}:{userType}`            | 180s             | No               | Yes             | `invalidateNotificationPreferencesCache`                                  | Medium       |
| C19 | Redis/memory       | `notif:unread:{userId}:{userType}`     | 30s              | No               | Yes             | `invalidateUserNotificationsListCache`                                    | Medium       |
| C20 | Redis/memory       | `notif:list:{userId}:{type}:…`         | 25s              | No               | Yes             | `invalidateUserNotificationsListCache`                                    | Medium       |
| F1  | RTK Query (global) | `keepUnusedDataFor: 120` default       | 120s             | Varies           | Varies          | Tag invalidation                                                          | Medium       |
| F2  | RTK Query          | `getMe`                                | 600s             | No               | Yes             | `User` tag, `refetchAppSession`                                           | **Critical** |
| F3  | RTK Query          | `getBillingStatus`                     | 600s             | Yes              | No              | `Billing` tag, `refetchAppSession`                                        | **Critical** |
| F4  | RTK Query          | `getEntitlements`                      | 600s             | Yes              | No              | `Subscription` tag, socket `entitlements_refresh`                         | High         |
| F5  | RTK Query          | Product categories/tags                | 300s             | Yes              | No              | `Product` tag (mutations exist)                                           | Medium       |
| F6  | TanStack Query     | Orders calendar `queryKey`             | stale 5min       | Yes              | Role in key     | **None**                                                                  | High         |
| L1  | localStorage       | `supplify_cart_v1_{email}`             | Until cleared    | Per email        | Yes             | Manual / login rehydrate                                                  | Medium       |
| L2  | localStorage       | `supplify_monetization_blocked`        | Persistent       | No               | No              | Slice logic                                                               | Low          |
| L3  | localStorage       | `receivingOrderIds`                    | Persistent       | No               | No              | Page logic                                                                | Low          |
| L4  | localStorage       | `staff.portal.token`                   | Persistent       | Staff            | Yes             | Manual                                                                    | Medium       |
| L5  | localStorage       | Push prefs keys                        | Persistent       | User             | Yes             | Push hook                                                                 | Low          |
| S1  | sessionStorage     | Notification permission prompt         | Session          | User             | Yes             | Once per session                                                          | Low          |
| H1  | HTTP (nginx web)   | Static assets                          | 1y immutable     | N/A              | N/A             | Build hash                                                                | Low          |
| H2  | HTTP (nginx web)   | `sw.js`                                | no-cache         | N/A              | N/A             | Version bump                                                              | Low          |
| H3  | HTTP (API)         | File downloads                         | max-age=86400    | N/A              | N/A             | URL/version                                                               | Low          |
| SW1 | Service Worker     | `supplify-static-v1`                   | Until activate   | Origin           | No              | SW lifecycle                                                              | Low          |
| SF1 | singleflight       | In-flight dedup map                    | Request duration | N/A              | N/A             | Auto                                                                      | Low          |
| R1  | Per-request        | `req._requestTenantCache`              | Request          | Yes              | Yes             | End of request                                                            | Low          |

---

## 1. Cache inventory (detailed)

### 1.1 Backend — core cache utility

**File:** `apps/api/src/lib/cache.js`

| Aspect                   | Detail                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| **What**                 | JSON-serialized key/value store                                       |
| **Backend**              | Redis when `REDIS_URL` set; else `Map` in Node process memory         |
| **Default TTL**          | 300s if caller omits TTL                                              |
| **Read**                 | `getCache(key)` — all cached modules                                  |
| **Write**                | `setCache(key, value, ttlSeconds)`                                    |
| **Delete**               | `deleteCache(key)`                                                    |
| **Failure mode**         | Redis errors fall back to memory **without** cross-replica visibility |
| **Leakage**              | Keys must encode tenant/user; utility itself is agnostic              |
| **Stale after mutation** | Entirely depends on callers calling `deleteCache`                     |

**Lines:** 44–115 (`memoryCache`, `getCache`, `setCache`, `deleteCache`)

---

### 1.2 Backend — singleflight (in-memory, not Redis)

**File:** `apps/api/src/lib/singleflight.js`

| Aspect      | Detail                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| **What**    | Coalesces concurrent async work for the same string key                                                             |
| **TTL**     | Duration of single in-flight promise                                                                                |
| **Scope**   | Per Node.js process only                                                                                            |
| **Used by** | Nearly all Redis-backed loaders (user, subscription, permissions, notifications, etc.)                              |
| **Risk**    | Does not cache across requests by itself; pairs with Redis. On Redis miss, still prevents DB stampedes per replica. |

---

### 1.3 Backend — access / auth cache orchestration

**File:** `apps/api/src/lib/access-cache.js` (new)

| Function                                                                  | Clears                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `invalidateUserAuthCaches({ userId, keycloakSub, tenantId, tenantType })` | `user:sub:*`, permissions, workspace assignment, `tenant:req:*`, full subscription/billing/entitlements stack |

**Writers calling it:** `register-account.js` (L264–270), `invitation-accept.js` (`assignInvitationTenantRole`, L97)

**Gap:** Not used from `tenant-roles.routes.js`, restaurant/branch invite accept handlers (only via `assignInvitationTenantRole` for invites).

---

### 1.4 Backend — RBAC & tenant resolution

**File:** `apps/api/src/lib/rbac.js`

| Cache                | Key                                | TTL        | Read                                      | Write            | Invalidate                                         |
| -------------------- | ---------------------------------- | ---------- | ----------------------------------------- | ---------------- | -------------------------------------------------- |
| User by Keycloak sub | `user:sub:{sub}`                   | 300s (L44) | `getUserBySub` (L98–128)                  | After DB SELECT  | `invalidateUserBySubCache` (L50–52), upsert (L200) |
| Request tenant       | `tenant:req:{userId}:{tenantType}` | 180s (L43) | `getRequestTenant` common path (L550–600) | After resolution | `invalidateRequestTenantCache` (L56–58)            |

**Per-request memo:** `req._requestTenantResolved` / `req._requestTenantCache` (L497–505) — safe, not cross-request.

**Impersonation / branch bypass:** Comment L488–490 states cache skipped when impersonating, `x-branch-id` header, or active-tenant cookie. `canUseCrossRequestTenantCaches` in `tenant-context-cache.js` mirrors this.

**Comment bug:** L488 says "60s TTL" but `TENANT_REQ_CACHE_TTL = 180`.

**Cross-tenant leakage:** Keys include `userId` + `tenantType` (role). Safe if role is correct; **stale role** in C1 causes wrong tenant resolution.

---

### 1.5 Backend — permissions & tenant context

**File:** `apps/api/src/lib/permissions.js`

| Cache       | Key                                      | TTL        | Invalidate                               |
| ----------- | ---------------------------------------- | ---------- | ---------------------------------------- |
| Permissions | `perms:{userId}:{tenantId}:{tenantType}` | 120s (L16) | `invalidateUserPermissionCache` (L27–37) |
| Role names  | `roles:{userId}:{tenantId}:{tenantType}` | 180s (L17) | Same                                     |

Also clears `tctx:*` via `invalidateTenantContextCache`.

**File:** `apps/api/src/lib/tenant-context-cache.js`

| Cache          | Key                                     | TTL       | Read                              | Invalidate                              |
| -------------- | --------------------------------------- | --------- | --------------------------------- | --------------------------------------- |
| Context bundle | `tctx:{userId}:{tenantId}:{tenantType}` | 120s (L7) | `getTenantContextBundle` (L32–57) | `invalidateTenantContextCache` (L69–71) |
| Warm write     | Same                                    | 120s      | `setTenantContextBundle` (L60–66) | —                                       |

**Guard:** `canUseCrossRequestTenantCaches(req)` (L18–26) disables bundle cache under impersonation / branch cookie / supplier branch header.

---

### 1.6 Backend — workspace & org billing

**File:** `apps/api/src/lib/workspace-tenant.js`

| Cache             | Key                               | TTL       | Invalidate                                    |
| ----------------- | --------------------------------- | --------- | --------------------------------------------- |
| Tenant assignment | `ws:assign:{userId}:{tenantType}` | 180s (L8) | `invalidateWorkspaceAssignmentCache` (L14–16) |

**File:** `apps/api/src/lib/org-billing-tenant.js`

| Cache                   | Key                               | TTL       | Read                                 | Invalidate |
| ----------------------- | --------------------------------- | --------- | ------------------------------------ | ---------- |
| Org → billing tenant id | `orgbill:{tenantType}:{tenantId}` | 300s (L5) | `resolveOrgBillingTenantId` (L16–52) | **None**   |

**Risk:** Branch promoted to main, org restructure, or new org membership can serve wrong billing tenant id for up to 5 minutes. Affects subscription, entitlements, and limits for branch users.

---

### 1.7 Backend — subscription, billing, entitlements

**File:** `apps/api/src/lib/subscription.js`

| Cache                | Key                           | TTL        | Read                               | Invalidate                                     |
| -------------------- | ----------------------------- | ---------- | ---------------------------------- | ---------------------------------------------- |
| Subscription row     | `sub:{tenantType}:{tenantId}` | 180s (L44) | `getTenantSubscription` (L103+)    | `invalidateTenantSubscriptionCache` (L205–209) |
| Entitlements payload | `ent:{tenantType}:{tenantId}` | 300s (L46) | `getEntitlementsForTenant` (~L767) | `invalidateEntitlementsCache`                  |

**File:** `apps/api/src/lib/billing/billing-service.js`

| Cache                | Key                                  | TTL        | Read                                 | Invalidate                                                                                  |
| -------------------- | ------------------------------------ | ---------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Billing subscription | `billingSub:{tenantId}:{tenantType}` | 180s (L38) | `getSubscriptionForBilling` (L47–69) | `invalidateBillingSubscriptionCache` (L45–46); also via `invalidateTenantSubscriptionCache` |

**Overlap conflict (C7 + C8):** Two keys, same table, different key order. Unified invalidation in `invalidateTenantSubscriptionCache` (subscription.js L205–209) clears sub, entitlements, **and** billingSub. New code paths must call this hub, not ad-hoc deletes.

**Checkout / pay-now:** `billing.routes.js` L250, L324 — `await invalidateTenantSubscriptionCache`.

**Jobs:** `subscription-billing.job.js` L112 — fire-and-forget `.catch(() => {})`. `free-sandbox-expiry.job.js` L31 — same.

---

### 1.8 Backend — feature flags

**File:** `apps/api/src/lib/feature-flags.js`

| Cache          | Key                                       | TTL                          | Invalidate                           |
| -------------- | ----------------------------------------- | ---------------------------- | ------------------------------------ |
| Single feature | `ff:{tenantId}:{tenantType}:{featureKey}` | 180s (L12; comment says 60s) | `invalidateFeatureFlagCache` (L357+) |
| All features   | `ff:all:{tenantId}:{tenantType}`          | 180s                         | Same (+ entitlements cache)          |

Admin updates via `setTenantFeatureOverride` invalidate (L331, L347). Socket `emitEntitlementsRefreshNotice` notifies clients (admin-dashboard.routes.js).

---

### 1.9 Backend — catalog meta

**File:** `apps/api/src/routes/products.routes.js`

| Cache      | Key                               | TTL        | Lines                     |
| ---------- | --------------------------------- | ---------- | ------------------------- |
| Categories | `productCats:{supplierId\|'all'}` | 300s (L29) | Read L116–140, write L140 |
| Tags       | `productTags:{supplierId\|'all'}` | 300s       | Read L159–174, write L174 |

**Invalidation:** Grep shows **no** `deleteCache` for these keys anywhere in `apps/api/src`.

**Stale after:** Product create/update/delete, category changes.

**Frontend mirror:** RTK `getProductCategories` / `getProductTags` use `providesTags: ['Product']` and `keepUnusedDataFor: 300` (api.ts L343–350). Product mutations invalidate `Product` tag — **client can refresh but API Redis still stale for 5 min** on cache hit.

---

### 1.10 Backend — orders calendar

**File:** `apps/api/src/routes/orders.calendar.routes.js`

| Cache            | Key                                                 | TTL  | Lines                                     |
| ---------------- | --------------------------------------------------- | ---- | ----------------------------------------- |
| Calendar payload | `orders-calendar:{tenant.id}:{role}:{JSON filters}` | 300s | Build L265–274, read L276–283, write L528 |

**Invalidation:** None on order create/update/status change.

**Frontend:** `apps/web/src/hooks/useOrdersCalendar.ts` — TanStack Query `staleTime: 5 * 60 * 1000` (L99), bypasses RTK tag system entirely.

**Stacked staleness:** Up to ~5 min (client) + up to 5 min (server) in worst case.

---

### 1.11 Backend — staff lists

**File:** `apps/api/src/lib/staff-list-cache.js`

| Cache           | Key                                    | TTL      | Invalidate                          |
| --------------- | -------------------------------------- | -------- | ----------------------------------- |
| Staff endpoints | `staff:list:{endpoint}:{restaurantId}` | 45s (L5) | `invalidateStaffListCache` (L42–48) |

**Middleware:** `staffListCacheInvalidationMiddleware` (L57–73) — fire-and-forget on successful non-GET JSON responses.

---

### 1.12 Backend — notifications

**File:** `apps/api/src/services/notification.service.js`

| Cache        | Key                                                        | TTL  | Lines    |
| ------------ | ---------------------------------------------------------- | ---- | -------- |
| Preferences  | `prefs:{userId}:{userType}`                                | 180s | L215–258 |
| Unread count | `notif:unread:{userId}:{userType}`                         | 30s  | L654–702 |
| List pages   | `notif:list:{userId}:{type}:{limit}:{offset}:{unreadFlag}` | 25s  | L650–761 |

**Invalidation:** `invalidateNotificationPreferencesCache` (L221), `invalidateUserNotificationsListCache` (L658–670) — clears fixed limit/offset combinations only (limits 25, 50).

**Role change gap:** If `user_type` changes (PENDING → RESTAURANT), old keys may linger until TTL; invalidation helper tries multiple userTypes (L660).

---

### 1.13 Backend — tenant profile

**File:** `apps/api/src/lib/tenant-profile-cache.js`

| Cache                   | Key                                      | TTL  | Invalidate                     |
| ----------------------- | ---------------------------------------- | ---- | ------------------------------ |
| Supplier/restaurant row | `tenant:profile:{tenantType}:{tenantId}` | 300s | `invalidateTenantProfileCache` |

**Called from:** `suppliers.routes.js` L871, `restaurants.routes.js` L454, L562.

---

### 1.14 Backend — HTTP cache headers (API)

Only explicit API cache header found:

- `apps/api/src/routes/files.routes.js` L59 — `Cache-Control: public, max-age=86400` for file responses.

Authenticated JSON API responses generally have **no** cache headers (good).

---

### 1.15 Backend — admin dashboard & command center

**Files:** `apps/api/src/lib/admin-overview-metrics.js`, `apps/api/src/routes/admin-dashboard.routes.js`, `apps/api/src/services/supplier-command-center.service.js`

**Redis cache:** None found. These hit PostgreSQL directly each request.

**Invalidation:** Admin subscription/plan mutations use `invalidateTenantSubscriptionCache` (multiple routes) + socket push.

---

### 1.16 Backend — deals / promotions

**Files:** `apps/api/src/routes/promotions.routes.js`, `apps/api/src/services/deal-*.js`

**Redis cache:** None found. Client relies on RTK Query tags.

---

### 1.17 Backend — global Node singletons (not TTL caches)

| Singleton         | File            | Risk                                   |
| ----------------- | --------------- | -------------------------------------- |
| `redisClient`     | cache.js        | Connection state                       |
| `memoryCache` Map | cache.js        | Per-replica stale if no Redis          |
| `inflight` Map    | singleflight.js | Safe (short-lived)                     |
| DB pool           | db.js           | Connection pooling, not semantic cache |
| Socket.io         | socket.js       | Room state                             |

**Railway cold start:** Empty memory/Redis on new replica → no stale **global** state, but thundering herd on cache miss. Not a staleness bug.

---

### 1.18 Frontend — RTK Query (`apps/web/src/services/api.ts`)

**Library:** Redux Toolkit Query (not TanStack Query for most data).

**Global defaults (L263–264):** `keepUnusedDataFor: 120`, `refetchOnFocus: false`.

**Critical endpoints:**

| Endpoint                    | keepUnusedDataFor | refetchOnMount | Tags                        | Notes                |
| --------------------------- | ----------------- | -------------- | --------------------------- | -------------------- |
| `getMe`                     | 600 (L270)        | false (L272)   | User                        | Auth shell           |
| `getRegisterStatus`         | default           | false          | RegisterStatus              |                      |
| `getBillingStatus`          | 600 (L3178)       | false (L3180)  | Billing, Subscription       | Activation gating    |
| `getEntitlements`           | 600 (L3129)       | false (L3130)  | Subscription                | Plan limits/features |
| `getProductCategories/Tags` | 300 (L345, L350)  | default        | Product                     | Mirrors API Redis    |
| Notifications               | 60 (L2119, L2124) | default        | Notification                | Shorter TTL          |
| `getDashboardStats`         | 120 (L1051)       | default        | User (tag choice debatable) |                      |

**Mutation invalidation:** ~100 mutations use `invalidatesTags` (api.ts). Coverage is broad for CRUD entities; **gaps** for auth/session flows unless `onQueryStarted` + `refetchAppSession` runs.

**Recent `onQueryStarted` hooks:** `completeRegistration`, `billingCheckout`, `billingPayNow` → dynamic import `refetchAppSession` (api.ts ~L311–324, ~L3228+).

**File:** `apps/web/src/lib/refetchAppSession.ts` — force refetch getMe, register status, billing, entitlements.

**Auth guard auto-heal:** `AuthGuard.tsx`, `RegisterCompletePage.tsx` — detect `PENDING` role + `needsSetup: false`, call `refetchAppSession`.

---

### 1.19 Frontend — TanStack React Query

**Files:** `apps/web/src/main.tsx` (default `QueryClient`), `apps/web/src/hooks/useOrdersCalendar.ts`

| Query           | staleTime   | gcTime  | Invalidation                   |
| --------------- | ----------- | ------- | ------------------------------ |
| Orders calendar | 5 min (L99) | default | None linked to order mutations |

**Risk:** Second client cache layer independent of RTK tags.

---

### 1.20 Frontend — localStorage / sessionStorage

| Key pattern                     | File                                | Purpose             | Cleared on logout? |
| ------------------------------- | ----------------------------------- | ------------------- | ------------------ |
| `supplify_cart_v1_{email}`      | `cartPersistence.ts` L3–22          | Cart + drafts       | No (email-scoped)  |
| `supplify_monetization_blocked` | `monetizationSlice.ts` L46          | Block event history | No                 |
| `receivingOrderIds`             | `ReceivingPage.tsx` L110            | UI state            | No                 |
| `staff.portal.token`            | `StaffSelfServiceDashboard.tsx` L52 | Staff JWT           | No                 |
| Push keys                       | `usePushNotifications.ts`           | Push opt-in         | Partial            |
| Notification prompt             | `useNotificationAlerts.tsx` L174    | sessionStorage      | Session            |

**Cross-user leakage:** Cart is email-scoped (good). Shared browser profile could show previous user's cart until login rehydrates. Logout does not clear cart keys.

---

### 1.21 Frontend — Service Worker / PWA

**Files:** `apps/web/static/sw.js`, `apps/web/src/lib/registerServiceWorker.ts`, `apps/web/nginx.conf`

| Asset               | Policy                                      |
| ------------------- | ------------------------------------------- |
| `sw.js`             | no-cache (nginx L19–23)                     |
| Static js/css/fonts | cache-first, 1y immutable (nginx L37–40)    |
| `/api/`, `/auth/`   | **Not cached** by SW (sw.js L14–18)         |
| Precache            | offline.html, manifest, icons (sw.js L5–12) |

**Risk:** Low for API data. Stale **app bundle** until SW update cycle — normal PWA tradeoff.

---

### 1.22 CDN / deploy nginx

**File:** `deploy/nginx/nginx.conf`

- API proxy `proxy_read_timeout 120s` (L64) — can abort long requests (registration was ~43s).
- No response caching for `/api/` or `/auth/`.

---

### 1.23 Vite / build cache

**File:** `apps/web/vite.config.ts` — manual chunking; no special runtime cache assumptions beyond hashed asset filenames + nginx immutable headers.

---

## 2. Dangerous areas — focused audit

### Auth / session / user profile — **Critical**

- Server: `user:sub:*` (300s) drives every authenticated request via `requireAuth` → `getUserBySub`.
- Client: `getMe` cached 600s, no refetch on mount.
- **Observed failure:** Registration updated DB role but client/server cache still showed `PENDING`.
- **Mitigation in tree:** `invalidateUserAuthCaches`, `refetchAppSession`, stale-state detectors.

### RBAC permissions — **High**

- Three layered caches: permissions, roles, tenant context bundle.
- Invalidation on role assign in `tenant-roles.routes.js` (L251–252, L434–435) clears permissions + workspace but **not** user sub or request-tenant caches.
- Org-level permission bulk invalidation in `restaurant-org.js` / `supplier-org.js`.

### Subscription / plan / trial — **High**

- Three Redis keys (sub, billingSub, ent) + org billing mapping + RTK entitlements/billing.
- Admin edits generally call `invalidateTenantSubscriptionCache` + socket refresh.
- Checkout/activation paths now await invalidation.
- **Remaining gap:** org billing cache; job invalidations fire-and-forget.

### Tenant selection — **High**

- `tenant:req:*`, `ws:assign:*`, active-tenant cookie (JWT, not Redis), branch switch reload.
- Branch switch pattern (`BranchContext.tsx` L151–152): `resetApiState()` + full reload — **good reference pattern**.

### Impersonation — **Medium** (mostly safe)

- Tenant context cache disabled under impersonation (`tenant-context-cache.js` L18–26).
- Request tenant cache bypassed per rbac.js comments.
- Admin effective tenant from cookies/JWT — not Redis cached.

### Supplier catalog — **Critical** (meta cache)

- Product list endpoints may hit DB directly; **categories/tags** endpoints hit Redis without invalidation.

### Restaurant ordering / cart — **Medium**

- Cart in localStorage (client only).
- Orders use RTK `Order` tags; calendar is separate TanStack + Redis stack.

### Deals / promotions — **Low** (server)

- No Redis; RTK invalidation on mutations.

### Admin dashboard — **Low** (server)

- Live SQL; client `getDashboardStats` RTK cache 120s with `User` tag (odd tag choice).

### Command center — **Low** (server)

- `supplier-command-center.service.js` — no Redis.

### Notifications — **Medium**

- Short TTLs (25–30s) limit staleness; list invalidation covers only specific pagination keys.

### Logout / login / tenant switch — **Medium**

- Logout (`Header.tsx` L112–120): mutation + redirect; **no** `resetApiState()`.
- Invite accept pages call `resetApiState()` (InviteAcceptPage.tsx L129).
- Branch switch: full reload (good).

---

## 3. Suspected conflicts (overlap & race conditions)

| #   | Conflict                                  | Layers involved                                    | Symptom                                                                                             |
| --- | ----------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| X1  | Registration completes                    | C1 + F2 + F3                                       | Redirect loops, stuck on `/register/complete` or `/app/activate`                                    |
| X2  | Duplicate subscription keys               | C7 + C8                                            | Billing status vs entitlements disagree if only one invalidated                                     |
| X3  | Org billing stale                         | C10 + C7/C8/C9                                     | Branch sees wrong plan/limits after org changes                                                     |
| X4  | Catalog meta                              | C14/C15 + F5                                       | Categories/tags wrong after product edits                                                           |
| X5  | Orders calendar                           | C16 + F6                                           | Calendar not updating after new orders                                                              |
| X6  | RTK tag vs forceRefetch                   | F2/F3 + invalidatesTags                            | Tag invalidation marks stale but long `keepUnusedDataFor` serves old data if component unsubscribed |
| X7  | Redis vs memory fallback                  | C\* all                                            | Different replicas return different data without REDIS_URL                                          |
| X8  | Permission vs user role                   | C4–C6 vs C1                                        | Permissions refresh but `/auth/me` role stale                                                       |
| X9  | `register-account.js` double invalidation | access-cache + manual permission clears (L272–284) | Redundant work; not incorrect                                                                       |
| X10 | Admin socket vs RTK                       | Socket `Subscription` tag only                     | Billing/User not invalidated on entitlements_refresh                                                |
| X11 | TanStack vs RTK                           | F6 vs RTK Order mutations                          | Calendar hook never knows about order changes                                                       |

---

## 4. Risk table

| Risk                                      | Area          | Severity     | Likelihood | Notes                      |
| ----------------------------------------- | ------------- | ------------ | ---------- | -------------------------- |
| User role stale after signup/invite       | Auth          | **Critical** | Medium     | Partially fixed            |
| Catalog categories/tags stale             | Catalog       | **Critical** | High       | No server invalidation     |
| Billing activation stale                  | Billing       | **High**     | Medium     | Partially fixed            |
| Org billing tenant stale                  | Subscription  | **High**     | Medium     | No invalidation fn         |
| Orders calendar double cache              | Orders        | **High**     | Medium     | No invalidation            |
| Multi-replica without Redis               | Infra         | **High**     | Low–Med    | Env-dependent              |
| RBAC role change without user cache clear | RBAC          | **High**     | Medium     | tenant-roles routes        |
| Entitlements vs billing mismatch          | Subscription  | **Medium**   | Low        | Hub invalidation helps     |
| Notification prefs stale                  | Notifications | **Medium**   | Low        | 180s TTL                   |
| Staff list stale                          | Staff         | **Medium**   | Low        | 45s TTL + middleware       |
| Logout leaves RTK cache                   | Auth          | **Medium**   | Low        | Full redirect often clears |
| Cart localStorage cross-session           | Cart          | **Medium**   | Low        | Email-scoped               |
| SW static bundle stale                    | PWA           | **Low**      | Low        | Expected                   |
| Monetization localStorage                 | UX            | **Low**      | Low        | Analytics only             |

---

## 5. Files inspected

### API — core & auth

- `apps/api/src/lib/cache.js`
- `apps/api/src/lib/singleflight.js`
- `apps/api/src/lib/access-cache.js`
- `apps/api/src/lib/rbac.js`
- `apps/api/src/lib/permissions.js`
- `apps/api/src/lib/tenant-context-cache.js`
- `apps/api/src/lib/workspace-tenant.js`
- `apps/api/src/lib/tenant-profile-cache.js`
- `apps/api/src/lib/tenant-switch.js`
- `apps/api/src/lib/register-account.js`
- `apps/api/src/lib/invitation-accept.js`
- `apps/api/src/lib/org-billing-tenant.js`

### API — billing & subscription

- `apps/api/src/lib/subscription.js`
- `apps/api/src/lib/billing/billing-service.js`
- `apps/api/src/routes/billing.routes.js`
- `apps/api/src/jobs/subscription-billing.job.js`
- `apps/api/src/jobs/free-sandbox-expiry.job.js`

### API — features & catalog

- `apps/api/src/lib/feature-flags.js`
- `apps/api/src/routes/products.routes.js`
- `apps/api/src/routes/orders.calendar.routes.js`

### API — staff, notifications, admin

- `apps/api/src/lib/staff-list-cache.js`
- `apps/api/src/services/notification.service.js`
- `apps/api/src/routes/admin-dashboard.routes.js`
- `apps/api/src/lib/admin-overview-metrics.js`
- `apps/api/src/services/supplier-command-center.service.js`
- `apps/api/src/routes/tenant-roles.routes.js`
- `apps/api/src/routes/suppliers.routes.js`
- `apps/api/src/routes/restaurants.routes.js`
- `apps/api/src/routes/files.routes.js`
- `apps/api/src/lib/socket.js`

### Web — client caches

- `apps/web/src/services/api.ts`
- `apps/web/src/services/staffApi.ts`
- `apps/web/src/lib/refetchAppSession.ts`
- `apps/web/src/lib/activateFreePlan.ts`
- `apps/web/src/components/AuthGuard.tsx`
- `apps/web/src/components/Layout.tsx`
- `apps/web/src/contexts/BranchContext.tsx`
- `apps/web/src/hooks/useOrdersCalendar.ts`
- `apps/web/src/features/cart/cartPersistence.ts`
- `apps/web/src/features/monetization/monetizationSlice.ts`
- `apps/web/static/sw.js`
- `apps/web/nginx.conf`
- `apps/web/src/main.tsx`

### Deploy / infra

- `deploy/nginx/nginx.conf`
- `apps/api/src/server.js` (cache disconnect)
- `apps/api/src/middlewares/request-timing.js` (perf notes, not semantic cache)

---

## 6. Recommended fixes (do not apply yet)

1. **Add `invalidateOrgBillingCache(tenantId, tenantType)`** and call from branch/org mutations, main-branch promotion, registration.
2. **Add `invalidateCatalogMetaCache(supplierId)`** deleting `productCats:*` and `productTags:*`; call from all product/category write routes.
3. **Add `invalidateOrdersCalendarCache(tenantId, tenantType)`** or drop Redis calendar cache and rely on DB + client staleTime reduction.
4. **Extend `invalidateUserAuthCaches` usage** to `tenant-roles.routes.js`, invite accept completion handlers, and any `UPDATE app_user SET role`.
5. **Standardize mutation → invalidation** checklist in PR template: which hub function to call.
6. **Frontend session hub:** Call `refetchAppSession` from PaymentModal, all billing/unlock flows, invite accept success, and optionally after logout use `resetApiState()`.
7. **Reduce `keepUnusedDataFor`** on `getMe` / `getBillingStatus` to ≤120s OR require `forceRefetch` on any route transition in auth shell.
8. **Unify orders calendar** on RTK Query OR wire TanStack `queryClient.invalidateQueries` on order mutations.
9. **Require REDIS_URL in production**; alert if `isRedisCacheEnabled()` false.
10. **Fix comment/TTL drift** in rbac.js and feature-flags.js (document 180s/300s accurately).

---

## 7. Safe cache strategy proposal for Supplify

### Principles

1. **One mental model:** "Read-through Redis + explicit hub invalidation on every write."
2. **Never cache auth identity longer than 60s** without a hard invalidation path on role/tenant changes.
3. **Tenant keys always include `{tenantType}:{tenantId}`** (and user keys include `userId` or `keycloakSub`).
4. **No duplicate keys for the same entity** — consolidate subscription into one canonical key or one invalidation hub (already started).
5. **Client mirrors server:** After any mutation affecting access, call `refetchAppSession()` before navigation.
6. **Bypass caches for:** impersonation, branch header, active-tenant cookie (already done for tenant context).

### Tiering

| Tier               | Data                                | Server TTL | Client TTL                        | Invalidation                                             |
| ------------------ | ----------------------------------- | ---------- | --------------------------------- | -------------------------------------------------------- |
| T0 — Identity      | User, role, billing access          | ≤60s       | force refetch on auth flows       | `invalidateUserAuthCaches`                               |
| T1 — Authorization | Permissions, entitlements           | ≤120s      | Subscription tag + socket         | `invalidateTenantSubscriptionCache` + permission helpers |
| T2 — Workspace     | Tenant assignment, org billing      | ≤120s      | Branch switch = reload            | New org billing invalidation                             |
| T3 — Read models   | Catalog meta, calendar, staff lists | ≤60–120s   | Match server or skip client cache | Domain-specific invalidators                             |
| T4 — Static        | Assets, SW                          | Long       | Immutable hash                    | Deploy                                                   |

### Debugging

- Log cache hit/miss at hub boundaries (already partially via `request-timing.js` `noteCacheHit`).
- Add optional `X-Cache-Status` response header on selected read endpoints (future).
- Document hub functions in `access-cache.js` and extend for catalog/calendar/org billing.

---

_End of audit. See `CACHE_FIX_PLAN.md` for phased remediation._
