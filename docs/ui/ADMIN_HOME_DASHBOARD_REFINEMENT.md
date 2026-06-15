# Admin Home Dashboard Refinement

## 1. Summary

Refined the Supplify platform admin UI into a denser, more operational control center. The overview now leads with executive KPIs and an operations snapshot instead of Free Trial settings. Contextual page headers, compact components, usage tables, and improved status coloring make the admin area faster to scan without rebuilding the monolithic `AdminDashboardPage`.

## 2. Pages changed

| Page / Route                     | Changes                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/app/admin` (Overview)          | Reordered layout, executive KPIs, operations snapshot, enhanced attention/activity/quick actions |
| `/app/admin/suppliers`           | Supplier Control Center header, directory KPIs, search, usage table                              |
| `/app/admin/restaurants`         | Restaurant Control Center header, directory KPIs, search, usage table                            |
| `/app/admin` → Plans tab         | Subscription Defaults (Free Trial), compact plan cards, comma yearly pricing                     |
| `/app/settings` (platform admin) | Account Settings layout, admin portal nav, preference cards                                      |

## 3. Components added/updated

**Added**

- `AdminPageHeader`, `AdminKpiCard`, `AdminExecutiveSummary`, `AdminOperationsSnapshot`
- `AttentionPanel`, `RecentActivityList`, `QuickActionGrid`
- `UsageStatusBadge`, `UsageProgressBar`, `AdminTenantUsageTable`
- `adminUsageStatus.ts`, `adminPageHeaders.ts`, `adminActivityConfig.ts`, `formatPlanPrice.ts`

**Updated**

- `AdminPortalNav` — shorter labels, tighter active state
- `AdminOverviewExtras` — uses extracted panels, new quick actions
- `AdminPlatformSettingsPanel` — `compact` variant
- `adminUi.tsx` — `AdminErrorState`, `AdminLoadingSkeleton`
- `SettingsPage.tsx` — platform admin grid layout
- `AdminDashboardPage.tsx` — wiring and layout reorder

## 4. New dashboard layout

```
Platform Command Center (header)
├── Executive KPI row (6 cards)
├── Operations Snapshot (3 groups)
├── Needs Attention | Recent Activity | Quick Actions
├── Tenants & Revenue (compact KPIs)
├── Subscription Status Breakdown
└── Conversion Funnel (unchanged)
```

## 5. Where Free Trial length was moved

**From:** Admin Dashboard → Overview tab (top of page)

**To:** Admin Dashboard → **Plans tab** → **Subscription Defaults** section (above plan cards)

Save flow unchanged: `PATCH /api/admin-dashboard/platform-settings`, **7–90** day validation (default **30**).

Growth program settings (`AdminGrowthSettingsPanel` on Plans tab): `GET/PATCH /api/admin-dashboard/growth-settings` — referral discount %, validity, supplier reward type, sponsorship limits.

Free Trial plan cards show a read-only `{N}d trial` badge from platform settings.

## 6. KPI cards and data sources

| KPI                  | API / source                                                                   |
| -------------------- | ------------------------------------------------------------------------------ |
| Total tenants        | `overview.tenants.totalSuppliers + totalRestaurants`                           |
| Active suppliers     | `overview.tenantCounts.SUPPLIER`                                               |
| Active restaurants   | `overview.tenantCounts.RESTAURANT`                                             |
| Active subscriptions | `subscriptionStats.ACTIVE + TRIALING`                                          |
| Orders today         | `overview.orders.today`                                                        |
| System health        | `deriveSystemHealth()` from `GET /health` errors + overview alerts/operational |

## 7. Needs Attention logic

Built in `AttentionPanel` / `buildAttentionItems()` from:

- Deal insights (pending approval/payment)
- Overview alerts (past-due, trials expiring, overdue invoices)
- Health recent API errors
- Operational counters (email failures, fulfillment, stale GPS, expired lots)

Severity badges: Critical (red), Warning (amber), Info (blue). Healthy empty: _"All clear. No critical platform issues right now."_

## 8. Recent Activity behavior

`RecentActivityList` shows up to 8 events from `GET /api/admin-dashboard/activity`. Each row: title, subtitle (tenant), optional status badge, timestamp, type icon. Loading skeleton, error + retry, empty state supported.

## 9. Quick Actions behavior

Nine actions: Manage tenants, Review subscriptions, Plan limits, Feature overrides, Limit overrides, Health check, Audit logs, Review deals, Operations. Disabled when RBAC hides the target tab.

## 10. Operations Snapshot metrics

Grouped compact KPIs from overview payload. **Tenants over limit** and **near limit** now come from `GET /api/admin-dashboard/overview` (`tenantsOverLimit`, `tenantsNearLimit`) via `usage_meter` aggregates.

## 11. Supplier/Restaurant Usage & Quotas changes

- KPI summary row per tenant type
- Filterable usage table with progress bars and status badges
- Plans loaded on usage tab for accurate limit resolution
- Load-more pagination for tenant lists
- Restaurant spend KPI labeled **Lifetime spend** (not 30d)
- Backend completion pass wires real tenant usage fields (see `docs/audits/ADMIN_USAGE_METRICS_BACKEND_COMPLETION.md`)

**Supplier columns:** Supplier, Plan, Products, Warehouses, Active deals, Storage, Usage status, Actions

**Restaurant columns:** Restaurant, Plan, Orders today, Orders (30d), Connected suppliers, Inventory SKUs, Storage, Usage status, Actions

## 12. Settings page changes

Platform admins see `AdminPortalNav`, Account Settings header, balanced 3-column grid: Profile, Security, Notifications (+ coming-soon admin alerts), Admin Preferences (coming soon), Session/Login Info, Support.

## 13. Status/badge meanings

| Usage status  | Meaning            | Color |
| ------------- | ------------------ | ----- |
| Healthy       | Below 80% of limit | Green |
| Near limit    | ≥80% of limit      | Amber |
| Over limit    | Exceeds limit      | Red   |
| Unlimited     | Plan limit is -1   | Blue  |
| Not available | Limit unknown      | Gray  |

## 14. Missing backend data

| Item                             | Status                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Per-restaurant orders today      | **Available** — `orders_today` on restaurant tenant API                             |
| Restaurant suppliers connected   | **Available** — `connected_suppliers_count`                                         |
| Restaurant inventory SKUs        | **Available** — `inventory_skus_count`                                              |
| Storage usage                    | **Partial** — `storage_mb_used` when `usage_meter` row exists; else "Not available" |
| Supplier active deals            | **Available** — `active_deals_count`                                                |
| Platform-wide tenants-over-limit | **Available** — `tenantsOverLimit` / `tenantsNearLimit` on overview                 |
| Admin preferences API            | UI shows "Coming soon"                                                              |
| Billing/system alert toggles     | UI shows disabled "Coming soon"                                                     |

## 15. Manual QA checklist

- [ ] Open Admin Dashboard → Overview — confirm **Platform Command Center**
- [ ] Confirm Free Trial length is **not** on overview
- [ ] Confirm KPI cards and Operations Snapshot appear
- [ ] Confirm Needs your attention healthy/severity states
- [ ] Confirm Recent Activity readable with empty/loading states
- [ ] Confirm Quick Actions navigate correctly
- [ ] Open Supplier Admin → Directory + Usage & Quotas
- [ ] Open Restaurant Admin → Directory + Usage & Quotas
- [ ] Confirm usage tables, filters, status badges
- [ ] Open Plans tab — Subscription Defaults with Free Trial (**7–90** days, default **30**) + Growth program settings
- [ ] Open Settings as platform admin — balanced cards, portal nav
- [ ] Confirm responsive layout, no large blank areas

## 16. Risks / follow-up items

- `AdminDashboardPage.tsx` remains large; further tab extraction recommended
- `tenantsOverLimit` only counts limits present in `usage_meter` with `is_over_limit`
- Storage requires populated `usage_meter` rows; null when unmetered
- Catalog `trial_days` on free plan still not synced to runtime `platform_setting`

## Mobile parity

No mobile impact — platform admin UI is web-only.
