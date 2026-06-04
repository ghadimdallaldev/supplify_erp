# Performance & Security Audit — May 2026

**Scope:** `apps/api`, `apps/web` (incremental review; builds on [SECURITY_AUDIT_REPORT.md](../security/SECURITY_AUDIT_REPORT.md))

**Stack:** Express + PostgreSQL + Keycloak (httpOnly JWT cookies) · React 18 + Vite + RTK Query

---

## Executive summary

Most critical security controls are already in place (CSRF on cookie APIs, Helmet, CORS allowlist, Keycloak JWT, socket chat authorization, upload sanitization, production secret validation). This pass targets **gaps in new deal/promotion flows**, **N+1 list APIs**, **admin UI over-fetching**, and **production payment waivers**.

| Priority | Area                         | Risk                                                                      | Action                                            |
| -------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| P0       | Deal boost (`POST /promote`) | Suppliers can activate paid boosts without payment (`waivePayment: true`) | Gate waiver to non-production unless env flag set |
| P0       | Admin deal routes            | `ADMIN` role without `ADMIN_ACCESS` permission                            | Add `resolveAdminContext` + `requirePermission`   |
| P1       | `GET /api/promotions`        | N+1 queries (`enrichPromotionRow` per row), unbounded list                | Pagination + batch enrichment                     |
| P1       | Admin dashboard UI           | 10+ RTK queries on mount regardless of tab                                | `skip` by active tab                              |
| P1       | Frontend bundle              | All pages eagerly imported                                                | Route-level `React.lazy`                          |
| P2       | Rate limits                  | Orders/promotions writes share global 300/15min                           | Dedicated write limiters                          |
| P2       | DB                           | Admin overview filters on `placed_at`                                     | Index on `customer_order(placed_at)`              |
| P2       | Redis rate limiting          | Multi-replica deployments                                                 | Documented; not implemented (existing TODO)       |

---

## Performance risks

### Backend

- **`GET /api/promotions` (supplier list):** Loads all deals for a supplier, then runs 2 queries per row for targets + active boost → classic N+1.
- **`GET /api/promotions/admin/deals`:** Hard `LIMIT 200` without offset; acceptable for admin but not paginated.
- **`GET /api/admin-dashboard/overview`:** ~15 parallel aggregate queries (acceptable for admin-only, cached client-side via RTK).
- **Cron jobs in `server.js`:** Scheduled orders every 5 minutes (comment says testing) — operational cost, not a request-path issue.

### Frontend

- **No route code-splitting:** `App.tsx` statically imports all pages → larger initial JS.
- **`AdminDashboardPage`:** Fires overview, conversion, plans, subscriptions, audit, activity, health, finance, suppliers, restaurants on first paint.
- **RTK Query:** Good tag invalidation; `keepUnusedDataFor: 300` on `/auth/me` only — consider for heavy admin queries after tab deferral.

### Database

- Existing indexes on `promotions(supplier_id, status, …)`, `customer_order(restaurant_id, created_at)`.
- **Gap:** `customer_order.placed_at` used in admin overview aggregates — add index if missing.

---

## Security risks

### Already mitigated (see SECURITY_AUDIT_REPORT.md)

- CSRF (`X-Requested-With` + origin check)
- OAuth state validation
- Socket conversation membership
- File upload path traversal / attach ownership
- SQL mass-assignment whitelists
- Public API PII reduction
- Error handler hides stack in production

### Remaining / new

| Issue                                          | Severity                     | Notes                                                                        |
| ---------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `waivePayment: true` on deal promote           | **High** (prod monetization) | Creates `billing_status: waived` campaigns without payment                   |
| Admin promotion routes lack `ADMIN_ACCESS`     | **Medium**                   | Any Keycloak `admin` role vs app permission                                  |
| `POST …/pause` missing `supplier_id` in UPDATE | **Low**                      | Preceded by `loadPromotionForSupplier`; defense-in-depth fix applied         |
| Payment activation                             | **Medium**                   | `pay-activation` returns 402 until provider wired; resume blocks unpaid — OK |
| Tenant binding via `contact_email`             | **Medium**                   | Architectural; manual review                                                 |
| In-memory rate limit with multiple replicas    | **Medium**                   | Per-instance counters                                                        |
| Magic-byte upload validation                   | **Low**                      | MIME + extension only                                                        |

---

## Missing validations / authorization

- Supplier list promotions: auth OK via `router.use(requireAuth, …)`.
- Restaurant discovery routes: separate middleware earlier in file — OK.
- **Admin deal approve/reject:** needs `ADMIN_ACCESS` alignment with admin dashboard.
- **Promote:** must not waive payment in production.

---

## Slow or risky endpoints

| Endpoint                            | Concern                             |
| ----------------------------------- | ----------------------------------- |
| `GET /api/promotions`               | N+1 enrichment                      |
| `GET /api/admin-dashboard/overview` | Many aggregates (admin-only)        |
| `GET /api/admin-dashboard/activity` | Correlated subqueries per row       |
| `POST /api/promotions/:id/promote`  | Payment waiver                      |
| `POST /api/orders`                  | Heavy transaction; needs rate limit |

---

## Implemented in this pass

1. Batch `enrichPromotionRows` + paginated supplier promotions list
2. Production gate on `waivePayment` for deal boosts
3. `ADMIN_ACCESS` on promotion admin routes
4. Rate limiters for `/api/orders` and `/api/promotions` mutations
5. Index migration `customer_order(placed_at)`
6. Admin dashboard RTK `skip` by tab
7. Lazy-loaded routes in `App.tsx`
8. Tests: IDOR on supplier deal, resume without payment, unauthorized admin promote pricing

---

## Recommended follow-ups

1. Redis-backed rate limiting for horizontal scale
2. Paginate `GET /api/promotions/admin/deals` with `limit`/`offset`
3. Payment webhook to set `payment_status = paid` (never from client body)
4. `pnpm audit` in CI (`--audit-level=high`)
5. Virtualize long product/order tables in web UI
6. Review `executeScheduledOrders` interval for production (5 min vs 1 h)
