# Production readiness (consolidated)

This document merges the **status report**, **API findings**, and **PR-sized fix plan** that previously lived in three separate files at the repo root.

---

## Part 1 — Status report (completed work & deploy checklist)

### Completed updates

**Security fixes:** Updated `axios`, `react-router-dom`, `express`, `helmet`, `express-session`, `socket.io` / `socket.io-client`, `pg` to patched versions (see repo `package.json` files for exact ranges).

**Docker & infrastructure:** PostgreSQL 16-alpine, Keycloak 26, MinIO; production Dockerfiles, `docker-compose`, nginx, `.dockerignore`.

**Dependencies:** React Query, Redux Toolkit, Vite, Vitest, Prettier, and related toolchain bumps.

**Production optimizations:** Environment-aware rate limiting, graceful shutdown, error handling, build splitting/minification, nginx gzip/cache, cron intervals tied to environment.

**CI/CD:** Workflows use PostgreSQL 16.

### Known non-critical issues

- Lint: occasional unused vars / console in dev paths.
- Web: some FullCalendar typing / unused imports — non-blocking for runtime.

### Before deploying

1. **Secrets:** Production env vars via a secrets manager; never commit `.env`.
2. **Database:** Run `pnpm db:migrate`; backups; `DATABASE_SSL=true`; pool/timeouts as needed.
3. **Security:** Strong `SESSION_SECRET`, Keycloak client secret, HTTPS, CORS review, Redis sessions in production.
4. **Logging:** `LOG_LEVEL`, JSON logs in prod, redaction; `X-Request-ID` for tracing.
5. **Monitoring:** APM, log aggregation, Sentry (or equivalent), `/health`.
6. **Performance:** Redis cache, CDN for static assets, indexes (see Part 3), connection pooling.
7. **Testing:** `pnpm test:ci`, load tests, critical flows.

### Deployment commands

**Development:** `docker compose up -d` → migrate/seed → `pnpm dev`.

**Production:** Use `deploy/scripts/deploy-prod.sh` or `docker compose` with prod compose file; web behind nginx/CDN.

---

## Part 2 — API findings (bottlenecks, security, reliability)

**Scope:** Node.js API, Postgres, multi-tenant SaaS.

### Executive summary

- **Likely bottlenecks:** (1) N+1 product queries on order create and invoice create, (2) orders list + calendar without composite index on `(restaurant_id, created_at)`, (3) repeated tenant lookup by email without caching.
- **Hot endpoints:** `POST /api/orders`, `GET /api/orders`, `GET /api/orders/calendar`, `GET /api/chat/conversations/:id/messages`.
- **Tenant scoping gaps (verify current code — may already be fixed):** invoice GET by id, chat messages by conversation id, supplier GET restaurant by id; see table below.

### Top issues (historical audit)

1. **Invoice GET by ID** — ensure only invoice supplier, restaurant, or admin can read (`invoices.routes.js`).
2. **Chat messages** — ensure participant check before returning messages (`chat.routes.js`).
3. **Order create** — batch product/price fetch instead of per-line query.
4. **createInvoiceFromOrder** — batch product fetch inside transaction.
5. **Indexes** — `customer_order(restaurant_id, created_at DESC)`, `order_item(order_id)`.
6. **Keycloak HTTP** — axios timeouts on token/userinfo calls (`auth.js`).
7. **Restaurant GET for supplier** — optional restriction to linked restaurants only.
8. **Products list** — consider explicit column list + rate limits if public.

### Tenant scoping matrix

| Area | Enforced | Missing / weak (when audited) |
|------|----------|-------------------------------|
| Orders list/GET | ✅ | — |
| Order POST | ✅ | — |
| Invoices list | ✅ | — |
| **Invoices GET :id** | — | ❌ verify tenant |
| Chat conversations list | ✅ | — |
| **Chat GET messages** | — | ❌ verify participant |
| Restaurants list | ✅ | — |
| **Restaurants GET :id** | Partial | ❌ supplier any id |

### Additional notes

- Request ID and structured logging: good patterns; avoid PII in prod logs.
- Transactions: keep external/slow calls out of DB transactions.

---

## Part 3 — Fix plan (PR-sized steps)

Each step should be a small PR.

1. **Migration:** Add indexes `idx_customer_order_restaurant_created`, `idx_order_item_order_id` (use `CONCURRENTLY` in prod if required).
2. **Invoice GET:** After load, assert supplier_id / restaurant_id matches caller (or admin).
3. **Chat messages GET:** Assert conversation belongs to caller’s tenant.
4. **Order POST:** Single `WHERE id = ANY($1)` (or equivalent) for products/prices; map by id in memory.
5. **createInvoiceFromOrder:** Same batching for product rows.
6. **Auth:** `timeout: 10000` (or config) on all Keycloak-facing axios calls.
7. **(Optional)** Supplier restaurant GET — require an order relationship.
8. **(Optional)** Product list — narrow `SELECT` columns + limits.

**Suggested order:** migration → invoice → chat → order batch → invoice batch → auth timeout → optional steps.

---

*Consolidated from legacy `PRODUCTION_READINESS.md`, `PRODUCTION_READINESS_FINDINGS.md`, and `PRODUCTION_READINESS_FIX_PLAN.md`.*
