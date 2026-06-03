# Fulfillment & Logistics

## Feature flags

| Flag                | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| `fulfillment`       | Dispatch board, routes, exceptions (aliases `fulfillment_tools` on plans) |
| `driver_management` | Driver CRUD and order assignment                                          |

| Plan   | `fulfillment` / `fulfillment_tools` | `driver_management` |
| ------ | ----------------------------------- | ------------------- |
| Free   | off                                 | off                 |
| Silver | on (manual pick/pack/ship)          | **off**             |
| Gold+  | on                                  | on                  |

Free tier has neither flag. Restaurant plans do not include supplier fulfillment flags.

## Driver management

Settings → **Drivers**: add drivers with name, phone, vehicle, and optional home warehouse. Deactivate only when no active deliveries remain.

## Dispatch flow

Fulfillment → **Driver Dispatch** columns:

1. **Unassigned** — assign a driver (`POST /api/orders/:id/assign-driver`)
2. **Assigned** — Mark Picked Up → **Out for delivery** → **Delivered** or **Failed**
3. Status updates use `PATCH /api/orders/:id/delivery-status` with `{ "status": "picked_up" | ... }` (canonical). Legacy `PATCH /api/orders/:id` with `delivery_status` delegates to the same service.
4. Driver delivery sets order status to **`DELIVERED`** (not `COMPLETED`). Receiving accepts `DELIVERED` or `COMPLETED`.

## GPS / live tracking

Requires migration `0137_driver_location_tracking.sql` and env vars (`GPS_TRACKING_ENABLED`, `GPS_STALE_AFTER_SECONDS`, map keys).

| Endpoint                        | Purpose                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `POST /api/orders/:id/location` | Driver (or fulfillment manager) sends GPS ping during active assignment     |
| `GET /api/orders/:id/tracking`  | Supplier, restaurant (if allowed), or assigned driver reads latest position |

- Pings stored in `driver_location_ping`; latest position in `driver_latest_location` (latest ping only — no trail/history for suppliers).
- APIs attach a standard `tracking` object: `{ enabled, hasLocation, lastSeenAt, isStale, staleAfterSeconds, latestLocation }`. Stale when `recordedAt` is older than `GPS_STALE_AFTER_SECONDS` (default 300).
- Restaurant tracking hides driver phone by default; no location history exposed to restaurants.
- Driver app (`DriverDeliveriesPage`) uses browser `watchPosition` only while assignment is `assigned`, `picked_up`, or `out_for_delivery`.
- POD may include `latitude` / `longitude` → `proof_of_delivery.delivery_gps_lat/lng`.
- Map embed optional via `VITE_GOOGLE_MAPS_API_KEY` / `VITE_MAP_PROVIDER`; fallback external Google Maps link.

### Supplier dispatch UI

| Surface                    | Behavior                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Dispatch board             | Every card shows GPS label: **Live**, **GPS stale**, **No GPS yet**, or **Tracking off**; **View tracking** opens drawer |
| Fulfillment → Tracking tab | Board of `picked_up` / `out_for_delivery` with GPS column; 30s polling                                                   |
| Command center             | **GPS today** widget: live / stale / no GPS / failed counts                                                              |
| Order detail (supplier)    | `OrderDeliveryTrackingPanel` with map; copy **ETA not available yet**                                                    |

No ETA, route optimization, or Socket live map stream in this release.

### Restaurant order tracking

| Surface                   | Behavior                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order detail (restaurant) | `RestaurantOrderTrackingPanel` — delivery status, GPS state, map/fallback link, **ETA not available yet**                                                         |
| API                       | `GET /api/orders/:id/tracking` returns sanitized payload (`orderReference`, `delivery`, `driver`, `tracking`) — no route stops, dispatch metadata, or GPS history |
| Privacy                   | `GPS_ALLOW_RESTAURANT_LIVE_TRACKING`, `GPS_RESTAURANT_SHOW_DRIVER_NAME` (default true), `GPS_RESTAURANT_SHOW_DRIVER_PHONE` (default false)                        |
| Location scope            | Latest ping for **this order only** (`order_id` match; no driver-level fallback)                                                                                  |
| Polling                   | 30s while assignment is `assigned`, `picked_up`, or `out_for_delivery`                                                                                            |
| Receiving                 | **Receive order** CTA when delivered; GPS does not auto-complete receiving                                                                                        |

Disabled restaurant tracking returns `trackingEnabled: false` and `reason: restaurant_tracking_disabled`.

## Environment variables

| Variable                             | Default  | Notes                                                                                                    |
| ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `GPS_TRACKING_ENABLED`               | `true`   | Master switch                                                                                            |
| `GPS_STALE_AFTER_SECONDS`            | `300`    | Stale threshold for `tracking.isStale`                                                                   |
| `GPS_UPDATE_INTERVAL_SECONDS`        | `15`     | Driver client hint                                                                                       |
| `GPS_ALLOW_RESTAURANT_LIVE_TRACKING` | `true`   | Restaurant `GET .../tracking`                                                                            |
| `GPS_RESTAURANT_SHOW_DRIVER_NAME`    | `true`   | Include `driver.name` in restaurant payload                                                              |
| `GPS_RESTAURANT_SHOW_DRIVER_PHONE`   | `false`  | Omit phone unless explicitly enabled                                                                     |
| `VITE_GPS_TRACKING_ENABLED`          | `true`   | Web map/tracking UI                                                                                      |
| `VITE_GOOGLE_MAPS_API_KEY`           | —        | Optional embed; fallback link if unset                                                                   |
| `VITE_MAP_PROVIDER`                  | `google` | Map provider hint                                                                                        |
| `GPS_LOCATION_RETENTION_DAYS`        | `90`     | Daily cron deletes old rows from `driver_location_ping` (see [CRON_JOBS.md](../operations/CRON_JOBS.md)) |

Full list: [ENVIRONMENT_VARIABLES.md](../../ENVIRONMENT_VARIABLES.md) · templates in `apps/api/.env.example`.

**Known limits:** latest ping only; no ETA; 30s HTTP polling (no WebSocket map); client-reported coordinates (no GPS attestation); server enforces assignment scope, `recordedAt` skew window, and per-order rate limit aligned with `GPS_UPDATE_INTERVAL_SECONDS`.

## Manual QA

Regression IDs in [MANUAL_TEST_CHECKLIST.md](../qa/MANUAL_TEST_CHECKLIST.md): **§7.4.1** (supplier GPS), **§6.6.1** (restaurant GPS), **DRV-\*** (driver portal). Demo path: [DEMO_SCRIPT.md](../qa/DEMO_SCRIPT.md) §3.

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
