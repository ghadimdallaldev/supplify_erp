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

## Manual route stop ordering

Drivers and suppliers can **manually order delivery stops** on a route. There is no automatic route optimization yet — stop order is whatever the driver or supplier sets.

### Data model

- `route_stop.sequence_number` (migration `0006_fulfillment_logistics.sql`) — integer order per route, indexed on `(route_id, sequence_number)`.
- Standalone deliveries (not on a route) have no sequence; ETA falls back to direct driver → destination.

### Who can reorder

| Actor    | Permission                          | Scope                     |
| -------- | ----------------------------------- | ------------------------- |
| Supplier | `FULFILLMENT_MANAGE`                | Routes they own           |
| Driver   | `DRIVER_DELIVERIES_MANAGE` (linked) | Only their assigned route |

Completed or failed stops stay fixed; active stops can be reordered.

### APIs

| Method | Path                                        | Body / notes                                      |
| ------ | ------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/fulfillment/routes/today`             | Alias of `/routes/active` — driver’s route today  |
| GET    | `/api/fulfillment/routes/active`            | `IN_PROGRESS` or today’s `PLANNED` route          |
| POST   | `/api/fulfillment/routes/:id/stops/reorder` | `{ stop_ids: uuid[] }` — full list (legacy)       |
| PATCH  | `/api/fulfillment/routes/:id/stops/reorder` | `{ stops: [{ orderId, stopSequence }] }`          |
| PATCH  | `/api/fulfillment/routes/:id/next-stop`     | `{ orderId }` — move one stop to next active slot |

Stop payloads include `sequenceNumber`, `isNext`, `isCompleted`, `orderNumber`, and `destinationCoordinatesAvailable`.

### Frontend

- **Driver portal** (`DriverDeliveriesPage` / `DriverRoutePanel`): “Today’s deliveries”, next-stop card, move up/down, set as next.
- **Supplier fulfillment** (`FulfillmentRouteDetailPanel`): ordered stop list, badges (Next delivery, Completed, On the way, Waiting), reorder controls.

### ETA

When an order is on an active route, ETA uses the manual stop order — see [delivery-eta-and-live-tracking.md](./delivery-eta-and-live-tracking.md). Restaurants see `stopsBefore` and friendly copy only (no route IDs or internal route details).

### Future

Automatic route optimization (Mapbox/Google Directions, traffic, etc.) can be added later without changing the stop-order model.

---

## Driver-built route from assigned deliveries

When a supplier assigns orders individually (no planned route), drivers can group **standalone** deliveries into their own route.

### When it appears

Driver portal (`/app/driver/deliveries`): if the driver has **2+ active standalone assignments** and **no route today**, a card offers **Build my route**.

### API

| Method | Path                                             | Access                     |
| ------ | ------------------------------------------------ | -------------------------- |
| POST   | `/api/fulfillment/routes/build-from-assignments` | `DRIVER_DELIVERIES_MANAGE` |

Optional body: `{ "date": "YYYY-MM-DD" }` (defaults to today).

### Behavior

- Finds the driver’s assigned / picked up / out-for-delivery orders not already on a `PLANNED` or `IN_PROGRESS` route.
- Requires at least **2** eligible orders.
- Creates an `IN_PROGRESS` route labeled `{Driver name} — Today's route`, or merges into an existing today route.
- Repeated calls are idempotent (no duplicate stops).
- Supplier fulfillment → Routes shows the driver-built route like any other route.
- Stop reordering and route-aware ETA apply once the route exists.

---

## Map markers and all-deliveries map

Interactive maps use **Leaflet + OpenStreetMap tiles** (no turn-by-turn routing API).

### Single-order maps (`DeliveryTrackingMap`)

| Marker      | Who sees it          | Notes                                      |
| ----------- | -------------------- | ------------------------------------------ |
| Driver GPS  | Supplier, restaurant | Green = live, amber = stale, gray = no fix |
| Destination | **Supplier only**    | Orange pin; label from `destinationLabel`  |
| Recenter    | Both                 | Fits all visible markers; mobile-friendly  |

**Restaurant privacy:** tracking API does **not** expose destination latitude/longitude. Restaurant maps show the **driver pin only** plus ETA copy.

Supplier tracking drawer, order detail panel, and driver portal use the same map component with destination pins where allowed.

### All active deliveries map (supplier)

**Fulfillment → Delivery Tracking** tab: toggle **Board** / **Map**.

- Includes assignments in `assigned`, `picked_up`, `out_for_delivery`.
- Each delivery: driver marker (live / stale / no GPS) and destination marker when coordinates exist.
- Summary counts: live GPS, stale GPS, no GPS, ETA available.
- Click a marker or list row → existing **View tracking** drawer for that order.
- Board query: `GET /api/supplier/deliveries/board?status=active_delivery` (includes destination coords for supplier ops only).

---

- No paid turn-by-turn routing API (straight-line ETA only)
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
| `apps/web/src/components/maps/DeliveryTrackingMap.tsx`                      | Interactive map + recenter + markers     |
| `apps/web/src/components/maps/ActiveDeliveriesMap.tsx`                      | Supplier all-deliveries map view         |
| `docs/features/drivers-and-gps-tracking.md`                                 | This document                            |
| [fulfillment-logistics (archived)](../archive/old/fulfillment-logistics.md) | Exceptions, POD, env tables              |

---

## Tests added

- `driver-fulfillment.service.test.js` — delivered → `DELIVERED`
- `driver-location.service.test.js` — validation, disabled mode, active assignment
- Updated `supplier-pain-killer.test.js`, `DriverDispatchBoard` tests, `DriverDeliveriesPage.mobile.test.tsx`
