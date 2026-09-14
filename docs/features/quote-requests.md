# Quote Requests (RFQ)

Restaurants send **multi-supplier quote requests** (RFQ) for catalog products. Suppliers respond with per-line pricing and availability; restaurants compare responses side-by-side and can push a winning response into the cart for manual checkout.

**Plan gate:** None — uses existing RBAC (`ORDERS_CREATE`, `CATALOG_VIEW`).

## Flow

1. Restaurant selects products + quantities and picks one or more suppliers.
2. System creates `quote_requests` row + line items + one `quote_request_suppliers` row per supplier.
3. Each invited supplier receives an in-app notification (`quote_request_received`).
4. Supplier submits structured response per line item (price, availability, delivery date, substitute).
5. Restaurant compares responses (`GET .../compare`) and optionally loads cart payload from a chosen response.
6. Restaurant completes checkout via normal `POST /api/orders` with `quoteLocks` — **quoted unit prices are locked at checkout** (`pricing_source = QUOTE_PRICE` on `order_item`). Clients must send `quoteLocks` for every quoted cart line (web CartPage and mobile CartScreen do this). **Server enforcement:** if an open RFQ has a responded, available quote line for a product in the order, checkout returns `400` unless that product is included in `quoteLocks` — raw API clients cannot silently use catalog/contract pricing instead. **Supplier `POST /api/orders/manual`** auto-applies open quote locks for that supplier’s products (optional client `quoteLocks` still accepted) so phone/chat orders cannot silently bypass quoted prices. Checkout does **not** auto-close the RFQ — other invited suppliers may still respond until the restaurant closes it.
7. Restaurant may **close or cancel** an open RFQ (`PATCH /api/quote-requests/:id/status`); suppliers can no longer respond or load cart payloads once status leaves `open`. Supplier respond re-checks `quote_requests.status = 'open'` under row lock inside the write transaction (closes concurrent TOCTOU races).

## API — Restaurant (`/api/quote-requests`)

| Method | Path                                    | Permission                  | Description                                                                 |
| ------ | --------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| POST   | `/`                                     | `ORDERS_CREATE`             | Create request (`items[]`, `supplierIds[]`, optional `note`, `neededBy`)    |
| GET    | `/`                                     | `CATALOG_VIEW` / `ORDERS_*` | Paginated list (`page`, `limit`, `status`: open/closed/cancelled)           |
| GET    | `/:id`                                  | `CATALOG_VIEW` / `ORDERS_*` | Request detail with supplier statuses                                       |
| GET    | `/:id/compare`                          | `CATALOG_VIEW` / `ORDERS_*` | Side-by-side comparison payload                                             |
| POST   | `/:id/suppliers/:supplierRowId/to-cart` | `ORDERS_CREATE`             | Cart line payload from accepted response (uses substitute SKU when offered) |
| PATCH  | `/:id/status`                           | `ORDERS_CREATE`             | Close or cancel an open request                                             |

## API — Supplier (`/api/quote-requests`)

| Method | Path                                              | Description                                                                 |
| ------ | ------------------------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/supplier/inbox`                                 | Inbox list — see query params below                                         |
| GET    | `/supplier/inbox/:quoteRequestSupplierId`         | Detail for response form (marks the entry as viewed)                        |
| POST   | `/supplier/inbox/:quoteRequestSupplierId/respond` | Submit response (`items[]`, optional `note`)                                |
| POST   | `/supplier/inbox/:quoteRequestSupplierId/decline` | Decline to quote, optional `reason` (max 500 chars) shown to the restaurant |

`GET /supplier/inbox` query params:

| Param    | Values                                 | Notes                                                                   |
| -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `status` | `pending` \| `responded` \| `declined` | Supplier-side row status only. Restaurant-side values are rejected 400. |
| `search` | free text, max 120                     | Restaurant name, `ILIKE`                                                |
| `sort`   | `newest` \| `oldest` \| `needed_by`    | `needed_by` sorts undated requests last                                 |
| `page`   | ≥ 1                                    | —                                                                       |
| `limit`  | 1–50                                   | Default 20                                                              |

The response carries `inbox[]`, `pagination`, and a whole-inbox `counts` object
(`total`, `pending`, `responded`, `declined`, `unread`, `urgent`) that is **not**
scoped to the current page or filter — it drives the tab badges and the unread dot.
`urgent` counts pending entries on an open request needed within 2 days.

Response items support: `isAvailable`, `unitPrice`, `quantity`, `deliveryDate`, `note`, `substituteProductId`.

### Response and decline rules

- A response is refused once the restaurant's `quote_requests.status` leaves `open`
  (closed or cancelled). The detail payload exposes `canRespond` so the client can
  lock the form instead of failing on submit.
- Decline moves the row to `declined` and stores `decline_reason`. It is idempotent,
  is refused after the supplier has already responded, and is refused on a
  non-`open` request.
- Opening the detail endpoint stamps `viewed_at` once; that is what makes an entry
  stop counting as unread.

## Notifications

- **Supplier:** `quote_request_received` on create (deduped per supplier/request).
- **Restaurant:** `quote_response_received` when a supplier submits a response (deduped per supplier row, not per RFQ).
- **Restaurant:** `quote_request_declined` when a supplier declines to quote; the
  optional reason is appended to the message and carried in `metadata.declineReason`.

In-app only (no dedicated email template v1).

## Public mini-store (related)

Suppliers can enable a public catalog link at `/supplier/:slug`:

| Method | Path                                              | Auth       | Description                        |
| ------ | ------------------------------------------------- | ---------- | ---------------------------------- |
| GET    | `/api/public/suppliers/:idOrSlug`                 | Public     | Safe supplier profile              |
| GET    | `/api/public/suppliers/:idOrSlug/products`        | Public     | Catalog without prices             |
| GET    | `/api/public/suppliers/:idOrSlug/products/priced` | Restaurant | Priced catalog for logged-in buyer |
| PATCH  | `/api/suppliers/:id`                              | Supplier   | Toggle `publicCatalogEnabled`      |

Entry points: Products page, Supplier detail, Supplier settings catalog card.

## Web routes

| Route                              | Page                   |
| ---------------------------------- | ---------------------- |
| `/app/quote-requests`              | Restaurant quote list  |
| `/app/quote-requests/new`          | Create quote request   |
| `/app/quote-requests/:id`          | Request detail         |
| `/app/quote-requests/:id/compare`  | Compare responses      |
| `/app/quote-requests/supplier`     | Supplier inbox         |
| `/app/quote-requests/supplier/:id` | Supplier response form |
| `/supplier/:idOrSlug`              | Public mini-store      |

## Database

Migrations:

- `0153_quote_requests_and_public_catalog.sql` — quote tables + `supplier.public_catalog_enabled`
- `0155_ensure_quote_request_schema.sql` — idempotent schema repair
- `0202_quote_request_supplier_decline.sql` — `quote_request_suppliers.decline_reason`,
  `.viewed_at`, and a partial index for the unread-pending count

Tables: `quote_requests`, `quote_request_items`, `quote_request_suppliers`, `quote_responses`, `quote_response_items`.

## Tests

| File                                                          | Covers                                        |
| ------------------------------------------------------------- | --------------------------------------------- |
| `apps/api/src/services/quote-requests.service.test.js`        | Create, notify, list, compare                 |
| `apps/api/src/routes/quote-requests.routes.test.js`           | Route auth and validation                     |
| `apps/api/src/services/resolve-product-price.service.test.js` | Open-quote product detection for checkout     |
| `apps/api/src/routes/orders.routes.test.js`                   | Mandatory `quoteLocks` when open quotes exist |

## See also

- [../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md](../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md) — original product spec and audit
- [contract-pricing.md](./contract-pricing.md) — supplier-initiated pricing (separate from RFQ)
- [supplier-follow.md](./supplier-follow.md) — follow suppliers before repeat ordering
