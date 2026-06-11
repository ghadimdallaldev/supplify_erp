# Quote Requests (RFQ)

Restaurants send **multi-supplier quote requests** (RFQ) for catalog products. Suppliers respond with per-line pricing and availability; restaurants compare responses side-by-side and can push a winning response into the cart for manual checkout.

**Plan gate:** None — uses existing RBAC (`ORDERS_CREATE`, `CATALOG_VIEW`).

## Flow

1. Restaurant selects products + quantities and picks one or more suppliers.
2. System creates `quote_requests` row + line items + one `quote_request_suppliers` row per supplier.
3. Each invited supplier receives an in-app notification (`quote_request_received`).
4. Supplier submits structured response per line item (price, availability, delivery date, substitute).
5. Restaurant compares responses (`GET .../compare`) and optionally loads cart payload from a chosen response.
6. Restaurant completes checkout via normal `POST /api/orders` — **quoted prices are informational in cart only**; order create still uses server price resolution.

## API — Restaurant (`/api/quote-requests`)

| Method | Path                                    | Permission                  | Description                                                              |
| ------ | --------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| POST   | `/`                                     | `ORDERS_CREATE`             | Create request (`items[]`, `supplierIds[]`, optional `note`, `neededBy`) |
| GET    | `/`                                     | `CATALOG_VIEW` / `ORDERS_*` | Paginated list (`page`, `limit`, `status`: open/closed/cancelled)        |
| GET    | `/:id`                                  | `CATALOG_VIEW` / `ORDERS_*` | Request detail with supplier statuses                                    |
| GET    | `/:id/compare`                          | `CATALOG_VIEW` / `ORDERS_*` | Side-by-side comparison payload                                          |
| POST   | `/:id/suppliers/:supplierRowId/to-cart` | `ORDERS_CREATE`             | Cart line payload from accepted response                                 |

## API — Supplier (`/api/quote-requests`)

| Method | Path                                              | Description                                       |
| ------ | ------------------------------------------------- | ------------------------------------------------- |
| GET    | `/supplier/inbox`                                 | Inbox list (`status`: pending/responded/declined) |
| GET    | `/supplier/inbox/:quoteRequestSupplierId`         | Detail for response form                          |
| POST   | `/supplier/inbox/:quoteRequestSupplierId/respond` | Submit response (`items[]`, optional `note`)      |

Response items support: `isAvailable`, `unitPrice`, `quantity`, `deliveryDate`, `note`, `substituteProductId`.

## Notifications

- **Supplier:** `quote_request_received` on create (deduped per supplier/request).
- **Restaurant:** `quote_response_received` when a supplier submits a response.

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

| Route                             | Page                   |
| --------------------------------- | ---------------------- |
| `/app/quote-requests`             | Restaurant quote list  |
| `/app/quote-requests/new`         | Create quote request   |
| `/app/quote-requests/:id`         | Request detail         |
| `/app/quote-requests/:id/compare` | Compare responses      |
| `/app/supplier/quotes`            | Supplier inbox         |
| `/app/supplier/quotes/:id`        | Supplier response form |
| `/supplier/:idOrSlug`             | Public mini-store      |

## Database

Migrations:

- `0153_quote_requests_and_public_catalog.sql` — quote tables + `supplier.public_catalog_enabled`
- `0155_ensure_quote_request_schema.sql` — idempotent schema repair

Tables: `quote_requests`, `quote_request_items`, `quote_request_suppliers`, `quote_responses`, `quote_response_items`.

## Tests

| File                                                   | Covers                        |
| ------------------------------------------------------ | ----------------------------- |
| `apps/api/src/services/quote-requests.service.test.js` | Create, notify, list, compare |
| `apps/api/src/routes/quote-requests.routes.test.js`    | Route auth and validation     |

## See also

- [../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md](../product/QUOTE_REQUESTS_AND_SUPPLIER_MINISTORE.md) — original product spec and audit
- [contract-pricing.md](./contract-pricing.md) — supplier-initiated pricing (separate from RFQ)
- [supplier-follow.md](./supplier-follow.md) — follow suppliers before repeat ordering
