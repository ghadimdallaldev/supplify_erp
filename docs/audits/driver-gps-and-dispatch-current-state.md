# Driver GPS and dispatch current state

Audit date: 2026-07-29

## Scope and evidence

This audit inspected the driver authentication/RBAC path, driver assignment and delivery status services, the fulfillment board and route APIs, GPS persistence and stale-GPS jobs, ETA calculation, browser driver UI, Leaflet maps, Socket.IO/Redis infrastructure, proof of delivery, migrations, and focused automated tests.

Primary evidence includes:

- `apps/api/src/lib/driver-rbac.js`
- `apps/api/src/services/driver-fulfillment.service.js`
- `apps/api/src/services/driver-location.service.js`
- `apps/api/src/services/delivery-routes.service.js`
- `apps/api/src/routes/orders-driver.routes.js`
- `apps/api/src/routes/fulfillment/board.js` and `routes.js`
- `apps/web/src/hooks/useDriverLocationTracking.ts`
- `apps/web/src/pages/DriverDeliveriesPage.tsx`
- migrations `0006_fulfillment_logistics.sql`, `0088_drivers_fulfillment.sql`, `0126_rbac_driver_role_hardening.sql`, `0127_delivery_route_planning.sql`, and `0137_driver_location_tracking.sql`
- focused API/web GPS, route, RBAC, map, and ETA tests

## 1. Current end-to-end dispatch flow

Supplier fulfillment access is mounted at `/api/fulfillment` behind authentication, tenant resolution, supplier/admin role checks, the `fulfillment` feature gate, and `requireFulfillmentAccess`. The board and dispatch endpoints query supplier-owned orders and enrich them with the latest driver location.

Supplier staff assigns a driver through `/api/orders/:id/assign-driver`. `driver-fulfillment.service.js` validates supplier ownership and active driver membership, creates or updates a `driver_assignments` row, and preserves assignment history. Delivery status changes use `/api/orders/:id/delivery-status` and route-stop status APIs; driver-only permissions are restricted by `driver-rbac.js`.

Drivers use `/app/driver/deliveries`. The page loads the supplier delivery board and the driver's active route. It supports building a route from assignments, moving/reordering stops where allowed, selecting the next stop, changing route-stop status, changing standalone order delivery status, and proof-of-delivery flows.

The current browser GPS hook starts `navigator.geolocation.watchPosition` whenever there is at least one trackable assigned delivery. It sends the same point to each active order through `POST /api/orders/:id/location`. The server validates tenant ownership, linked driver identity, assignment access, route context, timestamps, accuracy, and a per-driver/order interval before inserting history and updating the latest snapshot.

Supplier and restaurant tracking read through `GET /api/orders/:id/tracking`; the supplier dispatch and tracking boards use batched `driver_latest_location` reads. The tracking response is privacy-sanitized for restaurants. Polling is currently the primary board refresh mechanism (roughly 30 seconds); Socket.IO is already present for chat and notifications but is not currently used for GPS events.

## 2. How drivers are assigned

The durable driver model is `drivers`, scoped by `supplier_id`, with an optional `user_id` link added by the driver-role hardening migration. An assignment is `driver_assignments(order_id, driver_id, supplier_id, status, ...)`. Assignment status values are `assigned`, `picked_up`, `out_for_delivery`, `delivered`, `failed`, and `reassigned`; `rescheduled` is handled by later delivery logic.

Driver-only requests resolve the linked driver from the authenticated user and tenant, then call `assertDriverAssignmentAccess`. This prevents a driver from posting or reading another driver's order, another supplier's order, or an unrelated assignment. Supplier managers can operate within their supplier scope.

## 3. Whether one driver can carry multiple orders

Yes. A driver can have multiple active `driver_assignments`. The route builder groups eligible assignments into one `delivery_route`, and each route has multiple `route_stop` rows. The legacy location endpoint is per order, but the durable latest snapshot is per driver, which is why the current implementation needs an order-scoped lookup plus a driver fallback.

## 4. Whether formal delivery runs and stops already exist

Yes. `delivery_route` is the existing delivery-run equivalent. It is supplier-scoped, has a scheduled date, status (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), and now links to `driver_id`. `route_stop` belongs to a route, references one order, and has `sequence_number`, destination data, status, arrival/completion timestamps, and notes. Do not create a second run, manifest, trip, or stop entity.

## 5. How stop sequencing works

Routes are built from driver assignments and ordered by the existing route service. `route_stop.sequence_number` is the source of order. The driver UI identifies the first non-terminal stop as next, supports reorder through the route API, and supports an explicit next-stop operation. Route status transitions are coordinated with stop updates and existing delivery-status business rules.

## 6. How GPS is associated with orders

`driver_location_ping` currently stores `supplier_id`, `driver_id`, optional `order_id`, optional `driver_assignment_id`, optional `route_id`, and optional `route_stop_id`, plus coordinates and telemetry. `driver_latest_location` has one row per driver and also points at the latest order/assignment/route context. `recordDriverLocation` requires the order to have an active assignment for that driver and only accepts `assigned`, `picked_up`, or `out_for_delivery` assignments.

Validation currently covers coordinate ranges, `(0,0)`, future skew, maximum age, minimum accuracy preference, duplicate-ish better-ping suppression, route/order consistency, and rate limiting. It does not yet record explicit rejection diagnostics, impossible speed/jump checks, client point IDs, sequence numbers, raw versus processed coordinates, receive timestamps, or a session identity.

## 7. How supplier and restaurant maps receive updates

Supplier board/dispatch data is fetched from `/api/fulfillment/board` and `/api/fulfillment/dispatch`, which batch-read latest locations and build the standard tracking payload. `FulfillmentTrackingTab` polls the board and can switch to `ActiveDeliveriesMap`, which uses Leaflet. Detail drawers fetch order tracking and render `DeliveryTrackingMap` with optional external Google Maps navigation links.

Restaurant order tracking calls the same order tracking service with restaurant scope. Restaurant responses expose only the permitted delivery's tracking, ETA, and sanitized driver details; internal route IDs/reasons are not exposed. `GPS_ALLOW_RESTAURANT_LIVE_TRACKING` and restaurant driver-name/phone flags already exist.

Socket.IO is initialized in `apps/api/src/lib/socket.js`, authenticates from the existing cookie/token flow, joins user/restaurant rooms, and uses `@socket.io/redis-adapter` when Redis is configured. It currently carries chat, notification, and entitlement events, not location updates. Polling is therefore the safe existing fallback.

## 8. Current weaknesses and risks

1. Browser tracking starts implicitly when trackable orders exist and has no explicit run/session start or stop action.
2. One GPS point is posted once per order, multiplying network and server work for multi-stop routes and making a driver's stream order-dependent.
3. There is no durable tracking session, batch ingestion, client idempotency key, sequence ordering, or offline queue.
4. Latest-location reads are PostgreSQL-only. Redis exists but is used for general cache and Socket.IO fan-out, not latest GPS reads.
5. The latest snapshot is per driver, while historical points are partly order-scoped; route/stop context can be overwritten by later order requests.
6. Validation does not persist rejection reasons or distinguish raw/processed points. There is no impossible-speed or large-jump filter.
7. GPS health is essentially enabled/no-location/live/stale; it does not distinguish permission, precise location, provider, background, battery, offline, or server-rejection states.
8. There is no native Android project or foreground service. The PWA/browser path remains foreground-dependent.
9. Live map updates are polling-based and marker interpolation is not a first-class confirmed-location behavior.
10. Existing stale-GPS and retention jobs are useful, but stale alerts are order-oriented rather than tracking-session/driver oriented.

## 9. Existing tests

Relevant coverage includes `orders-driver-location.test.js`, `orders-driver-tracking.test.js`, `driver-location.service.test.js`, `delivery-eta.service.test.js`, `delivery-routes.service.test.js`, `fulfillment.routes.test.js`, `driverGpsTracking.test.ts`, `DriverDeliveriesPage.mobile.test.tsx`, map tests, dispatch-board tests, restaurant tracking payload tests, Socket.IO helper/auth/adapter tests, stale-GPS alert tests, and the location retention job test. Existing QA and audit documents also enumerate GPS and RBAC regression cases.

The current tests verify legacy endpoint authorization, coordinate validation, supplier/restaurant privacy, stale payloads, route-aware ETA, route access, and browser UI behavior. They do not yet cover sessions, batch partial success, idempotency, Redis latest-location fallback, event authorization, native provider selection, or Android lifecycle behavior.

## 10. Reusable parts

- Existing `drivers`, `driver_assignments`, `delivery_route`, and `route_stop` entities and route APIs.
- Existing tenant/RBAC middleware and linked-driver checks.
- Existing legacy order-location endpoint for compatibility during rollout.
- Existing PostgreSQL historical/latest tables as the durable source and fallback.
- Existing Socket.IO authentication, Redis adapter, connection lifecycle, and browser socket client.
- Existing Leaflet map components and Google Maps external navigation links.
- Existing ETA Haversine fallback and route-stop context.
- Existing delivery status machine, route-stop status machine, proof-of-delivery flow, stale alerts, retention job, and feature flags.
- Existing Vitest and API/web test harnesses.

## Targeted upgrade boundary

The implementation should add a session and telemetry layer around the existing route/stop/assignment model, preserve the order endpoint, use Socket.IO rooms for authorized live events, and add Redis as an optional latest-location accelerator with PostgreSQL fallback. The native client now lives in the standalone Expo repositories; the retired Capacitor shell is historical only. Dispatch and Leaflet remain unchanged.
