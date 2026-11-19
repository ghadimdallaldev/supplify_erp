# Supplier Operations Hub

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

Supplier-facing operational APIs mounted at `/api/supplier/*` — command center KPIs, receivables aging, CSV product import, **bulk product image import**, delivery board, reorder intelligence, and fulfillment issue workflows.

Driver fulfillment now keeps requested future delivery dates and uses the supplier
calendar day for missing/overdue dates when assigning drivers. Detail dates remain
literal calendar strings. Atomic proof/completion, standalone proof authorization,
retry behavior and delivery lock ordering are documented in
[drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md#dispatch-flow).

Route planning and driver-built routes now use transaction-visible reads and
revalidate route/order state under locks before writing. Driver-scoped route
operations work with existing driver permissions; mobile reorder/next-stop and
optimization payloads match the API. See the
[driver route contracts](./drivers-and-gps-tracking.md#driver-route-api-contracts).

Direct delivery/POD transitions now update route stops and route completion in the
same transaction. Route driver changes carry live assignment state and preserve
history/stock. Web and both native clients target the selected warehouse leg;
atomic proof completion requires only a refresh afterward.

Delivery rollover now uses PostgreSQL-compatible status comparison and literal
calendar dates, and rechecks cancellation/scheduling/automatic same-day eligibility
under parent-order/route/assignment locks. Route numbering is shared with normal
planning. Android/iOS refresh affected delivery caches after successful manual
rollover. See [delivery-rollover.md](./delivery-rollover.md) for scope and open leads.

Supplier manual checkout now scopes idempotent replay to the supplier and customer,
preserves quote references, and stores the resolved delivery date. Quote lookup and
validation share the order transaction and connection. Migration 0236 is required
for independent supplier key reuse; see [ordering reliability](./ordering-reliability.md).

### Delivery board calendar and fallback behavior

`GET /api/supplier/deliveries/board` returns `scheduledDeliveryDate` as the literal
`YYYY-MM-DD` calendar day selected by the assignment/route/requested-date
precedence. `scheduledAt` remains available for legacy consumers; clients should
prefer the calendar field when displaying or grouping a delivery day.

If optional display enrichment fails, the fallback retains delivery assignment
IDs, driver IDs, actual statuses, supplier ownership and every supplied date,
driver, status and area filter. It omits optional driver-name/POD enrichment.
An area filter retains its required zone/branch joins; if those joins cannot
execute, the request fails instead of returning an unfiltered board. Area groups
accept arbitrary stored labels, including names that match JavaScript prototype
properties. Schema probes keep driver assignments independent of driver display
metadata and preserve route dates when assignment tables are unavailable.

**Base mount:** `apps/api/src/server.js` → `app.use('/api/supplier', supplierOpsRoutes)`

## Command center

Aggregated **today view** for suppliers: orders to prepare, deliveries pending, receivables snapshot, reorder opportunities, low stock, disputes, and boosted deals.

| Method | Path              | Gate                                                                                             | Description                |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| GET    | `/command-center` | Any of `ORDERS_MANAGE`, `INVOICES_VIEW`, `CATALOG_EDIT`, `FULFILLMENT_VIEW`, `PROMOTIONS_MANAGE` | KPIs, priorities, previews |

**Response shape:**

- `kpis` — counts and balances (orders to prepare, deliveries, unpaid/overdue, customers due reorder, low stock, disputes). **Orders to prepare today** uses the supplier `last_order_timezone` (platform default when unset), not the database server clock.
- `todaysPriorities` — ranked action items (top 8)
- `previews` — delivery board snippet, GPS summary, receivables aging, reorder at-risk customers, low stock, boosted deals, **`customerGrowth`** (import/invite/convert metrics when growth tables exist)

**Web:** `/app/command-center` — `SupplierCommandCenterPage`

Service: `supplier-command-center.service.js`

Operational admission to the command center does not grant invoice visibility.
The HTTP response includes receivable balances, debtor previews and financial
priorities only with `INVOICES_VIEW` (including existing manage/Owner equivalents).
Other callers receive null financial KPI amounts, no receivable preview and no
financial priorities. This projection never mutates the shared tenant cache.

## Receivables

Open invoice aging for supplier AR — used by command center and the Invoices page receivables panel.

| Method | Path                                            | Gate                                 | Description                                        |
| ------ | ----------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| GET    | `/invoices/receivables`                         | `INVOICES_VIEW` + `finance_invoices` | Summary, aging buckets, top debtors, open invoices |
| GET    | `/invoices/receivables/statement/:restaurantId` | `INVOICES_VIEW` + `finance_invoices` | CSV statement download for one restaurant          |

Aging buckets: `current`, `0_7`, `8_30`, `31_60`, `60_plus` days overdue.

Open statuses: `ISSUED`, `PARTIALLY_PAID`, `OVERDUE`.

Receivables and restaurant payables total `balance_due` per currency. A supplier or restaurant with open invoices in more than one currency does not get those balances added into one number. A supplier statement does the same: opening balance is what was still owed before the start date, charges are invoices issued in the window, payments are completed payments dated in the window, and unused credit reduces the balance once. An applied credit is only the payment, and a credit note cannot be applied to an invoice in another currency. Void and draft invoices are left out.

The overdue job marks a past-due invoice `OVERDUE` only while `balance_due > 0`, notifies both parties of that open balance, and sets `overdue_notified_at` after the notification call so a failed send can retry. When either tenant's subscription is locked the job still sets `OVERDUE` (so aging, receivables and filters stay correct) but skips the notification and leaves `overdue_notified_at` empty, so the notice goes out once the account is unlocked. Voiding an invoice (`PATCH /api/invoices/:id` with `VOID`) returns 409 when it has completed payments or applied credit notes (credit applications are stored as `CREDIT-` payments); reverse them first. `/api/payments` uses the same `finance_invoices` plan gate as `/api/invoices` and `/api/restaurant-finance`. Migration `0228` makes the one-invoice-per-order-per-supplier index ignore `VOID` invoices. A manual invoice must total more than zero. When `tax_included` is true, tax is extracted from the line prices instead of added on top. Currency follows the linked order unless the request sends a three-letter code. Invoice, due, payment, and credit-note dates are returned as `YYYY-MM-DD` calendar days, including receivables, payables, statements, and CSV export. Applying credit requires a credit note; an amount alone does not reduce the balance. Credit notes offered for an invoice are limited to that invoice's currency. Overdue days and expense windows use the restaurant's local calendar day. The invoice list, order invoice tab, and invoice detail use that day count, so a browser in another timezone does not mark the invoice overdue early. Receivables aging uses the supplier's local day, and payables aging uses the restaurant's. Overdue and statement totals are summed once per currency, and an invoice with no currency is not added into USD. The tax rate on a new invoice is the rate in effect on the supplier's local day. Payment lists return `payment_date` as `YYYY-MM-DD`. Invoice totals on the list, detail, payment dialog, and order invoice tab use the invoice currency.

**Web:** `SupplierReceivablesPanel` on `/app/invoices` (supplier tenants with `finance_invoices`).

Service: `supplier-receivables.service.js`

The receivables API returns camelCase invoice fields (`invoiceNumber`, `dueDate`,
`balanceDue`, `isOverdue`) and summary fields `unpaidCount`, `unpaidTotal`,
`overdueTotal`, and `byCurrency`. Android and iOS use these fields directly.
Their overdue tile displays the overdue amount per currency; this endpoint does
not return an overdue invoice count. The invoice list is a 100-row preview, while
summary counts and totals cover all open invoices. Each top-debtor row's
`oldestInvoiceId` belongs to that restaurant and currency and is selected from all
open invoices, independently of the preview limit.

### Collections reminders

Automated and manual invoice payment reminders with deduplication via `invoice_reminder_log` (migration `0176`).

| Method | Path                                 | Gate                                 | Description                           |
| ------ | ------------------------------------ | ------------------------------------ | ------------------------------------- |
| POST   | `/invoices/:invoiceId/send-reminder` | `INVOICES_VIEW` + `finance_invoices` | Manual reminder for one invoice       |
| POST   | `/invoices/remind-overdue`           | `INVOICES_VIEW` + `finance_invoices` | Bulk remind all overdue open invoices |

**Cron:** `collections-reminders` job — daily (`CRON_JOBS.COLLECTIONS_REMINDERS`, 24 h). Registered in `register-cron-jobs.js`.

**Web:** `SupplierReceivablesPanel` — per-invoice and bulk overdue remind actions.

Service: `collections-reminders.service.js`

### Accounting export

CSV exports for supplier AR and bookkeeping integrations.

| Method | Path                                            | Gate                                                      | Description             |
| ------ | ----------------------------------------------- | --------------------------------------------------------- | ----------------------- |
| GET    | `/invoices/export.csv`                          | `INVOICES_VIEW` + `finance_invoices` + `api_integrations` | Invoice lines CSV       |
| GET    | `/invoices/export/quickbooks.csv`               | `INVOICES_VIEW` + `finance_invoices` + `api_integrations` | QuickBooks-style export |
| GET    | `/payments/export.csv`                          | `INVOICES_VIEW` + `finance_invoices` + `api_integrations` | Payment records CSV     |
| GET    | `/accounting/summary.csv`                       | `INVOICES_VIEW` + `finance_invoices` + `api_integrations` | AR aging summary CSV    |
| GET    | `/invoices/receivables/statement/:restaurantId` | `INVOICES_VIEW` + `finance_invoices` + `api_integrations` | Customer statement CSV  |

**Web:** Export dropdown on `/app/invoices` (supplier tenants).

Service: `supplier-accounting-export.service.js`

Export `from` and `to` filters accept valid `YYYY-MM-DD` calendar dates, inclusive
of both endpoints, with a maximum of 366 calendar days. They stay on the selected
day regardless of the server timezone. Impossible dates and repeated query values
are rejected. With no filters the range runs from 30 calendar days ago through
today on the server's local calendar.

## Run sheet (daily ops brief)

Single-page **morning brief** for suppliers: orders to pick, deliveries, receivables due today, reorder leads, and shortage preview.

| Method | Path         | Gate                                                           | Description                                                        |
| ------ | ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/run-sheet` | Any of `ORDERS_MANAGE`, `FULFILLMENT_VIEW`, or `INVOICES_VIEW` | KPIs + pick queue + deliveries + permitted receivables + shortages |

**Query:** `?date=YYYY-MM-DD`. When omitted, the date is today in the supplier `last_order_timezone` (platform default when unset). The web date picker uses the browser’s local calendar day.

**Web:** `/app/run-sheet` — `SupplierRunSheetPage`; linked from command center and sidebar.

Service: `supplier-run-sheet.service.js`

The tenant-wide run sheet does not admit a driver-only permission. Drivers use
their assignment-scoped delivery endpoints. Run-sheet financial KPIs, currency
groups, invoice rows and financial priorities require `INVOICES_VIEW`. Without it
the amounts are null, collection rows/groups are empty and financial priorities
are removed. Web, Android and iOS hide the finance tiles/collection section under
the same permission, including for an older cached payload.

## Product import (CSV / Excel)

Bulk catalog upload with preview and partial-import support. Accepts **`.csv`** and **`.xlsx`** (SheetJS). Optional **`image_url`** column downloads remote images during import (same optimization pipeline as bulk image import).

| Method | Path                            | Permission     | Description                                                |
| ------ | ------------------------------- | -------------- | ---------------------------------------------------------- |
| POST   | `/products/import/preview`      | `CATALOG_EDIT` | Parse CSV/XLSX, return column mapping + validation preview |
| POST   | `/products/import`              | `CATALOG_EDIT` | Execute import (`partial` default true — skip bad rows)    |
| POST   | `/products/import/error-report` | `CATALOG_EDIT` | Download CSV of row errors                                 |

**Columns:** `name`, `sku` (required); optional `description`, `category`, `unit`, `price`, `stock`, **`image_url`** (aliases: `image`, `photo`, `photo_url`).

**Execute summary fields:** `created`, `updated`, `failed`, `skipped`, plus `imagesImported` / `imagesFailed` when `image_url` column is used.

**Web:** **Bulk Upload** dialog on `/app/products` — `ProductBulkUploadDialog`, `usePreviewProductImportMutation`, `useExecuteProductImportMutation`.

Service: `product-import.service.js` (delegates image fetch to `importImageFromUrl` in `product-image-import.service.js`).

## Supplier product categories

Suppliers can manage their catalog categories from **Products → Manage categories**. They may create, rename, deactivate, or delete only categories owned by their supplier account; the shared platform categories remain available and read-only. Product create/update accepts `category_id` only when it references a shared category or one owned by the product supplier.

| Method | Endpoint                               | Permission       | Purpose                                                 |
| ------ | -------------------------------------- | ---------------- | ------------------------------------------------------- |
| GET    | `/api/products/categories`             | `CATALOG_VIEW`   | Shared categories plus the active supplier’s categories |
| POST   | `/api/products/categories`             | `CATALOG_EDIT`   | Create a supplier-owned category                        |
| PATCH  | `/api/products/categories/:categoryId` | `CATALOG_EDIT`   | Update a supplier-owned category                        |
| DELETE | `/api/products/categories/:categoryId` | `CATALOG_MANAGE` | Delete a supplier-owned category                        |

Database migration `0211_supplier_product_categories.sql` adds `product_category.supplier_id`; existing categories stay shared (`NULL`).

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

| Area                  | Path prefix                             | Feature gate        | Notes                                                                                                                       |
| --------------------- | --------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Run sheet             | `/run-sheet`                            | command center gate | Daily ops brief — see above                                                                                                 |
| Accounting export     | `/invoices/export*`                     | `finance_invoices`  | CSV + QuickBooks — see above                                                                                                |
| Collections reminders | `/invoices/*remind*`                    | `finance_invoices`  | Manual + cron — see above                                                                                                   |
| Reorder intelligence  | `/reorder-intelligence`                 | `smart_reorder`     | At-risk customers, reminder drafts, **send reminder** (see below)                                                           |
| Reorder assistance    | `/reorder-assistance`                   | `smart_reorder`     | Follow-up draft messages                                                                                                    |
| Delivery board        | `/deliveries/board`                     | `fulfillment`       | Date/status/driver/area filters; driver-scoped when driver-only RBAC; zone join via `delivery-zone-join` + migration `0165` |
| Product substitutes   | `/products/:productId/substitutes`      | —                   | CRUD substitute products                                                                                                    |
| Order substitutions   | `/orders/:orderId/substitutions/*`      | `order_amendments`  | Propose/accept/reject item swaps                                                                                            |
| Fulfillment issues    | `/orders/:orderId/fulfillment-issues/*` | —                   | Shortage, substitution, open-chat                                                                                           |
| At-risk cadence       | `/reorder-cadence/at-risk`              | `smart_reorder`     | Customers overdue for reorder                                                                                               |

### Reorder reminder send

Suppliers create a **draft** from follow-up / reorder intelligence, then optionally **send** it to the restaurant team (email + WhatsApp via `notifyTenantUsers`, category `reorder_reminder`).

| Method | Path                                                  | Description                                      |
| ------ | ----------------------------------------------------- | ------------------------------------------------ |
| POST   | `/reorder-intelligence/:restaurantId/reminder-draft`  | Create draft (subject + body); optional chat URL |
| POST   | `/reorder-intelligence/reminder-drafts/:draftId/send` | Mark draft `sent`; notify restaurant team        |

**Web:** `SupplierFollowUpPanel` → **Reminder** → `ReorderReminderReviewDialog` → **Send reminder** (or copy / open chat).

Service: `supplier-reorder-intelligence.service.js` (`createReorderReminderDraft`, `sendReorderReminderDraft`).

## RBAC & plan gates

- All routes require `SUPPLIER` or `ADMIN` role + resolved tenant context.
- Finance routes require `finance_invoices` feature (Silver+ on paid tiers).
- Smart reorder routes require `smart_reorder` feature.
- Fulfillment board requires `fulfillment` feature.

## Tests

The [2026-11-16 supplier audit](../audits/SUPPLIER_FEATURE_AUDIT_2026-11-16.md)
records real PostgreSQL and Development verification. Run-sheet pick queries use
the delivery-board schema's driver assignment join. Collection and overdue totals
retain currencies; selected run dates determine overdue days. Accounting CSVs use
calendar dates, and invoice/payment/AR exports append a Currency column. AR rows
are grouped by customer and currency and aged on the supplier's local day.
Header-only legacy invoices retain their total in the QuickBooks fallback row.

| File                                                                  | Covers                                       |
| --------------------------------------------------------------------- | -------------------------------------------- |
| `apps/web/src/components/supplier/supplierPainKiller.test.tsx`        | Receivables empty state, command center mock |
| `apps/api/src/services/supplier-run-sheet.service.test.js`            | Run sheet aggregation                        |
| `apps/api/src/services/collections-reminders.service.test.js`         | Reminder dedup + bulk send                   |
| `apps/api/src/services/supplier-accounting-export.service.test.js`    | CSV / QuickBooks export                      |
| `apps/api/src/services/product-import.service.test.js`                | CSV + XLSX parse                             |
| `apps/api/src/services/product-image-import.service.test.js`          | SKU/mapping match logic, CSV parse           |
| `apps/api/src/services/image-import-worker.test.js`                   | Background job dispatch                      |
| `apps/api/src/services/image-optimization.service.test.js`            | Format validation, optimization              |
| `apps/web/src/components/products/ProductImageImportDialog.test.tsx`  | Import dialog preview UX                     |
| `apps/api/src/services/supplier-reorder-intelligence.service.test.js` | Reminder draft + send notification           |

## See also

- [bulk-product-image-import.md](./bulk-product-image-import.md) — ZIP import methods, job flow, env vars
- [warehouse-fulfillment.md](./warehouse-fulfillment.md) — multi-warehouse routing
- [drivers-and-gps-tracking.md](./drivers-and-gps-tracking.md) — delivery GPS in command center preview
- [inventory-expiry-and-reorder.md](./inventory-expiry-and-reorder.md) — restaurant-side reorder suggestions

## Last-order cutoff (migration `0199`)

Supplier Business settings can set `last_order_mode`: `none` | `cutoff` (absolute time or minutes-before-window + rollover days). Cart checkout persists resolved `deliveryDate` as `customer_order.requested_delivery_date`.

The web Business tab exposes the stored cutoff timezone. Updates trim named IANA
timezones and reject unsupported values. Clearing it selects the platform default.
The resolver uses that supplier calendar for today, cutoff comparison and rollover;
pricing and stored delivery day share one resolution. Calendar responses use
`YYYY-MM-DD`. DST midnight gaps advance to the available time on that day.
Migration 0237 clears historical names that PostgreSQL cannot resolve to the
platform-default fallback. Existing recognized timezone choices are preserved.

Ordinary order updates also persist the existing `notes` field, including an empty
string to clear it. Restaurant ownership and supplier `ORDERS_EDIT` checks apply.

- Lib: `apps/api/src/lib/supplier-last-order.js` (+ `supplier-last-order.test.js`)
- Manual QA: [regression-checklist.md](../guides/qa/regression-checklist.md) **RST-18a–18c**
- Design: [hospitality-excellence](../archive/superpowers/specs/2026-09-10-hospitality-excellence-design.md)
