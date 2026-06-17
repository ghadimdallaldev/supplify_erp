# Pre-deploy checklist — 2026-06-17 (Supplier Ops Wave 2)

Use before pushing **dev → preprod → prod**.

## Summary

| Area                  | Business logic? | DB migration?                      | User impact                                     |
| --------------------- | --------------- | ---------------------------------- | ----------------------------------------------- |
| Run sheet             | Yes             | No                                 | `/app/run-sheet` daily ops brief                |
| Pick lists / waves    | Yes             | **Yes** `0177`                     | Fulfillment → Pick lists tab                    |
| Collections reminders | Yes             | **Yes** `0176`                     | Receivables remind + daily cron                 |
| Quote price lock      | Yes             | **Yes** `0178`                     | RFQ compare prices honored at checkout          |
| POD photo + signature | Yes             | **Yes** `0179`                     | Driver capture + restaurant confirm             |
| Excel product import  | Yes             | No                                 | `.xlsx` on bulk upload                          |
| Warehouse zones UI    | Yes             | No (uses existing `delivery_zone`) | Settings → Warehouses → Manage zones            |
| Accounting export     | Yes             | No                                 | Invoice/payment CSV + QuickBooks on Invoices    |
| Route optimization    | Yes             | No                                 | Nearest-neighbor optimize on fulfillment routes |
| Arabic i18n (web)     | UI only         | No                                 | Language switcher, RTL, locale formatting       |
| Restaurant payables   | Yes             | No                                 | Payables panel on restaurant Invoices           |

**Deploy Web and API together.** Migrations run on API boot when `RUN_MIGRATIONS_ON_START=true`.

## Migrations

| Migration                       | Purpose                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| `0176_invoice_reminder_log.sql` | Dedup log for collections reminder emails                                  |
| `0177_pick_lists_hardening.sql` | `order_item_id` on pick list items, picker user, indexes                   |
| `0178_quote_price_lock.sql`     | `QUOTE_PRICE` pricing source, `quote_response_item_id` on order lines      |
| `0179_pod_media_fields.sql`     | `signature_file_key`, `confirmed_by` / `confirmed_at` on proof of delivery |

### Verify after deploy

```bash
cd apps/api && pnpm db:migrate
```

- `GET /api/supplier/run-sheet` → **200** for supplier with fulfillment access
- `POST /api/fulfillment/waves/generate` → creates wave (Gold+ fulfillment)
- `POST /api/fulfillment/routes/:id/optimize` → returns proposed stop order
- `GET /api/supplier/invoices/export.csv` → CSV download
- Place order from quote compare with locked price → line `pricing_source = QUOTE_PRICE`
- Driver POD upload + restaurant confirm → signature fields populated

## Cron

Confirm `CRONS_ENABLED=true` in `deploy/railway/<env>/api.env`. New job:

- **Collections reminders** — 24 h interval (`CRON_JOBS.COLLECTIONS_REMINDERS`)

## Related docs

- [../features/supplier-ops.md](../features/supplier-ops.md)
- [../features/warehouse-fulfillment.md](../features/warehouse-fulfillment.md)
- [../features/drivers-and-gps-tracking.md](../features/drivers-and-gps-tracking.md)
- [../mobile/MOBILE_FEATURE_PARITY.md](../mobile/MOBILE_FEATURE_PARITY.md)
- [../features/ARABIC_LOCALIZATION_I18N.md](../features/ARABIC_LOCALIZATION_I18N.md)
