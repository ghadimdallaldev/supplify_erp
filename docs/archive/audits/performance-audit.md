# Performance audit — pre-staging launch

**Date:** 2026-05-28  
**Scope:** API, database, web bundle, PWA, admin/supplier/restaurant flows, jobs, notifications, uploads, reports.  
**Method:** Static code review + existing test/build verification. No load testing (`EXPLAIN ANALYZE`) was run in this pass.

---

## Executive summary

The platform is **staging-ready for pilot volume** after targeted guardrails (query limits, N+1 fixes, indexes). **Admin tenant lists**, **admin activity feed**, and **fulfillment dispatch** remain the highest-risk endpoints at scale and need phased hardening post-launch.

**Tests:** `pnpm test:api` — 117 files, **684 passed**  
**Build:** `pnpm build` — **pass** (tsc + vite)

---

## Top slow endpoints (ranked)

| Priority       | Endpoint                                                     | Primary cause                                                       |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| P0 (remaining) | `GET /api/admin-dashboard/activity`                          | Up to 15 full-table scans, merge in memory                          |
| P0 (remaining) | `GET /api/admin-dashboard/tenants/suppliers` / `restaurants` | No pagination; per-row correlated aggregates                        |
| P0 (remaining) | `GET /api/fulfillment/dispatch`                              | Four parallel unbounded order queries (no date cap on open buckets) |
| P1             | `GET /api/admin-dashboard/overview`                          | Multiple full-table `COUNT(*)`                                      |
| P1             | `GET /api/admin-dashboard/subscriptions`                     | Unbounded subscription list                                         |
| P1             | `GET /api/reports/*`                                         | Wide date windows without hard max range                            |
| Mitigated      | `GET /api/supplier-ops/deliveries/board`                     | Was unbounded without `date`; now **14-day default + LIMIT 500**    |
| Mitigated      | `GET /api/chat/conversations`                                | Was unbounded; now **LIMIT 200**                                    |
| Mitigated      | `GET /api/invoices/` (supplier list)                         | Was unbounded; now **LIMIT 500**                                    |
| Mitigated      | `GET /api/supplier-ops/command-center` reorder block         | Was N+1 (50 queries); now **single batch SQL**                      |
| Mitigated      | `GET /api/fulfillment/routes`                                | Was N+1 stops; now **batch load + LIMIT 200 routes**                |
| OK             | `GET /api/reservations/board`                                | Day-scoped                                                          |
| OK             | `GET /api/public/reservations/availability`                  | Day-scoped + indexes (`0103`)                                       |

---

## Database

### Indexes added (migration)

**File:** `apps/api/db/migrations/0128_staging_launch_perf_indexes.sql`

| Index                                            | Purpose                                                    |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `message (conversation_id, created_at DESC)`     | Last-message preview in conversation list                  |
| `driver_assignments (order_id, created_at DESC)` | Latest assignment lateral joins (dispatch, delivery board) |
| `invoice (supplier_id, status)`                  | Open receivables / supplier invoice filters                |

**Apply:** `pnpm db:migrate` before staging.

### Indexes already present (reference)

- Orders: `0038`, `0071`, `0103` (`restaurant_id`, `placed_at`, `branch_id`)
- Reservations: `0033`, `0103`
- Promotions: `0074`, `0124` (boost windows)
- Subscriptions / usage: `0091`
- Driver fulfillment: `0088`

### Recommended later (not in this pass)

| Table                  | Suggested index                                      | Why                           |
| ---------------------- | ---------------------------------------------------- | ----------------------------- |
| `customer_order`       | Partial on active fulfillment statuses + `placed_at` | Dispatch/board status filters |
| `reservation_waitlist` | `(restaurant_id, status, position)`                  | Board waitlist ordering       |

---

## Safe fixes made (this pass)

| Area                    | Change                                                       |
| ----------------------- | ------------------------------------------------------------ |
| Supplier delivery board | Default **14-day** window when `date` omitted; **LIMIT 500** |
| Chat                    | Conversation list **LIMIT 200**; messages **limit max 100**  |
| Invoices (supplier)     | **LIMIT 500** on list                                        |
| Orders list             | **limit capped at 100** (Zod transform)                      |
| Command center reorder  | **Batch** suggested-products query (removes N+1)             |
| Delivery routes list    | **Batch** route stops; **LIMIT 200** routes                  |
| DB migration            | `0128_staging_launch_perf_indexes.sql`                       |

---

## Frontend bundle

| Finding                             | Severity | Notes                                                  |
| ----------------------------------- | -------- | ------------------------------------------------------ |
| `index-*.js` ~622 kB / ~191 kB gzip | P1       | Main chunk; acceptable for ERP, monitor                |
| `DashboardPage` ~431 kB             | P1       | Calendar + charts; lazy route already via React Router |
| `AdminDashboardPage` ~144 kB        | P1       | Heavy admin UI                                         |
| `ReservationsPage` ~171 kB          | P1       | FullCalendar                                           |
| Vite chunk warnings (>500 kB)       | P2       | Documented; code-splitting is post-launch              |
| PWA SW                              | OK       | Does not cache `/api`, `/auth`, `/socket.io`           |
| Lazy loading                        | OK       | Most app routes use `React.lazy` in `App.tsx`          |
| Reservation board polling           | OK       | 30s polling on hook (moved from endpoint def)          |

**Recommendation:** Defer aggressive code-splitting until post-staging metrics; no launch blocker.

---

## Mobile / PWA

| Item                             | Status                           |
| -------------------------------- | -------------------------------- |
| Service worker sensitive paths   | OK — see `apps/web/static/sw.js` |
| Offline page                     | OK — no private data             |
| Touch targets (driver/receiving) | OK — prior PWA audit             |
| `100dvh` / safe-area             | OK — `index.css`                 |

---

## UX performance

| Item                         | Status                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Loading / skeletons          | Present on major pages (command center, admin, orders)                               |
| Error + retry                | Common pattern; not audited exhaustively                                             |
| Fake zeros on failed metrics | Admin overview uses per-query fallbacks (`admin-overview-metrics.js`) — verify in QA |

---

## Remaining performance risks

1. **Admin activity feed** — highest CPU/IO risk under growth.
2. **Admin tenant directory** — unbounded list + correlated subqueries.
3. **Fulfillment dispatch** — four large queries per warehouse view.
4. **In-memory rate limiting** — weak under multi-instance API (ops, not query perf).
5. **Reports** — no max date-span cap (client can request huge ranges).
6. **Redis optional** — calendar cache logs connection attempts; non-fatal if Redis absent.

---

## Tests and build

```bash
pnpm test:api    # 684 passed
pnpm test:web    # 158 passed
pnpm build       # pass (tsc + vite)
```

Targeted areas exercised by existing suites: billing, RBAC, public routes, admin dashboard, fulfillment dispatch utils, PWA, supplier pain-killer (reorder batch).

---

## Staging recommendation

**Go** for controlled staging / pilot tenants with:

1. Run migration `0128` on staging DB.
2. Monitor slow query log on admin dashboard and fulfillment dispatch.
3. Plan post-launch sprint for admin pagination + activity feed windowing.
