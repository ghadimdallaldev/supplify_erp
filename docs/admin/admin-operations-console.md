# Admin operations console

Platform admin monitoring and support tools on `/app/admin`.

## Active surfaces

| Tab / area                                   | Doc / component                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Operations (email, GPS, fulfillment, trials) | [admin-panel-operations.md](../features/admin-panel-operations.md)      |
| Full admin guide (tabs, plans, tenants)      | [admin-guide.md](./admin-guide.md)                                      |
| Feature flags                                | [feature-flags.md](./feature-flags.md)                                  |
| API endpoints                                | [admin_endpoints.md](../archive/old/blueprint/admin/admin_endpoints.md) |

## What Operations monitors

Read-only rollups: email delivery failures, open fulfillment issues, stale GPS deliveries, expired inventory lots, pending deals, subscription/trial warnings. Per-tenant **Diagnostics** drawer for support.

## Historical reports

Implementation and tab audits: [archive/audits/](../archive/audits/) (`admin-panel-tabs-audit.md`, `admin-dashboard-metrics-audit.md`, `admin-visibility-features-report.md`).
