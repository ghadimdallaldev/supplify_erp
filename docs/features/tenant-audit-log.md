# Tenant Audit Log

## Overview

Restaurant and supplier owners can review activity in their tenant via the unified `audit_logs` table (migration `0046`). Entries are scoped by `tenant_type` and `tenant_id`.

## API

Requires auth and tenant context (`RESTAURANT` or `SUPPLIER`).

| Method | Path                      | Permission        | Description                                                                |
| ------ | ------------------------- | ----------------- | -------------------------------------------------------------------------- |
| GET    | `/api/audit/logs/filters` | `SETTINGS_VIEW`   | Dropdown options: `actions[]`, `resourceTypes[]` (`value` + human `label`) |
| GET    | `/api/audit/logs`         | `SETTINGS_VIEW`   | Paginated logs; filters: `userId`, `action`, `resourceType`, `from`, `to`  |
| GET    | `/api/audit/logs/export`  | `SETTINGS_MANAGE` | CSV export (max 5000 rows)                                                 |

### UI filters (Settings → Activity)

- **Action** and **Resource type** are select dropdowns with human-readable labels (e.g. “Order placed”, “Order”), not free-text codes.
- Options merge the known catalog (`apps/api/src/lib/audit-labels.js`) with distinct values already stored for the tenant.
- **From** / **To** remain date pickers.

### Response fields

- `action` — machine id (`action_type` from DB)
- `action_label` — display label for UI/CSV
- `resource_type` / `resource_id` — from `payload_json` and `target_id`
- `resource_type_label` — display label for resource type
- `user_name`, `user_email` — joined from `app_user`
- `ip_address` — masked (/24 for IPv4)
- `metadata` — full `payload_json`

## Writing audit entries

Use `writeAuditLog(req, opts)` from `apps/api/src/lib/audit.js`. Tenant context is filled from `req.tenantContext` when omitted.

Audited mutations include (non-exhaustive):

- Order placement (`order.created`)
- Product create/update (`product.created`, `product.updated`)
- Promotion create/update
- Order amendment lifecycle

`resource_type` is stored in `payload_json`; no extra migration (`0075`) required.
