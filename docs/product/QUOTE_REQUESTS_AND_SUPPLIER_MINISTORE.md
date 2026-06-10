# Quote Requests & Supplier Mini-Store

## 1. Summary

This document covers **Feature 3 — Supplier quote battle / Request best price** and **Feature 4 — Supplier mini-store / catalog link**.

Restaurants can send multi-supplier quote requests, compare structured responses, and optionally add a winning response to the cart (manual checkout). Suppliers receive an inbox, respond per line item, and share a public catalog link at `/supplier/:slug`.

## 2. Audit result (Phase 0)

| Area                      | Pre-implementation status               |
| ------------------------- | --------------------------------------- |
| Quote requests / RFQ      | **MISSING** (greenfield)                |
| Quote responses / compare | **MISSING**                             |
| Supplier slug (DB)        | **DONE**                                |
| In-app supplier catalog   | **DONE** (authenticated)                |
| Public mini-store         | **MISSING**                             |
| Catalog link in settings  | **MISSING**                             |
| Contract pricing          | **DONE** (separate; supplier-initiated) |
| Cart / order create       | **DONE** (unchanged)                    |
| Notifications infra       | **DONE** (extended)                     |
| Plan gate for quotes      | **None** — uses existing RBAC           |

## 3. What already existed

- `supplier.slug` (unique), logo/branding columns, `PATCH /api/suppliers/:id`
- Restaurant public page pattern: `/reserve/:restaurantIdOrSlug` + `GET /api/public/restaurants/:idOrSlug`
- Authenticated catalog: `GET /api/products`, `SupplierDetailPage`
- Cart (client-side), order create with server price resolution
- `supplier_follow`, `supplier_blocklist`
- `product_substitute` (available for future response UI enrichment)
- `notification.service.js` fan-out via `notifyTenantUsers`

## 4. What was implemented

### Quote requests (Feature 3)

- Migration `0153_quote_requests_and_public_catalog.sql` — quote tables + `supplier.public_catalog_enabled`
- `quote-requests.service.js` — create, list, detail, compare, supplier inbox/respond, cart payload
- `quote-requests.routes.js` — `/api/quote-requests/*`
- Notifications: `quote_request_received`, `quote_response_received` with dedup window
- Web: list, create, compare, supplier inbox/response pages; sidebar nav; entry points on Products/Supplier detail/mini-store

### Supplier mini-store (Feature 4)

- `public-supplier-catalog.service.js`
- Public API:
  - `GET /api/public/suppliers/:idOrSlug`
  - `GET /api/public/suppliers/:idOrSlug/products` (no prices)
  - `GET /api/public/suppliers/:idOrSlug/products/priced` (restaurant auth)
- Web: `/supplier/:idOrSlug`, supplier settings catalog link card (copy/preview/toggle)

## 5. What remains partial / missing

- **Quoted price at checkout**: Order create still uses `resolveProductPricesBatch`; quoted prices are informational in cart only
- **Deals on public mini-store**: Excluded v1 (promotions routes untouched)
- **Per-product public visibility flag**: Not added; all products shown when catalog enabled
- **Mobile UI**: Web-only; API types added for future mobile
- **Email templates** for quote notifications: In-app only (category mapped to existing prefs)
- **CreateQuoteRequestDialog** component: Full-page flow used instead

## 6. Files changed

### Backend

- `apps/api/db/migrations/0153_quote_requests_and_public_catalog.sql`
- `apps/api/src/services/quote-requests.service.js`
- `apps/api/src/services/quote-requests.service.test.js`
- `apps/api/src/services/public-supplier-catalog.service.js`
- `apps/api/src/services/public-supplier-catalog.service.test.js`
- `apps/api/src/routes/quote-requests.routes.js`
- `apps/api/src/routes/quote-requests.routes.test.js`
- `apps/api/src/routes/public.routes.js`
- `apps/api/src/routes/suppliers.routes.js` (publicCatalogEnabled patch)
- `apps/api/src/services/notification.service.js`
- `apps/api/src/server.js`

### Frontend

- `apps/web/src/pages/PublicSupplierCatalogPage.tsx`
- `apps/web/src/pages/QuoteRequestsPage.tsx`
- `apps/web/src/pages/QuoteRequestDetailPage.tsx`
- `apps/web/src/pages/CreateQuoteRequestPage.tsx`
- `apps/web/src/pages/SupplierQuoteInboxPage.tsx`
- `apps/web/src/pages/SupplierQuoteResponsePage.tsx`
- `apps/web/src/pages/ProductsPage.tsx`
- `apps/web/src/pages/SupplierDetailPage.tsx`
- `apps/web/src/pages/SupplierSettingsPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/types/index.ts`

## 7. Migrations

- **0153** — cron follow-up infrastructure (`cron_followup_infrastructure`)
- **0154** — quote requests + `supplier.public_catalog_enabled` (`quote_requests_and_public_catalog`)

## 8. APIs added/updated

| Method | Path                                               | Auth                      | Description            |
| ------ | -------------------------------------------------- | ------------------------- | ---------------------- |
| POST   | `/api/quote-requests`                              | Restaurant, ORDERS_CREATE | Create quote request   |
| GET    | `/api/quote-requests`                              | Restaurant                | List own requests      |
| GET    | `/api/quote-requests/:id`                          | Restaurant                | Detail                 |
| GET    | `/api/quote-requests/:id/compare`                  | Restaurant                | Compare payload        |
| POST   | `/api/quote-requests/:id/suppliers/:rowId/to-cart` | Restaurant                | Cart payload only      |
| GET    | `/api/quote-requests/supplier/inbox`               | Supplier                  | Inbox                  |
| GET    | `/api/quote-requests/supplier/inbox/:id`           | Supplier                  | Detail for response    |
| POST   | `/api/quote-requests/supplier/inbox/:id/respond`   | Supplier                  | Submit response        |
| GET    | `/api/public/suppliers/:idOrSlug`                  | Public                    | Safe profile           |
| GET    | `/api/public/suppliers/:idOrSlug/products`         | Public                    | Catalog without prices |
| GET    | `/api/public/suppliers/:idOrSlug/products/priced`  | Restaurant                | Priced catalog         |
| PATCH  | `/api/suppliers/:id`                               | Supplier                  | `publicCatalogEnabled` |

## 9. Plan / RBAC behavior

- **No new plan feature key**
- Restaurant create quote: `ORDERS_CREATE`
- Restaurant list/view: `CATALOG_VIEW` or `ORDERS_CREATE` or `ORDERS_VIEW`
- Supplier inbox/respond: supplier role + tenant scope
- Public catalog: `public_catalog_enabled = true` and `account_status = ACTIVE`
- Custom branding on public page: respects `custom_branding` entitlement

## 10. Security / tenant scoping

- Quote requests scoped by `restaurant_id`; suppliers see only `quote_request_suppliers` rows for their `supplier_id`
- Blocklisted suppliers filtered at create time
- Public catalog excludes contact email, VAT, internal admin fields
- Anonymous users never receive catalog prices
- Priced endpoint requires restaurant auth + blocklist check
- No auto-order creation from quotes

## 11. Performance notes

- Paginated product lists (24 default, max 48 public)
- Quote detail loaded with joined queries (no N+1 on responses)
- Indexes on `(restaurant_id, status, created_at)`, `(supplier_id, status)`, FK columns
- Public mini-store lazy-loaded route chunk (~7.5 kB gzip)

## 12. Tests added / run

```bash
cd apps/api && npx vitest run \
  src/services/quote-requests.service.test.js \
  src/services/public-supplier-catalog.service.test.js \
  src/routes/quote-requests.routes.test.js
# 15 passed

cd apps/web && npm run build
# tsc + vite build succeeded
```

## 13. Manual QA checklist

- [ ] Restaurant can open Request Best Price
- [ ] Restaurant can select items and suppliers
- [ ] Restaurant can submit quote request
- [ ] Supplier sees quote request in inbox
- [ ] Supplier can respond per item
- [ ] Restaurant sees responses on compare page
- [ ] Restaurant can add winning response to cart (no auto-order)
- [ ] No supplier sees another supplier's quote request
- [ ] No restaurant sees another restaurant's quote request
- [ ] Supplier can copy catalog link in settings
- [ ] Supplier can preview catalog link
- [ ] Mini-store page loads at `/supplier/:slug`
- [ ] Products visible when catalog enabled
- [ ] Unauthenticated user sees catalog without prices
- [ ] Logged-in restaurant sees prices and can add to cart
- [ ] Disabled catalog returns 404
- [ ] No private/internal data leaks
- [ ] No duplicate notifications on resubmit within window

## 14. Follow-up roadmap

- Honor quoted prices at checkout (optional contract bridge or order metadata)
- Per-product `is_public` visibility
- Active deals on mini-store (when safe with promotions service)
- Mobile screens in `supplify-mobile`
- Email templates for quote request/response
- Quote request from quick lists / inventory low-stock suggestions
