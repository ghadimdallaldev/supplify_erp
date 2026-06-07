# Fulfillment, logistics & GPS tracking

Canonical reference for supplier dispatch, drivers, routes, live GPS, POD, and exceptions.

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

## Dispatch flow

Fulfillment → **Driver Dispatch**: Unassigned → assign driver → Picked Up → Out for delivery → Delivered or Failed. Status updates use `PATCH /api/orders/:id/delivery-status` (canonical). Driver delivery sets order status to **`DELIVERED`**; receiving accepts `DELIVERED` or `COMPLETED`. See [receiving.md](./receiving.md).

---

## Current state (GPS & delivery service)

_Last updated after GPS/live tracking (migration 0137)._

## Executive summary

Supplify runs **supplier-operated last-mile delivery** on existing tables (`drivers`, `driver_assignments`, `delivery_route`, `route_stop`, `proof_of_delivery`). Dispatch, driver mobile, routes, POD, and receiving share one **canonical delivery service** (`driver-fulfillment.service.js`).

**Status unification:** Driver delivery sets `customer_order.status = DELIVERED` (not `COMPLETED`). `COMPLETED` remains for post-receiving flows.

**GPS (new):** Drivers send location pings during active assignments; suppliers and restaurants (optional) see latest position on tracking endpoints and UI. No parallel courier/shipment module.

---

## GPS tracking (implemented)

### Database (`0137_driver_location_tracking.sql`)

- `driver_location_ping` — history of pings
- `driver_latest_location` — upserted latest position per driver
- `proof_of_delivery.delivery_gps_lat/lng` — written when POD includes coordinates

### Environment

**API:** `GPS_TRACKING_ENABLED`, `GPS_STALE_AFTER_SECONDS` (default 300), `GPS_UPDATE_INTERVAL_SECONDS`, `GPS_MIN_ACCURACY_METERS`, `GPS_LOCATION_RETENTION_DAYS`, `GPS_ALLOW_RESTAURANT_LIVE_TRACKING`, `GPS_RESTAURANT_SHOW_DRIVER_NAME`, `GPS_RESTAURANT_SHOW_DRIVER_PHONE`, `GPS_ALLOW_DRIVER_BACKGROUND_HINT`, `MAP_PROVIDER`, `GOOGLE_MAPS_API_KEY`, `MAPBOX_ACCESS_TOKEN`

**Web:** `VITE_GPS_TRACKING_ENABLED`, `VITE_GPS_UPDATE_INTERVAL_SECONDS`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_MAP_PROVIDER`, `VITE_MAPBOX_ACCESS_TOKEN`

### APIs

| Method | Path                              | Access                                            |
| ------ | --------------------------------- | ------------------------------------------------- |
| POST   | `/api/orders/:id/location`        | Driver (linked, assigned) or `FULFILLMENT_MANAGE` |
| GET    | `/api/orders/:id/tracking`        | Supplier, restaurant (if flag), assigned driver   |
| PATCH  | `/api/orders/:id/delivery-status` | Canonical status updates                          |

Dispatch, delivery board, route detail, command center, and `GET /api/orders/:id/tracking` expose standard `tracking` payload. Legacy `driver_last_seen` / `driverLastSeen` aliases remain one release.

### Frontend

- `DriverDeliveriesPage` — `watchPosition`, tracking badge, GPS error state
- `DeliveryTrackingMap` / `DeliveryTrackingDrawer` — shared supplier map + drawer (30s poll)
- `FulfillmentTrackingTab` — GPS column, **View tracking** drawer, 30s board poll
- `DriverDispatchBoard` — GPS label on every card, **View tracking** drawer
- `SupplierCommandCenterPage` — **GPS today** summary (live / stale / no GPS / failed)
- `FulfillmentRouteDetailPanel` — per-stop GPS label + link to drawer
- `OrderDeliveryTrackingPanel` — **supplier order detail only**; uses shared map
- `orderTimeline` — driver assignment milestones when tracking data present

### Restaurant order tracking (implemented)

- Sanitized `GET /api/orders/:id/tracking` via [`restaurant-tracking-payload.js`](../../apps/api/src/lib/restaurant-tracking-payload.js)
- [`RestaurantOrderTrackingPanel`](../../apps/web/src/components/orders/RestaurantOrderTrackingPanel.tsx) on restaurant order detail
- Shared map + labels; 30s poll during active delivery; **Receive order** links to receiving (no auto-receive from GPS)

### Privacy

- Restaurants see live map only after dispatch starts (`picked_up` / `out_for_delivery`), not for planned routes or driver-assigned-but-not-dispatched states
- Restaurants see latest point only for their order (no history, no route stops, driver phone hidden by default)
- No email per GPS ping
- Driver/supplier GPS polling uses assignment statuses: `assigned`, `picked_up`, `out_for_delivery`

---

## Restaurant delivery location coordinates

Destination GPS for ETA is stored on **`branch`** (per operational location) and **`restaurant`** (tenant fallback). Text `address_json` alone is not used for ETA.

- Migration: `0143_restaurant_delivery_coordinates.sql`
- Restaurant settings: **Profile → Delivery location** (latitude, longitude, label, notes)
- APIs: `GET/PATCH /api/restaurants/me/delivery-location`, `PATCH /api/restaurants/branches/:branchId/delivery-location`
- Tracking: `destinationCoordinatesAvailable`, `destinationLabel`, `etaAvailable`, minute range, and distance on `GET /api/orders/:id/tracking`

See [delivery-eta-and-live-tracking.md](./delivery-eta-and-live-tracking.md) for ETA formula, env vars, gating rules, and payload visibility.

---

## Planned route assignment before dispatch

Suppliers can **plan** delivery routes before orders are dispatch-ready. This is separate from **active** dispatch.

| Phase       | `delivery_route.status`   | `driver_assignments`                  | Live GPS / restaurant map  | Driver app                |
| ----------- | ------------------------- | ------------------------------------- | -------------------------- | ------------------------- |
| **Planned** | `PLANNED`                 | **None** (not created at plan time)   | Off                        | No active route           |
| **Active**  | `IN_PROGRESS`             | Created for dispatch-ready stops only | On when driver sends pings | Active route + deliveries |
| **Done**    | `COMPLETED` / `CANCELLED` | Terminal                              | Off                        | —                         |

### Eligible order statuses

| Action                                        | `customer_order.status` values                                        |
| --------------------------------------------- | --------------------------------------------------------------------- |
| Add to **planned** route                      | `PLACED`, `PENDING_APPROVAL`, `ACKNOWLEDGED`, `PROCESSING`, `SHIPPED` |
| **Activate** route (assign driver + dispatch) | `PROCESSING`, `SHIPPED` only                                          |

Mapping from ops language: CONFIRMED/ACCEPTED → `ACKNOWLEDGED`; PREPARING → `PROCESSING`; READY_FOR_DELIVERY → `SHIPPED`.

### Supplier UI

- Dispatch board: **Assign to planned route** (multi-select → planned route dialog)
- Badge: **Planned route** or **Route planned — waiting for order to be ready**
- Routes tab: **Activate route (start dispatch)** on a `PLANNED` route

### APIs

| Method | Path                                                    | Notes                                                     |
| ------ | ------------------------------------------------------- | --------------------------------------------------------- |
| POST   | `/api/fulfillment/routes`                               | Creates `PLANNED` route + stops; **no** driver assignment |
| POST   | `/api/fulfillment/routes/:id/stops`                     | Add orders to existing planned route                      |
| DELETE | `/api/fulfillment/routes/:id/stops/:orderId`            | Remove from planned route                                 |
| PATCH  | `/api/fulfillment/routes/:id` `{ status: IN_PROGRESS }` | Activates dispatch for ready stops                        |

### Edge cases

- **Cancelled order:** removed from planned routes (`releaseOrderFromPlannedRoutes`)
- **Non-ready stops on activate:** stay on route as planned stops; ready stops get driver assignments
- **Duplicate routing:** an order cannot be on two `PLANNED`/`IN_PROGRESS` routes

### Rollback notes

- Revert `createDeliveryRoute` deferral of `syncDriverAssignment` restores old “assigned on create” behavior
- Restaurant live-tracking guard is in `driver-location.service.js` (`picked_up` / `out_for_delivery` only)

---

- No route optimization or ETA engine
- No Socket.io live map stream (polling on tracking query)
- GPS coordinates are client-reported (no device attestation or geofence validation)
- `delivery_wave` / legacy `delivery_exception` tables still unused

### Retention

- Cron `driver_location_retention` (24 h) purges `driver_location_ping` older than `GPS_LOCATION_RETENTION_DAYS`; `driver_latest_location` is retained for ops dashboards

---

## Canonical delivery service

**File:** [`driver-fulfillment.service.js`](../../apps/api/src/services/driver-fulfillment.service.js)

**Legacy shim:** [`driver-delivery.js`](../../apps/api/src/lib/driver-delivery.js) delegates to the service.

**Assignment statuses:** `assigned` → `picked_up` → `out_for_delivery` → `delivered` | `failed` | `rescheduled` | `reassigned`

**Notifications:** `notifyDriverDeliveryMilestone` for assign, out for delivery, delivered, failed; `notifyOrderStatusChange(DELIVERED)` on deliver.

---

## Key files (GPS-related)

| Path                                                                        | Role                                     |
| --------------------------------------------------------------------------- | ---------------------------------------- |
| `apps/api/db/migrations/0137_driver_location_tracking.sql`                  | Schema                                   |
| `apps/api/src/lib/delivery-tracking-payload.js`                             | Standard `tracking` object + stale logic |
| `apps/api/src/lib/restaurant-tracking-payload.js`                           | Sanitized restaurant tracking response   |
| `apps/web/src/components/orders/RestaurantOrderTrackingPanel.tsx`           | Restaurant order detail tracking UI      |
| `apps/api/src/services/driver-location.service.js`                          | Ping ingest + tracking read              |
| `apps/api/src/routes/orders-driver.routes.js`                               | Location + tracking routes               |
| `apps/web/src/hooks/useDriverLocationTracking.ts`                           | Browser geolocation                      |
| `apps/web/src/components/orders/OrderDeliveryTrackingPanel.tsx`             | Order detail tracking UI                 |
| `docs/features/drivers-and-gps-tracking.md`                                 | This document                            |
| [fulfillment-logistics (archived)](../archive/old/fulfillment-logistics.md) | Exceptions, POD, env tables              |

---

## Tests added

- `driver-fulfillment.service.test.js` — delivered → `DELIVERED`
- `driver-location.service.test.js` — validation, disabled mode, active assignment
- Updated `supplier-pain-killer.test.js`, `DriverDispatchBoard` tests, `DriverDeliveriesPage.mobile.test.tsx`
