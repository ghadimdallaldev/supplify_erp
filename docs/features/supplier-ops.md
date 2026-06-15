# Supplier Operations Hub

Supplier-facing operational APIs mounted at `/api/supplier/*` — command center KPIs, receivables aging, CSV product import, **bulk product image import**, delivery board, reorder intelligence, and fulfillment issue workflows.

**Base mount:** `apps/api/src/server.js` → `app.use('/api/supplier', supplierOpsRoutes)`

## Command center

Aggregated **today view** for suppliers: orders to prepare, deliveries pending, receivables snapshot, reorder opportunities, low stock, disputes, and boosted deals.

| Method | Path              | Gate                                                                                             | Description                |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| GET    | `/command-center` | Any of `ORDERS_MANAGE`, `INVOICES_VIEW`, `CATALOG_EDIT`, `FULFILLMENT_VIEW`, `PROMOTIONS_MANAGE` | KPIs, priorities, previews |

**Response shape:**

- `kpis` — counts and balances (orders to prepare, deliveries, unpaid/overdue, customers due reorder, low stock, disputes)
- `todaysPriorities` — ranked action items (top 8)
- `previews` — delivery board snippet, GPS summary, receivables aging, reorder at-risk customers, low stock, boosted deals, **`customerGrowth`** (import/invite/convert metrics when growth tables exist)

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

Bulk catalog upload with preview and partial-import support. Optional **`image_url`** column downloads remote images during import (same optimization pipeline as bulk image import).

| Method | Path                            | Permission     | Description                                             |
| ------ | ------------------------------- | -------------- | ------------------------------------------------------- |
| POST   | `/products/import/preview`      | `CATALOG_EDIT` | Parse CSV, return column mapping + validation preview   |
| POST   | `/products/import`              | `CATALOG_EDIT` | Execute import (`partial` default true — skip bad rows) |
| POST   | `/products/import/error-report` | `CATALOG_EDIT` | Download CSV of row errors                              |

**CSV columns:** `name`, `sku` (required); optional `description`, `category`, `unit`, `price`, `stock`, **`image_url`** (aliases: `image`, `photo`, `photo_url`).

**Execute summary fields:** `created`, `updated`, `failed`, `skipped`, plus `imagesImported` / `imagesFailed` when `image_url` column is used.

**Web:** **Bulk Upload** dialog on `/app/products` — `ProductBulkUploadDialog`, `usePreviewProductImportMutation`, `useExecuteProductImportMutation`.

Service: `product-import.service.js` (delegates image fetch to `importImageFromUrl` in `product-image-import.service.js`).

## Bulk product image import (ZIP)

Background ZIP import with preview, progress polling, and failure reports. URL-based images use the product CSV import path instead — see [bulk-product-image-import.md](./bulk-product-image-import.md).

| Method | Path                                    | Permission     | Description                                                  |
| ------ | --------------------------------------- | -------------- | ------------------------------------------------------------ |
| POST   | `/products/images/import/presign`       | `CATALOG_EDIT` | Presign ZIP or mapping CSV upload (`imports/{supplierId}/…`) |
| POST   | `/products/images/import/preview`       | `CATALOG_EDIT` | Match ZIP entries to catalog SKUs; return summary            |
| POST   | `/products/images/import`               | `CATALOG_EDIT` | Create job from preview; start background processing         |
| GET    | `/products/images/import/:jobId`        | `CATALOG_EDIT` | Job status and progress counters                             |
| POST   | `/products/images/import/:jobId/cancel` | `CATALOG_EDIT` | Cancel pending/processing job                                |
| GET    | `/products/images/import/:jobId/report` | `CATALOG_EDIT` | Download failure CSV (`sku,file,reason`)                     |

**Web:** **Import Product Images** dialog on `/app/products` — `ProductImageImportDialog`, RTK endpoints in `catalogImport.ts`.

Services: `product-image-import.service.js`, `image-import-worker.js`, `image-optimization.service.js`

## Customer growth (import / referral / sponsor)

Supplier CRM import, referral invites, sponsored onboarding, and growth metrics. Mounted at `/api/supplier/growth/*` (separate router from `/api/supplier` ops routes).

| Method | Path                               | Permission         | Description                               |
| ------ | ---------------------------------- | ------------------ | ----------------------------------------- |
| POST   | `/customers/import/preview`        | `CUSTOMERS_IMPORT` | CSV validation preview                    |
| POST   | `/customers/import`                | `CUSTOMERS_IMPORT` | Execute import + auto-match               |
| GET    | `/customers/prospects`             | `GROWTH_VIEW`      | List imported prospects                   |
| POST   | `/customers/prospects/:id/connect` | `CUSTOMERS_MANAGE` | Connection request to existing restaurant |
| POST   | `/customers/prospects/:id/invite`  | `CUSTOMERS_MANAGE` | Email / WhatsApp / link invite            |
| POST   | `/customers/prospects/:id/sponsor` | `CUSTOMERS_MANAGE` | Sponsor 1-month plan (limits apply)       |
| GET    | `/metrics`                         | `GROWTH_VIEW`      | Dashboard aggregates                      |

**Web:** `/app/customer-growth` — `SupplierCustomerGrowthPage`; dashboard widget in `DashboardWidgetGrid`.

Full spec: [supplier-customer-growth.md](./supplier-customer-growth.md) · Migration: `0169_supplier_growth_program.sql`

## Other supplier-ops endpoints

| Area                 | Path prefix                             | Feature gate       | Notes                                                                                                                       |
| -------------------- | --------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Reorder intelligence | `/reorder-intelligence`                 | `smart_reorder`    | At-risk customers, reminder drafts                                                                                          |
| Reorder assistance   | `/reorder-assistance`                   | `smart_reorder`    | Follow-up draft messages                                                                                                    |
| Delivery board       | `/deliveries/board`                     | `fulfillment`      | Date/status/driver/area filters; driver-scoped when driver-only RBAC; zone join via `delivery-zone-join` + migration `0165` |
| Product substitutes  | `/products/:productId/substitutes`      | —                  | CRUD substitute products                                                                                                    |
| Order substitutions  | `/orders/:orderId/substitutions/*`      | `order_amendments` | Propose/accept/reject item swaps                                                                                            |
| Fulfillment issues   | `/orders/:orderId/fulfillment-issues/*` | —                  | Shortage, substitution, open-chat                                                                                           |
| At-risk cadence      | `/reorder-cadence/at-risk`              | `smart_reorder`    | Customers overdue for reorder                                                                                               |

## RBAC & plan gates

- All routes require `SUPPLIER` or `ADMIN` role + resolved tenant context.
- Finance routes require `finance_invoices` feature (Silver+ on paid tiers).
- Smart reorder routes require `smart_reorder` feature.
- Fulfillment board requires `fulfillment` feature.

## Tests

| File                                                                 | Covers                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/web/src/components/supplier/supplierPainKiller.test.tsx`       | Receivables empty state, command center mock                         |
| `apps/api/src/services/product-image-import.service.test.js`         | SKU/mapping match logic, CSV parse                                   |
| `apps/api/src/services/image-import-worker.test.js`                  | Background job dispatch                                              |
| `apps/api/src/services/image-optimization.service.test.js`           | Format validation, optimization                                      |
| `apps/web/src/components/products/ProductImageImportDialog.test.tsx` | Import dialog preview UX                                             |
| Dev API route matrix                                                 | `/api/supplier/command-center`, `/api/supplier/invoices/receivables` |

## See also

- [bulk-product-image-import.md](./bulk-product-image-import.md) — ZIP import methods, job flow, env vars

- [warehouse-fulfillment.md](./warehouse-fulfillment.md) — multi-warehouse routing
- [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md) — delivery GPS in command center preview
- [inventory-expiry-and-reorder.md](./inventory-expiry-and-reorder.md) — restaurant-side reorder suggestions
