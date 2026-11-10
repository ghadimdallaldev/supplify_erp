# Invoice System Audit Report

Date: 2026-07-01

## Summary

Commercial B2B invoicing was consolidated around a new **`invoice.service.js`** layer. Invoices are generated when a restaurant completes receiving (accepted lines only), with duplicate prevention at the DB and transaction level. Payments and credit notes now share one code path that inserts `payment` rows so the existing balance trigger stays authoritative.

---

## Issues Found and Fixed

| Priority | Issue                                          | Fix                                                                                               |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| P0       | Concurrent double-receive race                 | Order `FOR UPDATE` + duplicate check inside transaction; `UNIQUE(order_id)` on `receiving_report` |
| P0       | Duplicate invoices per order                   | `UNIQUE(order_id, supplier_id)` on `invoice`; `assertNoDuplicateInvoice()`                        |
| P0       | Rejected/damaged lines on invoices             | Filter `quality_status = 'ACCEPTED'` and `received_quantity > 0`                                  |
| P0       | Tax hardcoded to 0 on auto-invoice             | Load `tax_config` in `createInvoiceFromReceiving`                                                 |
| P0       | Three invoice number formats                   | Migration `0183` unifies `generate_invoice_number()` (6-digit)                                    |
| P0       | `applyCreditNote` did not reduce balance       | Delegates to `applyCreditToInvoice()` (creates payment)                                           |
| P0       | List UI double-subtracted balance              | `invoiceRemainingBalance()` helper                                                                |
| P0       | PATCH invoice without tenant check             | `assertInvoiceTenantAccess` + `updateInvoiceStatus`                                               |
| P1       | Dead deep links `?invoice=` / `?pay=true`      | `InvoicesPage` reads `useSearchParams`                                                            |
| P1       | Supplier detail used restaurant API            | `useGetSupplierInvoiceQuery` → `GET /api/invoices/:id`                                            |
| P1       | Stale payment amount on dialog open            | Compute from clicked invoice                                                                      |
| P1       | Order invoice tab hidden for RECEIVED/INVOICED | Expanded tab visibility                                                                           |
| P1       | Receiving omitted invoice in response          | API returns `{ report, invoice }`; toast + link                                                   |
| P1       | Restaurant CSV export minimal                  | Rich CSV via `invoiceToCsvRow` + single-invoice `?invoiceId=`                                     |
| P1       | PDF missing payments/credits/balance           | `buildInvoicePdfBuffer` from full detail                                                          |
| P1       | Reports used `ORDERS_VIEW` for invoice reports | Added `INVOICES_VIEW` on aging/collection routes                                                  |
| P2       | Payment numbers from `Date.now()`              | `generate_payment_number()` SQL function                                                          |
| P2       | Manual PATCH could set PAID without payment    | Removed `PAID` from PATCH allowed statuses                                                        |
| P2       | Credit apply from list without invoice         | Credits applied via payment flow only                                                             |

---

## Files Changed

### Database

- `apps/api/db/migrations/0183_invoice_integrity.sql`

### Backend

- `apps/api/src/services/invoice.service.js` (new)
- `apps/api/src/services/invoice.service.test.js` (new)
- `apps/api/src/services/invoice.service.receiving.test.js` (new)
- `apps/api/src/lib/invoice-access.js` (new)
- `apps/api/src/lib/invoice-access.test.js` (new)
- `apps/api/src/routes/receiving.routes.js`
- `apps/api/src/routes/invoices.routes.js`
- `apps/api/src/routes/restaurant-finance.routes.js`
- `apps/api/src/routes/payments.routes.js`
- `apps/api/src/routes/credit-notes.routes.js`
- `apps/api/src/routes/reports.routes.js`
- `apps/api/src/services/disputes.service.js`
- `apps/api/src/routes/invoice-flow.integration.test.js` (new)

### Frontend

- `apps/web/src/services/api/endpoints/finance.ts`
- `apps/web/src/services/api/index.ts`
- `apps/web/src/lib/invoiceBalance.ts` (new)
- `apps/web/src/lib/invoiceBalance.test.ts` (new)
- `apps/web/src/pages/InvoicesPage.tsx`
- `apps/web/src/pages/OrderDetailPage.tsx`
- `apps/web/src/pages/ReceivingPage.tsx`
- `apps/web/src/components/invoices/InvoiceListPanel.tsx`
- `apps/web/src/components/invoices/InvoiceListPanel.test.tsx` (new)
- `apps/web/src/components/invoices/InvoiceDetailDialog.tsx`
- `apps/web/src/components/invoices/InvoiceCreditNotesCard.tsx`
- `apps/web/src/components/invoices/SupplierStatementPanel.tsx`
- `apps/web/src/components/supplier/SupplierReceivablesPanel.tsx`
- `apps/web/src/lib/notificationAlerts.ts`
- `apps/web/src/lib/orderTimeline.ts`
- `apps/web/src/i18n/locales/en/orders.json`
- `apps/web/src/i18n/locales/ar/orders.json`
- `apps/web/src/i18n/locales/en/invoices.json`

---

## Tests Added

- `invoice.service.test.js` — totals, transitions, CSV row
- `invoice.service.receiving.test.js` — accepted-line filter, duplicate guard
- `invoice-access.test.js` — tenant isolation
- `invoice-flow.integration.test.js` — pay + credit unit flow
- `invoiceBalance.test.ts` — frontend balance helper
- `InvoiceListPanel.test.tsx` — list remaining display

---

## Manual Test Script

1. Enable `finance_invoices` on restaurant and supplier test tenants.
2. Configure supplier `tax_config` (e.g. 10% VAT).
3. Place order → supplier delivers → mark order `DELIVERED`.
4. Receive with one line `REJECTED` and partial qty on another → invoice lines = accepted only.
5. Retry receive → expect **409**; refresh → still one invoice.
6. Restaurant `/app/invoices` — totals match receiving; status `ISSUED`.
7. Open order → Invoice tab visible for `INVOICED`; click View → `?invoice=` opens detail.
8. Supplier receivables shows same amount; deep link opens invoice.
9. Restaurant partial payment → `PARTIALLY_PAID`, correct remaining.
10. Pay with credit note in payment dialog → balance reduced; credit note `APPLIED`.
11. Complete payment → `PAID`.
12. Download PDF and CSV — match on-screen subtotal, tax, paid, balance.
13. Supplier viewer cannot PATCH another tenant’s invoice ID (404/403).

---

## Remaining Risks / Assumptions

- **Migration backfill**: Existing duplicate `receiving_report` or `invoice` rows must be cleaned before applying unique indexes in production.
- **`generate_payment_number` / `generate_invoice_number`**: Require migration `0183` applied; tests mock DB without these functions.
- **Order-level discounts**: Applied via `promotion_usages.discount_applied` as a single discount line; proportional line-item discount not implemented.
- **Delivery fees**: Not on B2B `customer_order`; delivery fee line only if extended later.
- **Mobile**: `supplify-mobile` invoice screens should be retested if API response shape changes (`GET /api/invoices/:id` now includes `payments`, `creditNotes`, `remaining_balance`).
- **Admin finance**: Still aggregate-only; no per-tenant invoice admin UI.

---

## How to Run Tests

```bash
cd apps/api && npm test -- src/services/invoice.service.test.js src/services/invoice.service.receiving.test.js src/lib/invoice-access.test.js src/routes/invoice-flow.integration.test.js

cd apps/web && npm test -- src/lib/invoiceBalance.test.ts src/components/invoices/InvoiceListPanel.test.tsx
```

Apply migration:

```bash
cd apps/api && npm run migrate
```
