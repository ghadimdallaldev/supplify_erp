# Supplier Pain-Killer Features — Audit & Implementation

**Date:** 2026-05-28 (stabilization pass: same day)  
**Scope:** Delivery, receivables, reorder intelligence, catalog import, substitutes, command center  
**Principles:** Audit-first, extend existing code, no duplicate features, no tier pricing changes, no deals/promotions logic changes (except boost metrics on command center).

---

## Executive summary

| Feature area            | Pre-audit status | Final status                                                                                    |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| Delivery planning       | **Partial**      | **Production-ready** — board filters, `rescheduled` synced across driver services + dispatch UI |
| Invoice / receivables   | **Partial**      | **Production-ready** — aging panel, status badges, restaurant links                             |
| Reorder intelligence    | **Missing**      | **Production-ready** — cadence UI, review dialog, drafts never auto-sent                        |
| Excel / catalog import  | **Partial**      | **Production-ready** — row-level preview/errors, blocks zero-valid import, error CSV            |
| Product substitutes     | **Partial**      | **Production-ready** — CRUD + order propose + amendment accept path unchanged                   |
| Supplier command center | **Missing**      | **Production-ready** — default supplier home, quick actions, empty/error/loading states         |

---

## Stabilization pass (2026-05-28)

Polish only — no new big features, no tier or deals/promotions changes.

| Area               | Changes                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Navigation**     | `/` and `/app` redirect suppliers to Command Center via `SupplierHome.tsx`; sidebar lists Command Center first, Analytics second; active state highlights Command Center on home paths |
| **Command Center** | Quick-action bar, skeleton/error/empty states, deep links to orders/restaurants/invoices, reorder “Review reminder” dialog (copy-only, `autoSent: false`)                              |
| **Receivables**    | Invoice table with Unpaid/Partial/Overdue badges; aging labels; empty/error/retry                                                                                                      |
| **Delivery board** | Filter sentinel values fixed; status labels; empty/error states; rescheduled on dispatch + `orders.routes` schema                                                                      |
| **Import**         | Per-row preview table; download error CSV; disable import when 0 valid rows; loud toast on partial failures                                                                            |
| **Substitutes**    | Product name on order lines; pending amendment banner; empty/error states                                                                                                              |
| **Tests**          | API: `npx vitest run src/services/supplier-pain-killer.test.js` (6/6). Web: `src/components/supplier/supplierPainKiller.test.tsx` (3/3)                                                |

---

## 1. Delivery planning

### What existed (works)

| Capability                           | Location                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Driver CRUD                          | `drivers` table, `apps/api/src/routes/drivers.routes.js`, `DriversSettingsPanel.tsx` |
| Driver assignments                   | `driver_assignments`, assign/reassign/status                                         |
| Dispatch kanban                      | `GET /api/fulfillment/dispatch`, `DriverDispatchBoard.tsx`                           |
| Status flow                          | `assigned` → `picked_up` → `out_for_delivery` → `delivered` / `failed`               |
| Proof of delivery (text)             | `proof_of_delivery`, `POST/GET /api/orders/:id/proof-of-delivery`                    |
| Warehouse routing                    | `warehouseRouting.js`, auto-assign on order                                          |
| Fulfillment exceptions (cron + list) | `fulfillment_exceptions`, `fulfillment-exceptions.job.js`                            |
| Receiving after delivery             | `receiving.routes.js`                                                                |

### What existed (partial / stub)

| Capability            | Gap                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------- |
| Delivery zones UI     | API complete; Settings tab was hardcoded demo                                           |
| Route planning board  | Legacy `DispatchBoardView` not mounted; replaced by Driver Dispatch → Create route flow |
| Pick lists / waves    | DB only, no API                                                                         |
| POD photos/signatures | Schema fields exist; UI text-only                                                       |
| `rescheduled` status  | Not in driver assignment enum                                                           |

### What was enhanced

- **`rescheduled`** added to `driver_assignments` check constraint (migration `0125`).
- **`driver-delivery.js`** transitions: any active leg can move to `rescheduled`; `rescheduled` → `assigned`.
- **`GET /api/supplier/deliveries/board`** — daily board with:
  - Filters: `date`, `status`, `driver_id`, `area`
  - Normalized statuses: `pending`, `out_for_delivery`, `delivered`, `failed`, `rescheduled`
  - Grouping by delivery area + route summary
- **`DeliveryBoardFilters.tsx`** on Fulfillment dispatch tab (preview + filters).

### Remaining gaps

- Delivery zones Settings UI still stub (use warehouse zone API separately).
- POD photo/signature upload UI.
- Exception resolve/ignore buttons on Fulfillment page.
- Map optimization / turn-by-turn (manual stop order only).
- Suggested tiering (not enforced): **Silver** basic dispatch; **Gold** route planning; **Platinum** advanced optimization later.

### Route planning (2026-05-28)

- **`delivery-routes.service.js`** — create/list/detail/cancel routes; reorder stops; update stop status (syncs `driver_assignments`).
- **API** — `POST/PATCH/DELETE /api/fulfillment/routes`, stop reorder/status endpoints; `GET /routes/active` for drivers.
- **UI** — Driver Dispatch multi-select + Create route dialog; Routes tab table + detail; driver deliveries active route.
- **Migration** — `0127_delivery_route_planning.sql` (`driver_id`, `route_label`, `area` on `delivery_route`).
- **Tests** — `delivery-routes.service.test.js` (7), `fulfillment.routes.test.js` (3 integration), web fulfillment + routes empty-state tests.
- **Stabilization (2026-05-28)** — Migration 0127 applied; driver route isolation hardened; stop failure notes fixed; loading/error states on routes UI.

---

## 2. Invoice / payment tracking

### What existed (works)

| Capability                         | Location                                 |
| ---------------------------------- | ---------------------------------------- |
| Invoice lifecycle                  | `invoice`, `0009_finance_billing.sql`    |
| Auto-invoice on receive            | `receiving.routes.js`                    |
| Restaurant pay / partial / credits | `restaurant-finance.routes.js`           |
| Supplier invoice list + PDF        | `invoices.routes.js`, `InvoicesPage.tsx` |
| Overdue job                        | `invoice-overdue.job.js`                 |
| Credit notes via disputes          | `disputes.service.js`                    |

### What existed (partial)

| Capability                     | Gap                                                  |
| ------------------------------ | ---------------------------------------------------- |
| Supplier receivables dashboard | Only basic invoice list                              |
| Aging buckets (supplier)       | `restaurantInvoiceAging` report only; no supplier UI |
| Statement export               | Restaurant statement API; unused in UI               |
| Supplier record payment UI     | `POST /api/payments` exists, no UI                   |

### What was enhanced

- **`GET /api/supplier/invoices/receivables`** — unpaid/overdue totals, partial count, aging (`current`, `0_7`, `8_30`, `31_60`, `60_plus`), top debtors, invoice list.
- **`GET /api/supplier/invoices/receivables/statement/:restaurantId`** — CSV export.
- **`SupplierReceivablesPanel.tsx`** on supplier `InvoicesPage` (“who owes me” widget).

### Tier / RBAC gating

- `finance_invoices` feature + `INVOICES_VIEW` permission (unchanged).

### Remaining gaps

- Supplier “record payment” UI (API exists).
- Persisted `account_statement` / dunning tables (schema only).
- Invoice timeline on order detail (link to invoices partially exists for restaurant).

---

## 3. Customer reorder intelligence

### What existed

- **Restaurant** smart reorder: `GET /api/restaurant-inventory/reorder-suggestions` (Gold+ `smart_reorder`).
- Supplier restaurant list with basic last-order stats on `RestaurantsPage.tsx`.

### What was missing

- Supplier-side cadence / “customers at risk” / follow-up drafts.

### What was built

- **`supplier-reorder-intelligence.service.js`**
  - Computes avg days between orders per restaurant (min 2 orders in 180d).
  - Flags due when last order &gt; cadence + grace (default 7 days).
  - Top 5 products from order history.
- **`GET /api/supplier/reorder-intelligence`**
- **`POST /api/supplier/reorder-intelligence/:restaurantId/reminder-draft`**
  - Inserts `supplier_reorder_reminder_draft` with `status = draft`.
  - **`autoSent: false`** — no automatic messaging.
- Command center + reorder section UI with “Draft reminder” button.

### Tier gating

- No new tier flag (available to suppliers with `ORDERS_VIEW`).

---

## 4. Excel / catalog import

### What existed

- `ProductsPage.tsx` bulk dialog: client-side CSV parse, sequential `POST /api/products` per row.
- `.xlsx` accepted in file picker but read as plain text (broken for real Excel).

### What was enhanced

- **`POST /api/supplier/products/import/preview`** — row validation, duplicate-in-file detection, preview (up to 100 rows).
- **`POST /api/supplier/products/import`** — server import with `created` / `updated` / `failed` summary, partial import default `true`.
- **`POST /api/supplier/products/import/error-report`** — downloadable CSV of errors.
- **`ProductsPage.tsx`** — uses preview + execute APIs (CSV); shows import summary.

### Remaining gaps

- True `.xlsx` parsing (would need `xlsx` library or client convert-to-CSV).
- Interactive column-mapping UI (API accepts `columnMapping` object).

---

## 5. Substitute product suggestions

### What existed

- Order amendments with `item_substitution` (`0076_order_amendments.sql`, `order-amendments.service.js`).
- Timeline display for accepted substitutions (`orderTimeline.ts`).

### What was missing

- Product substitute catalog.
- Supplier propose UI; structured picker vs free-text “other” amendment.

### What was built

- **`product_substitute`** table (migration `0125`).
- **`GET/POST/DELETE /api/supplier/products/:productId/substitutes`**
- **`GET /api/supplier/orders/:orderId/substitutions`** — suggestions per line + pending amendments.
- **`POST /api/supplier/orders/:orderId/substitutions/propose`** — creates pending `item_substitution` amendment (restaurant accepts via existing **`POST /api/orders/:orderId/amendments/:id/accept`**).
- **`ProductSubstitutesSection.tsx`**, **`OrderSubstitutionPanel.tsx`**.

### Remaining gaps

- Enforce substitute only when line is out of stock (manual today).
- Price difference display on restaurant accept dialog (data available on API).

---

## 6. Supplier command center

### What existed

- Generic `DashboardPage` KPIs (`GET /api/admin/dashboard`).
- Scattered ops pages (orders, fulfillment, invoices, reports).

### What was built

- **`GET /api/supplier/command-center`** — parallel aggregates:
  - Orders to prepare today, deliveries pending, orders needing action
  - Receivables summary, reorder due count, low stock, open disputes, fulfillment alerts
  - Boosted deals impressions/clicks (read-only from `deal_promotions`)
  - Priority list + previews (deliveries, receivables, reorder, low stock)
- **`SupplierCommandCenterPage.tsx`** at **`/app/command-center`**
- Sidebar: **Command Center** under Overview (supplier).

### Remaining gaps

- Period-filtered KPIs (dashboard period selector still cosmetic on old dashboard).
- Deep links with query params pre-applied on target pages.

---

## APIs added / changed

| Method          | Path                                                              | Notes                 |
| --------------- | ----------------------------------------------------------------- | --------------------- |
| GET             | `/api/supplier/command-center`                                    | New                   |
| GET             | `/api/supplier/reorder-intelligence`                              | New                   |
| POST            | `/api/supplier/reorder-intelligence/:restaurantId/reminder-draft` | New                   |
| GET             | `/api/supplier/deliveries/board`                                  | New                   |
| GET             | `/api/supplier/invoices/receivables`                              | New                   |
| GET             | `/api/supplier/invoices/receivables/statement/:restaurantId`      | New CSV               |
| POST            | `/api/supplier/products/import/preview`                           | New                   |
| POST            | `/api/supplier/products/import`                                   | New                   |
| POST            | `/api/supplier/products/import/error-report`                      | New                   |
| GET/POST/DELETE | `/api/supplier/products/:productId/substitutes`                   | New                   |
| GET             | `/api/supplier/orders/:orderId/substitutions`                     | New                   |
| POST            | `/api/supplier/orders/:orderId/substitutions/propose`             | New                   |
| —               | `driver_assignments.status`                                       | Added `rescheduled`   |
| —               | `PATCH` delivery status                                           | Accepts `rescheduled` |

Existing routes **unchanged** for deals/promotions business logic.

---

## Frontend pages / components

| Item                            | Change                         |
| ------------------------------- | ------------------------------ |
| `SupplierCommandCenterPage.tsx` | **New**                        |
| `SupplierReceivablesPanel.tsx`  | **New**                        |
| `ProductSubstitutesSection.tsx` | **New**                        |
| `OrderSubstitutionPanel.tsx`    | **New**                        |
| `DeliveryBoardFilters.tsx`      | **New**                        |
| `InvoicesPage.tsx`              | Receivables panel (supplier)   |
| `ProductsPage.tsx`              | Server preview/import          |
| `ProductDetailPage.tsx`         | Substitutes section (supplier) |
| `OrderDetailPage.tsx`           | Substitution panel (supplier)  |
| `FulfillmentPage.tsx`           | Delivery board filters         |
| `Sidebar.tsx`                   | Command Center nav             |
| `App.tsx`                       | Route `/app/command-center`    |
| `api.ts`                        | RTK endpoints for supplier ops |

---

## Database

**Migration:** `apps/api/db/migrations/0125_supplier_pain_killer_features.sql`

| Object                            | Purpose                     |
| --------------------------------- | --------------------------- |
| `product_substitute`              | Approved alternate products |
| `supplier_reorder_reminder_draft` | Draft follow-up messages    |
| `driver_assignments.status`       | Add `rescheduled`           |

---

## Tests

**File:** `apps/api/src/services/supplier-pain-killer.test.js`

| #     | Scenario                                   | Status                                                                         |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| 1     | Command center KPI aggregation             | Covered                                                                        |
| 2     | Reorder intelligence detects due customers | Covered                                                                        |
| 3     | Reminder draft created, not auto-sent      | Covered                                                                        |
| 4     | Delivery board groups by area              | Covered                                                                        |
| 5     | Receivables unpaid/aging                   | Covered                                                                        |
| 6     | Import preview validates rows              | Covered                                                                        |
| 7–9   | Substitute CRUD / propose / accept         | Partial (service + amendments integration; route-level RBAC tests recommended) |
| 10–12 | RBAC / tier gates                          | Manual + existing middleware patterns                                          |

Run from `apps/api`:

```bash
npx vitest run src/services/supplier-pain-killer.test.js
```

Run from `apps/web`:

```bash
npx vitest run src/components/supplier/supplierPainKiller.test.tsx
```

---

## Manual QA checklist

1. Log in as **supplier** → lands on **Command Center** (`/app/command-center`).
2. Sidebar: **Command Center** first; **Analytics** opens legacy dashboard at `/app/dashboard`.
3. Command Center: KPIs load; quick actions navigate; empty sections show friendly copy when nothing due.
4. Simulate API error (offline) → Command Center shows retry.
5. **Invoices** → receivables panel: aging, badges (Unpaid/Partial/Overdue), links to restaurants.
6. **Products** → bulk CSV → preview shows row status/errors → import valid rows only → download error CSV if failures.
7. **Product detail** → add/remove substitute.
8. **Order detail** → propose substitute → restaurant accepts/rejects via amendments → timeline shows substitution.
9. **Fulfillment** → delivery board filters (date/status/driver/area); **Reschedule** on dispatch card; driver dispatch still works.
10. Reorder → **Review reminder** → dialog shows draft; copy clipboard; confirm `supplier_reorder_reminder_draft.status = draft` (no outbound message).
11. Mobile: open sidebar → Command Center link visible and tappable.

---

## Known limitations

- Delivery zones Settings UI still stub (API exists).
- True `.xlsx` import not supported (CSV only).
- Reminder drafts are not sent via in-app chat/email yet (manual copy).
- Supplier record-payment UI still missing (`POST /api/payments` only).
- POD photo/signature capture not wired in UI.
- Command Center KPIs are point-in-time (not filtered by dashboard period selector).

---

## Files changed (implementation + stabilization)

### API

- `apps/api/db/migrations/0125_supplier_pain_killer_features.sql`
- `apps/api/src/services/supplier-command-center.service.js`
- `apps/api/src/services/supplier-reorder-intelligence.service.js`
- `apps/api/src/services/supplier-receivables.service.js`
- `apps/api/src/services/supplier-deliveries.service.js`
- `apps/api/src/services/product-import.service.js`
- `apps/api/src/services/product-substitutes.service.js`
- `apps/api/src/routes/supplier-ops.routes.js`
- `apps/api/src/services/supplier-pain-killer.test.js`
- `apps/api/src/lib/driver-delivery.js`
- `apps/api/src/routes/orders-driver.routes.js`
- `apps/api/src/routes/orders.routes.js` (delivery_status includes `rescheduled`)
- `apps/api/src/server.js`

### Web

- `apps/web/src/pages/SupplierHome.tsx`
- `apps/web/src/pages/SupplierCommandCenterPage.tsx`
- `apps/web/src/components/supplier/ReorderReminderReviewDialog.tsx`
- `apps/web/src/lib/deliveryStatusLabels.ts`
- `apps/web/src/components/supplier/*.tsx`
- `apps/web/src/components/fulfillment/DeliveryBoardFilters.tsx`
- `apps/web/src/pages/InvoicesPage.tsx`
- `apps/web/src/pages/ProductsPage.tsx`
- `apps/web/src/pages/ProductDetailPage.tsx`
- `apps/web/src/pages/OrderDetailPage.tsx`
- `apps/web/src/pages/FulfillmentPage.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/services/api.ts`
- `apps/web/src/components/supplier/supplierPainKiller.test.tsx`

---

## Next recommended supplier features

1. Supplier record-payment UI wired to `POST /api/payments`.
2. Delivery zones Settings UI wired to `/api/warehouses/:id/zones`.
3. POD photo upload + restaurant confirm in web UI.
4. Mobile-friendly driver view / SMS reminder send from reorder draft (with explicit confirm).
5. Out-of-stock–triggered substitute prompts on order lines.
6. Unified notification center for command-center priorities.
