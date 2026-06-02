# Production Readiness Audit

**Date started:** 2026-06-02  
**Scope:** Database performance, API/code performance, UI responsiveness, security, uploads, auth/RBAC, error handling, logging, maintainability, testing, deployment readiness.

**Related prior audits:** [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md), [docs/PERFORMANCE_AUDIT.md](docs/PERFORMANCE_AUDIT.md), [docs/RBAC_FULL_APP_AUDIT.md](docs/RBAC_FULL_APP_AUDIT.md), [docs/UI_UX_POLISH_AUDIT.md](docs/UI_UX_POLISH_AUDIT.md), [docs/operations/production-readiness.md](docs/operations/production-readiness.md).

---

## Summary of what was audited

| Area            | Method                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| Database        | Static review of hot routes, migrations, N+1 patterns, unbounded queries                                        |
| API performance | Admin dashboard, fulfillment dispatch, reports, receiving                                                       |
| Security / RBAC | Existing controls + upload paths, staff documents, presign pipeline                                             |
| Uploads         | [docs/operations/STORAGE_UPLOADS.md](docs/operations/STORAGE_UPLOADS.md), `files.routes.js`, S3/local providers |
| UI              | High-traffic pages + admin tenant tables (partial prior polish)                                                 |
| Tests           | `pnpm test:ci`, `pnpm test:rbac`, `pnpm build`, `pnpm lint`                                                     |

Query layer uses parameterized SQL via [`apps/api/src/lib/db.js`](apps/api/src/lib/db.js) `query()` (not Sequelize / `console.safeQuery`).

---

## Issues found

### Performance (P0 — addressed this pass)

| Issue                                                | Location                                                     | Risk                        |
| ---------------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| Unbounded admin tenant lists + correlated subqueries | `GET /api/admin-dashboard/tenants/suppliers`, `/restaurants` | Full table scan at scale    |
| Activity feed scans all history per branch           | `buildAdminActivityFeed`                                     | Memory + DB load            |
| Dispatch board four unbounded queries                | `GET /api/fulfillment/dispatch`                              | Slow for large order volume |
| Reports without max date span                        | `parseReportQuery`                                           | Wide date windows           |
| N+1 on receiving pending orders                      | `receiving.routes.js`                                        | Extra queries per order     |

### Security (P1 — addressed / documented)

| Issue                                            | Status                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| S3 presign without upload size cap on direct PUT | Mitigated via token max bytes + API PUT 10mb limit |
| MIME vs file extension mismatch                  | Validated at presign                               |
| Staff document `fileUrl` without ownership check | Fixed with upload URL assertion                    |
| In-memory rate limits multi-instance             | Documented remaining risk                          |
| Malware scanning                                 | TODO hook added                                    |

### UI (partial)

| Issue                                     | Status                             |
| ----------------------------------------- | ---------------------------------- |
| Admin tenant tables unbounded client load | Pagination + load more             |
| Products/orders tables on small screens   | Overflow wrappers + loading states |

---

## Changes made

_See sections below; updated as implementation completes._

---

## Database optimizations

- Migration [`0132_production_readiness_perf_indexes.sql`](apps/api/db/migrations/0132_production_readiness_perf_indexes.sql): `order_item(supplier_id, order_id)`, partial `customer_order(placed_at)`, `conversion_event` indexes.
- Admin tenant lists: JOIN aggregates instead of per-row correlated `COUNT` subqueries; `LIMIT`/`OFFSET` pagination.
- Activity feed: time window (default 30 days, max 90) + per-branch fetch cap.
- Receiving pending orders: single batch query for all order items.

---

## Security improvements

- `assertFileExtensionMatchesMime` on presign.
- Staff document create: `assertChatAttachmentUrl` for `fileUrl`.
- Upload token optional `maxBytes`; `completeUpload` rejects oversized bodies.
- S3 presign: sign `content-length` when `fileSize` provided.
- Legal markdown: `href` protocol allowlist.

---

## Upload security improvements

- Extension/MIME consistency check at presign.
- Max body size enforced on token completion path.
- Malware scan TODO in storage `completeUpload` paths.

---

## UI responsiveness improvements

- Admin tenants tab: pagination controls, “load more”, table overflow wrapper.
- Products page: responsive table wrapper and loading affordance where missing.

---

## Tests added/updated

| Test                      | File                             |
| ------------------------- | -------------------------------- |
| Admin tenant pagination   | `admin-dashboard.routes.test.js` |
| Activity feed days window | `admin-activity-feed.test.js`    |
| Dispatch days/limit       | `fulfillment.routes.test.js`     |
| Reports max span          | `reports.service.test.js`        |
| Upload MIME/extension     | `sanitize-upload.test.js`        |

---

## Commands run

| Command          | Result                                                                  |
| ---------------- | ----------------------------------------------------------------------- |
| `pnpm test:api`  | **782 passed** (132 files)                                              |
| `pnpm test:web`  | **202 passed** (59 files) — from earlier `pnpm test:ci`                 |
| `pnpm test:rbac` | **170 passed** (156 API + 14 web)                                       |
| `pnpm build`     | **Pass** (web `tsc` + Vite; minor TS fix in `api.ts` transformResponse) |
| `pnpm lint`      | **Warnings only** (pre-existing; web `max-warnings 0` fails)            |
| `pnpm typecheck` | **Pass** after transformResponse type fix                               |

Apply migration before deploy: `pnpm db:migrate`

---

## Remaining risks

- Admin overview / conversion widgets may still use heavy `COUNT(*)` on large tables.
- Admin tenant revenue/spend sums on dashboard use **current page** unless using overview metrics endpoint.
- In-memory rate limiting does not coordinate across API replicas (use Redis store in production).
- No load testing or `EXPLAIN ANALYZE` on production-sized data in this pass.
- Legal HTML uses lightweight markdown parser (not DOMPurify); content is static repo files only.
- `express.raw` upload path buffers up to 10MB per request.
- Duplicate migration filenames `0130_*` — verify migrator ordering in deploy.

---

## Recommended next steps

1. Run `EXPLAIN ANALYZE` on staging for dispatch, admin tenants, activity feed.
2. Redis-backed `express-rate-limit` store for multi-instance deploys.
3. Admin tenant aggregates endpoint for platform-wide revenue (avoid client-side sum on pages).
4. Unified `activity_event` table or materialized view for admin feed.
5. Optional ClamAV/async scan integration at upload complete.
6. Frontend code-splitting for `DashboardPage` / `AdminDashboardPage` chunks (monitor bundle).

---

## Production Readiness Checklist

### Database

- [x] Queries reviewed
- [x] N+1 issues checked (receiving batch fix; others documented)
- [x] Indexes checked (0132 added)
- [x] Pagination checked (admin tenants)

### Security

- [x] Auth checked (existing Keycloak + cookies)
- [x] RBAC checked (`pnpm test:rbac`)
- [x] Tenant isolation checked (existing tests)
- [x] Upload security checked
- [x] Secrets/logging checked (validate-config, no params in SQL logs)

### Performance

- [x] Large payloads checked (10mb limits)
- [x] Slow endpoints checked (admin, dispatch, reports)
- [x] External API timeouts checked (documented in prior audits)

### UI

- [x] Mobile responsiveness checked (targeted pages)
- [x] Loading states checked (admin tenants, products)
- [x] Error states checked (existing patterns)
- [x] Empty states checked (existing patterns)

### Testing

- [x] Tests run
- [x] Critical tests added
