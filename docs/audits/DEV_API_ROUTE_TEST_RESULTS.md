# Dev API Route Test Results

**Date:** 2026-06-11
**Base URL:** https://supplify-api-dev-development.up.railway.app
**Test mode:** safe | **Mutations:** false

## Latest run summary

| Metric                | Count |
| --------------------- | ----- |
| Total tested          | 125   |
| Passed                | 116   |
| Failed                | 0     |
| Skipped               | 9     |
| Slow (over threshold) | 1     |
| 500 errors            | 0     |

### Skip reasons

- **SKIPPED_UNSAFE**: 3
- **SKIP_NO_CONTEXT**: 1
- **SKIP_MUTATION**: 1
- **NEEDS_SEED_DATA**: 4

### Auth token sources

- **admin**: env_override — OK (SUPPLIFY_ADMIN_TOKEN set (eyJhbGciOiJS…))
- **supplier**: keycloak_grant — OK (Keycloak password grant OK)
- **restaurant**: keycloak_grant — OK (Keycloak password grant OK)
- **staff**: unavailable — FAIL (no env override and no default credentials)

## Run history

- **baseline-2026-06-11** (2026-06-11T15:21:32) — pass 16 / fail 0 / skip 0 / total 16
- **expanded-2026-06-11** (2026-06-11T15:57:43) — pass 116 / fail 0 / skip 9 / total 125

## Slowest routes (latest)

- `GET /health` — 692ms
- `GET /ready` — 458ms
- `GET /api/admin-dashboard/overview` — 415ms
- `GET /api/orders/calendar/` — 283ms
- `GET /api/products` — 271ms
- `GET /api/restaurant-org/users` — 256ms
- `GET /api/admin-dashboard/activity` — 251ms
- `GET /api/branches/` — 244ms
- `GET /api/admin-dashboard/tenants/suppliers` — 235ms
- `GET /api/admin-dashboard/overview` — 234ms
- `GET /api/quick-lists` — 234ms
- `GET /api/restaurants/me` — 227ms
- `GET /api/admin-dashboard/tenants/search?q=demo` — 223ms
- `GET /api/admin-dashboard/operational-summary` — 219ms
- `GET /api/audit/logs` — 219ms

## Manual QA checklist

- [ ] Admin token can access admin overview
- [ ] Supplier token can access products/inventory/orders/command-center
- [ ] Restaurant token can access dashboard/expiry/quick-lists/invoices
- [ ] Staff token can access only staff self routes (if token available)
- [ ] Staff → /api/staff/members returns 403
- [ ] Supplier/restaurant → admin returns 403
- [ ] Unauthenticated gets 401 on protected routes
- [ ] Cross-tenant 403/404 verified
- [ ] No unexpected 500s
