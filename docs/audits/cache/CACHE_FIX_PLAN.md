# Supplify Cache Fix Plan

**Status:** Plan only — no code changes applied in this document.  
**Prerequisite:** Read [CACHE_AUDIT_CURRENT_STATE.md](./CACHE_AUDIT_CURRENT_STATE.md).  
**Priority order:** Correctness → no cross-tenant leakage → no stale RBAC/subscription → predictable invalidation → performance → debuggability.

---

## Goals

1. Eliminate auth/billing/activation redirect loops caused by stale caches.
2. Ensure every write path invalidates all dependent read caches (server + client).
3. Remove duplicate or orphaned Redis keys.
4. Keep performance acceptable (target: p95 auth/me unchanged; avoid removing all caching).
5. Make invalidation easy to audit in code review.

---

## Phase 0 — Observability & guardrails (1–2 days)

**Purpose:** See problems before and after fixes; prevent production running without Redis.

| Step | Action                                                                                                                | Files / notes                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 0.1  | Log warning at API startup if `REDIS_URL` unset in production                                                         | `apps/api/src/lib/cache.js`, `apps/api/src/server.js` |
| 0.2  | Extend slow-request breakdown to log cache hit flags already in `req._perf.cacheHits`                                 | `apps/api/src/middlewares/request-timing.js`          |
| 0.3  | Add health check field `redisCache: true/false`                                                                       | Existing `/health` route                              |
| 0.4  | Document required env: `REDIS_URL` mandatory for multi-replica Railway                                                | `docs/operations/environment-variables.md`            |
| 0.5  | Add regression tests for `invalidateUserAuthCaches` and `invalidateTenantSubscriptionCache` clearing all related keys | Extend `access-cache.test.js`, `subscription.test.js` |

**Exit criteria:** Can confirm in logs which replica uses Redis; staging reproduces stale-cache incidents with metrics.

---

## Phase 1 — Critical correctness (auth, billing, activation) (2–3 days)

**Addresses audit items:** C1, C7, C8, C9, F2, F3, X1, X2.

| Step | Action                                                           | Details                                                                                                                              |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1  | **Deploy existing `access-cache.js` + `refetchAppSession` work** | Ensure production has registration, activation, checkout paths                                                                       |
| 1.2  | **Audit all `UPDATE app_user SET role`**                         | Grep codebase; each site must call `invalidateUserAuthCaches`                                                                        |
| 1.3  | **Wire `tenant-roles.routes.js`**                                | After role assign/revoke, call `invalidateUserAuthCaches({ userId, tenantId, tenantType })` instead of only permission helpers       |
| 1.4  | **Remove redundant invalidation in `register-account.js`**       | Lines 272–284 duplicate work already in `invalidateUserAuthCaches`; consolidate to avoid drift                                       |
| 1.5  | **Reduce client TTL for auth shell**                             | `getMe`, `getBillingStatus`: `keepUnusedDataFor` 600 → 120 OR keep 600 but set `refetchOnMountOrArgChange: true` on auth routes only |
| 1.6  | **Logout hygiene**                                               | After successful logout mutation, `dispatch(api.util.resetApiState())` before redirect (match `BranchContext` pattern)               |
| 1.7  | **Await job invalidations**                                      | Change `.catch(() => {})` to `await` in `subscription-billing.job.js`, `free-sandbox-expiry.job.js`                                  |
| 1.8  | **Integration test**                                             | E2E: register → activate → land on `/app` without manual refresh                                                                     |

**Exit criteria:** New signup + free activation completes in one submit; no double refresh; QA checklist AUTH-07, CRST-03 pass.

---

## Phase 2 — Subscription & org billing hub (2 days)

**Addresses:** C10, X2, X3.

| Step | Action                                                       | Details                                                                                                                  |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 2.1  | **Create `invalidateOrgBillingCache(tenantId, tenantType)`** | `apps/api/src/lib/org-billing-tenant.js` — delete `orgbill:{type}:{id}`                                                  |
| 2.1b | **Call from org/branch mutations**                           | Supplier/restaurant org routes, main-branch flag changes, branch create/delete                                           |
| 2.2  | **Extend `invalidateTenantSubscriptionCache`**               | Also call `invalidateOrgBillingCache` for org main tenant when branch subscription changes                               |
| 2.3  | **Document canonical hub**                                   | Single module export table: `invalidateTenantSubscriptionCache`, `invalidateUserAuthCaches`, `invalidateOrgBillingCache` |
| 2.4  | **Socket refresh**                                           | On admin subscription unlock, optionally invalidate `Billing` RTK tag in client handler (`Layout.tsx` L140)              |

**Exit criteria:** Branch user sees updated plan within one request after admin unlock on main org; unit test for org billing cache clear.

---

## Phase 3 — Catalog & orders read-model caches (2–3 days)

**Addresses:** C14, C15, C16, F5, F6, X4, X5, X11 — **Critical / High**.

| Step | Action                                       | Details                                                                                                                                                                                                                                        |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | **`invalidateCatalogMetaCache(supplierId)`** | Delete `productCats:{id}`, `productTags:{id}`, and global `all` variants when appropriate                                                                                                                                                      |
| 3.2  | **Hook product routes**                      | POST/PATCH/DELETE products, category admin — call invalidator at end of successful handler                                                                                                                                                     |
| 3.3  | **Orders calendar — pick one strategy**      | **Option A (recommended):** Remove Redis cache in `orders.calendar.routes.js`; keep TanStack 1–2 min stale. **Option B:** Keep Redis + add `invalidateOrdersCalendarForTenant(tenantId, type)` on order mutations + TanStack invalidateQueries |
| 3.4  | **Align TanStack with RTK**                  | If keeping TanStack for calendar, export shared invalidation helper called from order mutation `onQueryStarted`                                                                                                                                |
| 3.5  | **Test**                                     | Create product → categories list updates within 1 request                                                                                                                                                                                      |

**Exit criteria:** Supplier edits catalog; categories/tags reflect change immediately; calendar updates within 2 min max (Option A) or immediately (Option B).

---

## Phase 4 — RBAC, permissions, invitations (1–2 days)

**Addresses:** C4–C6, X8.

| Step | Action                            | Details                                                                                                                                |
| ---- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | **Invitation accept paths**       | Ensure restaurant/branch invite handlers call `invalidateUserAuthCaches` post-transaction (partially via `assignInvitationTenantRole`) |
| 4.2  | **Org permission bulk changes**   | Verify `invalidateRestaurantOrgPermissionCaches` / `invalidateOrgPermissionCaches` also clear `user:sub` when org owner role changes   |
| 4.3  | **Admin role changes**            | Admin user password/role reset flows invalidate user cache                                                                             |
| 4.4  | **Lower permission TTL optional** | 120s → 60s if needed after invalidation coverage proven                                                                                |

**Exit criteria:** Role change reflected in `/auth/me` permissions on next navigation without hard refresh.

---

## Phase 5 — Client cache policy cleanup (1–2 days)

**Addresses:** F1–F6, L1, X6, X10.

| Step | Action                              | Details                                                                                                             |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- | ------------ | ------------------------------------------ |
| 5.1  | **`refetchAppSession` checklist**   | Call after: registration, activation, checkout, pay-now, admin unlock (if impersonating), invite accept             |
| 5.2  | **Tag audit**                       | `getDashboardStats` → `Admin` tag not `User`; ensure billing mutations invalidate both `Billing` and `Subscription` |
| 5.3  | **localStorage policy**             | On logout: clear or re-key cart if user email changed; document staff.portal.token lifecycle                        |
| 5.4  | **Optional: global RTK middleware** | Mutation matcher for tags `User                                                                                     | Billing | Subscription | RegisterStatus`triggers`refetchAppSession` |
| 5.5  | **TanStack default**                | Set `QueryClient` default `staleTime: 0` for app or migrate calendar to RTK                                         |

**Exit criteria:** No auth-shell endpoint with 600s cache + refetchOnMount false unless explicitly justified in code comment.

---

## Phase 6 — Hardening & documentation (1 day)

| Step | Action                                                                                 |
| ---- | -------------------------------------------------------------------------------------- |
| 6.1  | Add `docs/audits/cache/INVALIDATION_CHECKLIST.md` for PR authors                       |
| 6.2  | Fix incorrect TTL comments (rbac 180s not 60s; feature-flags 180s not 60s)             |
| 6.3  | Add lint rule or CI grep: new `setCache(` must pair with invalidator export or comment |
| 6.4  | Update QA regression checklist with cache-sensitive flows                              |

---

## Implementation order summary

```
Phase 0 (observability)
    ↓
Phase 1 (auth/billing) ← deploy first; fixes production signup pain
    ↓
Phase 2 (org billing + subscription hub)
    ↓
Phase 3 (catalog + calendar) ← highest remaining user-visible staleness
    ↓
Phase 4 (RBAC/invites)
    ↓
Phase 5 (client policy)
    ↓
Phase 6 (docs/CI)
```

---

## Testing matrix

| Scenario                  | Server check                           | Client check                                      |
| ------------------------- | -------------------------------------- | ------------------------------------------------- |
| New user registration     | `user:sub` key deleted                 | `getMe.role` ≠ PENDING before navigate            |
| Free plan activation      | `billingSub` lock_reason null          | `getBillingStatus.access.pendingActivation` false |
| Admin unlock subscription | `sub`, `ent`, `billingSub` deleted     | Socket or refetch updates entitlements            |
| Product create            | `productCats` deleted                  | Categories query refetches                        |
| Role assign               | `perms`, `tctx`, `user:sub` deleted    | Permissions in UI update                          |
| Branch switch             | N/A (reload)                           | `resetApiState` + full reload                     |
| Multi-replica             | Same Redis key cleared on all replicas | N/A                                               |

---

## Performance budget

| Change                                | Expected impact                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Shorter user TTL (300→60s)            | +1 DB read per user per minute on hot path; mitigated by invalidation on writes only |
| Catalog invalidation                  | Negligible; writes are rare vs reads                                                 |
| Remove calendar Redis                 | +DB load on calendar views; acceptable if indexed                                    |
| `refetchAppSession` (4 parallel GETs) | +4 requests on activation only; not on every page                                    |
| Require Redis                         | Slight latency vs memory; major win for consistency                                  |

**Do not:** Disable all caching to "fix" staleness. **Do:** Invalidate on write + shorten TTL only for identity/access tier.

---

## Rollback plan

- Each phase is independently deployable.
- Phase 1 client changes can roll back independently of server `access-cache.js`.
- Phase 3 Option A (remove calendar Redis) rollback: re-enable cache + add invalidation in follow-up.

---

## Ownership suggestions

| Area                       | Owner focus             |
| -------------------------- | ----------------------- |
| Auth / access-cache        | API platform            |
| Billing / subscription hub | Billing module          |
| Catalog / orders           | Catalog + orders teams  |
| RTK / refetchAppSession    | Web frontend            |
| Redis infra                | DevOps / Railway config |

---

_This plan intentionally does not modify application code. Implement phase-by-phase with tests and staged deploys._
