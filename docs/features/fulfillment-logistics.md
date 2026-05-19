# Fulfillment & Logistics

## Feature flags

| Flag                | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `fulfillment`       | Dispatch board, routes, exceptions (aliases `fulfillment_tools` on plans) |
| `driver_management` | Driver CRUD and order assignment                                          |

Bronze, Gold, and Platinum supplier plans include both flags. Free tier does not.

## Driver management

Settings → **Drivers**: add drivers with name, phone, vehicle, and optional home warehouse. Deactivate only when no active deliveries remain.

## Dispatch flow

Fulfillment → **Driver Dispatch** columns:

1. **Unassigned** — assign a driver (`POST /api/orders/:id/assign-driver`)
2. **Assigned** — Mark Picked Up → **Out for delivery** → **Delivered** or **Failed**
3. Status updates use `PATCH /api/orders/:id` with `{ "delivery_status": "picked_up" | ... }` (extends the existing order PATCH; no separate delivery-status route).
4. **Delivered today** — shows POD badge (proof on file / missing)

## Proof of delivery (POD)

Uses existing `proof_of_delivery` table. After marking delivered, optional modal submits `POST /api/orders/:id/proof-of-delivery`. Restaurants confirm via `POST /api/orders/:id/proof-of-delivery/confirm`.

## Exceptions

Fulfillment → **Exceptions** lists `fulfillment_exceptions` (auto-created):

| Type                 | Trigger                                      |
| -------------------- | -------------------------------------------- |
| `failed_delivery`    | Delivery marked failed                       |
| `no_pod`             | Delivered 2+ hours without POD (hourly cron) |
| `overdue`            | Out for delivery 4+ hours (30 min cron)      |
| `unassigned_overdue` | No driver 24+ hours (cron)                   |
| `dispute_raised`     | Restaurant opens dispute                     |

Resolve or ignore via `POST /api/fulfillment/exceptions/:id/resolve|ignore`.

## Warehouse filtering

When multi-warehouse is enabled, use the warehouse selector on the Fulfillment page; APIs accept `?warehouse_id=`.
