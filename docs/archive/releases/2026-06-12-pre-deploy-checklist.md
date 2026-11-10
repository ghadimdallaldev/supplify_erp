# Pre-deploy checklist — 2026-06-12

Use before pushing **dev → preprod → prod** (and **staging** if wired to Railway).

## Summary

| Area                         | Business logic?                                 | DB migration?          | User impact                                                                               |
| ---------------------------- | ----------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| B2C storefront + menu polish | Yes — new public storefront API, ordering hours | **Yes** `0164`, `0165` | Richer diner UX; branch live-order windows                                                |
| Supplier delivery board fix  | Yes — schema-safe zone join                     | **Yes** `0165`         | `/api/supplier/deliveries/board` no longer 500 when `delivery_zone` lacked `warehouse_id` |
| Staff portal + ERP UI polish | Mostly web UI                                   | No                     | Shell/motion polish; staff portal demo seed optional                                      |

**Do not skip migrations on any environment.**

## Migrations

| Migration                                 | Purpose                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `0164_consumer_ordering_hours.sql`        | `branch_fulfillment_config` live order window + preorder toggle                                   |
| `0165_supplier_delivery_zone_columns.sql` | Add supplier `warehouse_id` / `supplier_id` (and related) columns to shared `delivery_zone` table |

### Verify after deploy

```bash
cd apps/api && pnpm db:migrate
```

- `GET /api/supplier/deliveries/board` → **200** (not 500) for Free-tier supplier smoke account
- `GET /api/public/consumer/:slug/storefront` → **200** for B2C demo restaurant
- `information_schema.columns` for `delivery_zone` includes both `branch_id` and `warehouse_id`

## Related docs

- [../features/consumer-ordering.md](../features/consumer-ordering.md)
- [../features/warehouse-fulfillment.md](../features/warehouse-fulfillment.md)
