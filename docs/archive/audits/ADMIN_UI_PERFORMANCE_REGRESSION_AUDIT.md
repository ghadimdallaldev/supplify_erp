# Admin UI performance regression audit

**Date:** 2026-06-09  
**Scope:** Post–UI/UX admin changes (dashboard, plans, deals wording, settings, usage/quota).  
**Goal:** Confirm no performance regression; apply safe optimizations only (no UI redesign, no business-logic changes).

---

## 1. Summary

Today's admin UI work did **not** add heavy new dependencies (no new chart/table libraries). The main risks were:

- **Eager mounting** of heavy admin sub-panels (Deals, Limits, Operations, Users, Features) when opening `/app/admin`.
- **Duplicate `/api/admin-dashboard/health`** subscription (overview + health tabs).
- **Per-render recomputation** of deduped plan/subscription lists on a 3.5k-line page.
- **Short RTK Query cache** (120s default) for admin catalog data that tab-switches reuse.
- **TypeScript build failure** in usage table (`formatPlanLimitDisplayValue` / `undefined` limit).

Fixes applied keep existing `refetchOnFocus: false`, tab `skip` guards, and Vite manual chunking. Heavy admin tabs are now **lazy-loaded + mounted only when selected**.

---

## 2. Pages audited

| Area                     | Route / tab                        | Notes                                                |
| ------------------------ | ---------------------------------- | ---------------------------------------------------- |
| Admin dashboard overview | `/app/admin` → Overview            | overview + conversion-stats + health (overview KPIs) |
| Plans                    | Plans tab                          | plans + subscriptions (when tab active)              |
| Supplier Admin           | `/app/admin/suppliers` → Tenants   | suppliers list paginated                             |
| Restaurant Admin         | `/app/admin/restaurants` → Tenants | restaurants list paginated                           |
| Usage & Quotas           | Usage tab                          | tenants + plans + subscriptions                      |
| Settings                 | Platform settings in Plans tab     | `platform-settings` only when Plans open             |
| Deals & Boosts           | Deals tab                          | deals + insights + pricing (lazy chunk)              |
| Limits                   | Limits tab                         | limit keys, overrides, addons (lazy chunk)           |
| Operations               | Operations tab                     | operational summary + sub-tabs (lazy chunk)          |
| Health                   | Health tab                         | reuses shared health query                           |
| Sidebar                  | `Sidebar.tsx`                      | existing entitlements/stats queries unchanged        |

---

## 3. Build results

| Command                             | Result                               |
| ----------------------------------- | ------------------------------------ |
| `pnpm --filter @supplify/web build` | **Pass** (after TS fix)              |
| `pnpm typecheck`                    | Included in build (`tsc`) — **Pass** |
| Bundle analyzer                     | **Not configured** in repo           |
| Lighthouse                          | **Not configured** in CI             |

Pre-fix build failed:

```
AdminTenantUsageTable.tsx(61,47): error TS2345 — undefined not assignable to number | null
```

---

## 4. Bundle / chunk observations (Vite production build)

No new dependencies. Existing manual chunks preserved (`charts`, `calendar`, `motion`, `ui-vendor`, `query-vendor`, etc.).

| Chunk                         | Size (min) | gzip      | Notes                                                |
| ----------------------------- | ---------- | --------- | ---------------------------------------------------- |
| `AdminDashboardPage-*.js`     | 118.98 kB  | 27.18 kB  | Main admin shell (still large; sub-panels split out) |
| `AdminDealsPanel-*.js`        | 22.40 kB   | 5.99 kB   | Lazy — loads on Deals tab only                       |
| `AdminLimitsTab-*.js`         | 18.59 kB   | 5.06 kB   | Lazy — loads on Limits tab only                      |
| `AdminOperationsPanel-*.js`   | 13.22 kB   | 3.59 kB   | Lazy — loads on Operations tab only                  |
| `AdminFeatureFlagsPanel-*.js` | 6.07 kB    | 1.83 kB   | Lazy                                                 |
| `AdminUsersTab-*.js`          | 3.87 kB    | 1.67 kB   | Lazy                                                 |
| `charts-*.js`                 | 321.29 kB  | 81.53 kB  | Unchanged; not pulled into admin route               |
| `vendor-*.js`                 | 606.89 kB  | 193.08 kB | Shared app vendor                                    |

**icons:** `lucide-react` remains tree-shaken via named imports; no whole-pack import added.

---

## 5. Duplicate API calls found

| Issue                                     | Before                                                                          | After                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/admin-dashboard/health`         | Two hooks: overview tab + health tab (same cache key, but redundant hook setup) | **Single** `useGetAdminHealthQuery` when `overview` or `health` active                                      |
| Deals/Limits/Operations/Users/Features    | Child components could mount with Radix tabs (hooks on first admin visit)       | **Mount only when `selectedTab` matches** + `React.lazy`                                                    |
| Tenant list cache keys                    | Dashboard `limit=50`, Limits/Operations `limit=100`                             | **Documented** — intentional; different pages need different page sizes. RTK cache dedupes when args match. |
| `invalidatesTags: ['Admin']` on plan save | Refetches all admin-tagged queries                                              | **Unchanged** — correct for admin edits; mitigated by longer `keepUnusedDataFor`                            |

**Already good (unchanged):**

- Global RTK `refetchOnFocus: false`
- Tab-scoped `skip` on overview, plans, subscriptions, audit, activity, finance, tenants
- Operations sub-tab queries skip until sub-tab selected (`email`, `fulfillment`, `gps`)

---

## 6. Re-render / performance issues found

| Issue                                                                  | Fix                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `dedupeAdminPlans` / subscription dedupe recreated every render        | Moved dedupe helper **outside** component; `useMemo` for `plans`, `subscriptions`, `changePlanPlanOptions` |
| `supplierProductLimit` / `restaurantOrdersPerDayLimit` inline closures | `useCallback` keyed on `plans`                                                                             |
| Heavy admin panels in main admin chunk                                 | `React.lazy` + `Suspense` with lightweight spinner                                                         |
| `useGetAdminFinancialOverviewQuery` via `(api as any)`                 | Typed export + direct hook                                                                                 |

---

## 7. Fixes applied

**Files changed:**

- `apps/web/src/pages/AdminDashboardPage.tsx` — lazy tabs, single health query, memoization
- `apps/web/src/services/api.ts` — `keepUnusedDataFor: 300` on admin endpoints; export financial overview hook
- `apps/web/src/lib/adminPlanLimitLookup.ts` — accept `undefined` limit in formatter
- `apps/web/src/lib/adminPlanLimitLookup.test.ts` — test for undefined
- `apps/web/src/components/admin/AdminLimitsTab.tsx` — stable tenant list query args

---

## 8. Caching behavior

| Endpoint / data                                                | `keepUnusedDataFor`                  | `refetchOnFocus` |
| -------------------------------------------------------------- | ------------------------------------ | ---------------- |
| Admin overview, plans, subscriptions, health, conversion-stats | **300s** (was 120s default)          | false (global)   |
| Admin suppliers/restaurants lists                              | **300s**                             | false            |
| Admin deals + insights                                         | **300s**                             | false            |
| Admin limit keys                                               | **300s** + `providesTags: ['Admin']` | false            |
| Entitlements (sidebar)                                         | 300s (existing)                      | false            |

Plan PATCH still uses `invalidatesTags: ['Admin']` — intentional so edits stay correct; cache TTL reduces repeat work when switching tabs.

---

## 9. Remaining risks

1. **`AdminDashboardPage` shell (~119 kB)** — still monolithic; further split would be a larger refactor (out of scope).
2. **Tenant list `limit=50` vs `100`** — visiting Usage then Limits may fetch two supplier/restaurant pages; acceptable for correctness.
3. **Railway cold start** — API idle + first admin load still depends on backend pool warmup (documented in `docs/audits/performance/GLOBAL_PERFORMANCE_AUDIT_AND_FIXES.md`).
4. **No automated Lighthouse** — manual check recommended after deploy.
5. **Picsum product images on dev** — network latency for images is external to app bundle.

---

## 10. Manual QA checklist

- [ ] Open app fresh in incognito → https://app-dev.supplifyerp.com
- [ ] Login as platform admin
- [ ] Open **Admin Dashboard** (Overview) — first paint &lt; ~2s on warm API
- [ ] Network tab: expect **overview**, **conversion-stats**, **health** only (no deals/limits/users)
- [ ] Switch tabs: Plans, Usage, Features, Deals, Limits, Health, Operations, Users
- [ ] Confirm no visible lag on tab switch; Deals/Limits show brief spinner first visit only
- [ ] Revisit Overview — should **not** refetch overview if within 5 min (RTK cache)
- [ ] Open **Supplier Admin** / **Restaurant Admin** routes
- [ ] Open **Usage & Quotas** — tenant tables render; no console errors
- [ ] Open **Settings** (supplier/restaurant) — unchanged perf
- [ ] Supplier **Promotions / Deals** page — wording only; no extra admin calls
- [ ] Browser console: no errors
- [ ] Optional: Chrome DevTools Performance recording on Overview
- [ ] Idle 1–2 min, reopen admin — still responsive (Railway wake)

---

## Commands run

```bash
pnpm --filter @supplify/web build
pnpm --filter @supplify/web test:run -- src/lib/adminPlanLimitLookup.test.ts src/lib/adminUsageStatus.test.ts src/components/admin/AdminOperationsSnapshot.test.tsx src/components/admin/AdminTenantUsageTable.test.tsx src/components/admin/AdminOverviewExtras.test.tsx
```

---

## API request map (first load, Overview tab)

| Request                                             | When                     |
| --------------------------------------------------- | ------------------------ |
| `GET /auth/me`                                      | App bootstrap            |
| `GET /api/admin-dashboard/overview`                 | Overview tab             |
| `GET /api/admin-dashboard/conversion-stats?days=30` | Overview tab             |
| `GET /api/admin-dashboard/health`                   | Overview tab (KPI strip) |

**Not fired until tab opened:** plans, subscriptions, suppliers, restaurants, deals, limits, users, audit, activity, finance, operations payloads.
