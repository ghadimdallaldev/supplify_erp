# Supplier Operations Hub

Supplier-facing operational APIs mounted at `/api/supplier/*` — command center KPIs, receivables aging, CSV product import, delivery board, reorder intelligence, and fulfillment issue workflows.

**Base mount:** `apps/api/src/server.js` → `app.use('/api/supplier', supplierOpsRoutes)`

## Command center

Aggregated **today view** for suppliers: orders to prepare, deliveries pending, receivables snapshot, reorder opportunities, low stock, disputes, and boosted deals.

| Method | Path              | Gate                                                                                             | Description                |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| GET    | `/command-center` | Any of `ORDERS_MANAGE`, `INVOICES_VIEW`, `CATALOG_EDIT`, `FULFILLMENT_VIEW`, `PROMOTIONS_MANAGE` | KPIs, priorities, previews |

**Response shape:**

- `kpis` — counts and balances (orders to prepare, deliveries, unpaid/overdue, customers due reorder, low stock, disputes)
- `todaysPriorities` — ranked action items (top 8)
- `previews` — delivery board snippet, GPS summary, receivables aging, reorder at-risk customers, low stock, boosted deals

**Web:** `/app/command-center` — `SupplierCommandCenterPage`

Service: `supplier-command-center.service.js`

## Receivables

Open invoice aging for supplier AR — used by command center and the Invoices page receivables panel.

| Method | Path                                            | Gate                                 | Description                                        |
| ------ | ----------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| GET    | `/invoices/receivables`                         | `INVOICES_VIEW` + `finance_invoices` | Summary, aging buckets, top debtors, open invoices |
| GET    | `/invoices/receivables/statement/:restaurantId` | `INVOICES_VIEW` + `finance_invoices` | CSV statement download for one restaurant          |

Aging buckets: `current`, `0_7`, `8_30`, `31_60`, `60_plus` days overdue.

Open statuses: `ISSUED`, `PARTIALLY_PAID`, `OVERDUE`.

**Web:** `SupplierReceivablesPanel` on `/app/invoices` (supplier tenants with `finance_invoices`).

Service: `supplier-receivables.service.js`

## Product import (CSV)

Bulk catalog upload with preview and partial-import support.

| Method | Path                            | Permission     | Description                                             |
| ------ | ------------------------------- | -------------- | ------------------------------------------------------- |
| POST   | `/products/import/preview`      | `CATALOG_EDIT` | Parse CSV, return column mapping + validation preview   |
| POST   | `/products/import`              | `CATALOG_EDIT` | Execute import (`partial` default true — skip bad rows) |
| POST   | `/products/import/error-report` | `CATALOG_EDIT` | Download CSV of row errors                              |

**Web:** Import dialog on `/app/products` — `usePreviewProductImportMutation`, `useExecuteProductImportMutation`.

Service: `product-import.service.js`

## Other supplier-ops endpoints

| Area                 | Path prefix                             | Feature gate       | Notes                                                                |
| -------------------- | --------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| Reorder intelligence | `/reorder-intelligence`                 | `smart_reorder`    | At-risk customers, reminder drafts                                   |
| Reorder assistance   | `/reorder-assistance`                   | `smart_reorder`    | Follow-up draft messages                                             |
| Delivery board       | `/deliveries/board`                     | `fulfillment`      | Date/status/driver/area filters; driver-scoped when driver-only RBAC |
| Product substitutes  | `/products/:productId/substitutes`      | —                  | CRUD substitute products                                             |
| Order substitutions  | `/orders/:orderId/substitutions/*`      | `order_amendments` | Propose/accept/reject item swaps                                     |
| Fulfillment issues   | `/orders/:orderId/fulfillment-issues/*` | —                  | Shortage, substitution, open-chat                                    |
| At-risk cadence      | `/reorder-cadence/at-risk`              | `smart_reorder`    | Customers overdue for reorder                                        |

## RBAC & plan gates

- All routes require `SUPPLIER` or `ADMIN` role + resolved tenant context.
- Finance routes require `finance_invoices` feature (Silver+ on paid tiers).
- Smart reorder routes require `smart_reorder` feature.
- Fulfillment board requires `fulfillment` feature.

## Tests

| File                                                           | Covers                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/web/src/components/supplier/supplierPainKiller.test.tsx` | Receivables empty state, command center mock                         |
| Dev API route matrix                                           | `/api/supplier/command-center`, `/api/supplier/invoices/receivables` |

## See also

- [warehouse-fulfillment.md](./warehouse-fulfillment.md) — multi-warehouse routing
- [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md) — delivery GPS in command center preview
- [inventory-expiry-and-reorder.md](./inventory-expiry-and-reorder.md) — restaurant-side reorder suggestions
