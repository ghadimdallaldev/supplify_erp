# Audits & inventories

Active audit reports, route inventories, and performance/cache analysis. Historical point-in-time reports live in [`../archive/audits/`](../archive/audits/).

## Route & API coverage

| File                                                                 | Purpose                              |
| -------------------------------------------------------------------- | ------------------------------------ |
| [route-inventory.json](./route-inventory.json)                       | Machine-readable API route catalog   |
| [DEV_API_ROUTE_TEST_MATRIX.md](./DEV_API_ROUTE_TEST_MATRIX.md)       | QA matrix aligned to route inventory |
| [DEV_API_ROUTE_TEST_RESULTS.md](./DEV_API_ROUTE_TEST_RESULTS.md)     | Latest test run summary              |
| [dev-api-route-test-results.json](./dev-api-route-test-results.json) | Raw test results                     |
| [dev-api-preflight.json](./dev-api-preflight.json)                   | Preflight check output               |
| [partials/](./partials/)                                             | Per-phase route test JSON            |

## Feature & platform audits

| File                                                                                                                     | Topic                               |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| [CRON_AND_BACKGROUND_JOBS_AUDIT.md](./CRON_AND_BACKGROUND_JOBS_AUDIT.md)                                                 | Cron and background jobs            |
| [REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md](./REORDER_BRANDING_DEALS_WAREHOUSE_SUPPORT_FEATURE_AUDIT.md) | Reorder, branding, deals, warehouse |
| [SUPPLIFY_DEMO_READINESS_AUDIT.md](./SUPPLIFY_DEMO_READINESS_AUDIT.md)                                                   | Demo environment gaps               |
| [PLAN_TIER_FUNCTIONALITY_AUDIT.md](./PLAN_TIER_FUNCTIONALITY_AUDIT.md)                                                   | Plan tier behavior                  |
| [STOCK_STATUS_CRITERIA_AUDIT.md](./STOCK_STATUS_CRITERIA_AUDIT.md)                                                       | Stock status rules                  |
| [ADMIN_USAGE_METRICS_BACKEND_COMPLETION.md](./ADMIN_USAGE_METRICS_BACKEND_COMPLETION.md)                                 | Admin usage metrics backend         |
| [DEV_API_AUTH_DEV.md](./DEV_API_AUTH_DEV.md)                                                                             | Dev API auth notes                  |
| [SUPPLIFY_ROLE_TEST_MATRIX.md](./SUPPLIFY_ROLE_TEST_MATRIX.md)                                                           | Role test matrix                    |
| [supplify-quick-performance-ui-db-security-audit.md](./supplify-quick-performance-ui-db-security-audit.md)               | Performance, UI, DB, security       |

## Performance & cache

| Folder                         | Contents                                               |
| ------------------------------ | ------------------------------------------------------ |
| [performance/](./performance/) | Global performance audit, current state, safe fix plan |
| [cache/](./cache/)             | Cache inventory and fix plan                           |

## Archived (June 2026)

Moved to [`../archive/audits/`](../archive/audits/): `SUPPLIFY_FULL_DEV_AUDIT_2026.md`, `2026-06-17-full-app-audit-and-fixes.md`, `SUPPLIFY_AUDIT_FIX_LOG.md`, `ADMIN_UI_PERFORMANCE_REGRESSION_AUDIT.md`, `fixes-applied.json`.
