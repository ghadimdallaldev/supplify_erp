# Supplify Admin Visibility Features Report

**Date:** 2026-06-03  
**Branch:** `dev`  
**Scope:** Platform admin operational visibility (read-only monitoring/support)

## Summary

Extended the existing admin dashboard with an **Operations** tab, overview/health wiring, and per-tenant **Diagnostics** — without rebuilding admin or duplicating Deals/Limits/Features flows.

## Existing admin features reused

- [`AdminDashboardPage.tsx`](../../apps/web/src/pages/AdminDashboardPage.tsx) tab shell + RBAC (`ADMIN_ACCESS`, `ADMIN_TENANTS`, etc.)
- [`AdminOverviewExtras.tsx`](../../apps/web/src/components/admin/AdminOverviewExtras.tsx) attention list pattern
- [`AdminDealsPanel.tsx`](../../apps/web/src/components/admin/AdminDealsPanel.tsx) — deals remain separate; warnings link to Deals tab
- [`AdminLimitsTab.tsx`](../../apps/web/src/components/admin/AdminLimitsTab.tsx) + [`AdminTenantPicker.tsx`](../../apps/web/src/components/admin/AdminTenantPicker.tsx)
- [`adminUi.tsx`](../../apps/web/src/components/admin/adminUi.tsx) cards, tables, badges, empty/loading states
- [`admin-dashboard.routes.js`](../../apps/api/src/routes/admin-dashboard.routes.js) guard stack + [`parseAdminListPagination`](../../apps/api/src/lib/admin-list-pagination.js)
- [`buildAdminOverviewMetrics`](../../apps/api/src/lib/admin-overview-metrics.js), [`buildTrackingPayload`](../../apps/api/src/lib/delivery-tracking-payload.js), [`redactEmail`](../../apps/api/src/services/email/email-delivery-log.js)

## New visibility added

### Backend (`apps/api/src/lib/admin-operational-metrics.js`)

| Endpoint                                                                | Purpose                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/admin-dashboard/operational-summary`                          | Platform rollup + `warnings[]`                                                    |
| `GET /api/admin-dashboard/operational/email-logs`                       | Paginated delivery log (redacted recipients)                                      |
| `GET /api/admin-dashboard/operational/fulfillment-issues`               | Open shortage/substitution issues                                                 |
| `GET /api/admin-dashboard/operational/active-deliveries`                | Active deliveries with GPS state badge only                                       |
| `GET /api/admin-dashboard/tenants/:tenantType/:id/operational-snapshot` | Per-tenant diagnostics                                                            |
| `GET /api/admin-dashboard/health`                                       | Now includes `emailFailures` (24h)                                                |
| Overview metrics                                                        | `operational` counters: email failures, open fulfillment, stale GPS, expired lots |

### Frontend

| Area               | Change                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Operations tab** | [`AdminOperationsPanel.tsx`](../../apps/web/src/components/admin/AdminOperationsPanel.tsx)                                          |
| **Overview**       | Operational health row (4 cards → Operations sub-tabs)                                                                              |
| **Health**         | Email failures table when present                                                                                                   |
| **Tenants**        | **Diagnostics** button → [`AdminTenantDiagnosticsDrawer.tsx`](../../apps/web/src/components/admin/AdminTenantDiagnosticsDrawer.tsx) |
| **RTK Query**      | New hooks in [`api.ts`](../../apps/web/src/services/api.ts)                                                                         |

### Warnings (server-side, capped)

Email provider missing, high failed email rate, GPS/restaurant tracking mismatch, many stale GPS deliveries, suppliers with deliveries but no drivers, open fulfillment issues, many expired lots, pending deals.

## Security / privacy

- Admin-only routes; non-admin → 401 (see `tests/api/admin-rbac.spec.ts`)
- No SMTP passwords or API keys in responses
- Email recipients redacted; no full GPS ping history or coordinate trails in admin APIs
- Restaurant tracking privacy shown as platform env flags only

## Tests added/updated

| File                                | Result                             |
| ----------------------------------- | ---------------------------------- |
| `admin-operational-metrics.test.js` | Pass                               |
| `admin-overview-metrics.test.js`    | Pass                               |
| `admin-dashboard.routes.test.js`    | Pass (41 tests)                    |
| `AdminOverviewExtras.test.tsx`      | Pass                               |
| `AdminOperationsPanel.test.tsx`     | Pass (after empty-state label fix) |
| `tests/api/admin-rbac.spec.ts`      | Extended (operational routes 401)  |

**Commands run:**

```text
npx vitest run src/lib/admin-operational-metrics.test.js src/lib/admin-overview-metrics.test.js src/routes/admin-dashboard.routes.test.js  # api: 41 passed
npx vitest run src/components/admin/AdminOperationsPanel.test.tsx src/components/admin/AdminOverviewExtras.test.tsx  # web: 5 passed (after fix)
```

Playwright `admin-rbac` not re-run (requires live API).

## Documentation

- [admin-operations-visibility.md](./admin-operations-visibility.md)
- [admin_endpoints.md](../blueprint/admin/admin_endpoints.md) updated
- [ADMIN_PANEL_TABS_AUDIT.md](../admin/ADMIN_PANEL_TABS_AUDIT.md) updated

## Remaining gaps

1. Job/webhook health collectors still unimplemented (email only).
2. Platform-wide `limitExceededTenants` not computed (null in summary).
3. Subscriptions admin list still unpaginated.
4. No dedicated `/app/admin/tenants/:id` page (drawer-only by design).
5. `AdminModelComparisonPanel.tsx` still unused dead code.

## Recommended next improvements

- Paginate `GET /subscriptions` for large fleets.
- Optional cron last-run status for `operational-reminders` job on Operations summary.
- Surface tenant `audit_logs` as read-only link from diagnostics (separate from platform `admin_audit_log`).
