# Driver live tracking upgrade plan

> Historical note (2026-08-06): the Capacitor Android shell described below was retired. Native mobile development now lives only in C:/myProjects/supplify-mobile and C:/myProjects/supplify-mobile-ios.

## Architecture decision

Use the existing `delivery_route` as the delivery run and `route_stop` as the ordered stop model. Add `driver_tracking_session` as the single active stream per driver/run, while retaining `driver_assignments` and the legacy `POST /api/orders/:id/location` endpoint during migration.

## Existing files to modify

- `apps/api/src/config/env.js` and `apps/api/env.example`: validate new rollout, validation, queue, TTL, rate, and geofence settings.
- `apps/api/src/services/driver-location.service.js`: share validation/acceptance logic with sessions, write history/latest snapshots, update Redis best-effort, and emit authorized live events.
- `apps/api/src/routes/orders-driver.routes.js`: retain the legacy endpoint and mark it as compatibility/deprecation telemetry.
- `apps/api/src/routes/fulfillment/index.js` and `routes.js`: mount session endpoints under the authenticated fulfillment/driver scope and expose session-aware tracking reads.
- `apps/api/src/lib/socket.js`: add authorized run/order/tenant rooms and a location event helper; keep existing auth and fallback behavior.
- `apps/api/src/services/delivery-eta.service.js` and tracking payload helpers: consume session/latest telemetry without coupling to a routing vendor.
- `apps/api/src/jobs/driver-location-retention.job.js` and stale-GPS job: include session telemetry and diagnostic cleanup where applicable.
- `apps/web/src/hooks/useDriverLocationTracking.ts`: select a platform provider and preserve the browser provider behavior.
- `apps/web/src/lib/driverGpsTracking.ts`, API endpoints, driver header/page, and fulfillment tracking tab: expose health, queue, explicit start/stop, Socket.IO refresh, and polling fallback.
- `apps/web/src/components/maps/*`: keep Leaflet, add confirmed-location interpolation only in the map presentation layer.

## New files to create

- `apps/api/db/migrations/0194_driver_tracking_sessions.sql`
- `apps/api/src/services/driver-tracking-session.service.js`
- `apps/api/src/services/driver-tracking-session.service.test.js`
- `apps/api/src/routes/driver-tracking.routes.js`
- `apps/api/src/lib/driver-location-validation.js` and tests
- `apps/api/src/lib/driver-location-redis.js` and tests
- `apps/api/src/lib/routing-provider.js` and tests (Haversine adapter first)
- `apps/web/src/lib/driverLocationProvider.ts`, `webDriverLocationProvider.ts`, and tests
- Standalone Expo location provider in both mobile repositories; the ERP keeps its browser provider
- Android and iOS build configuration in their standalone repositories
- the mandated feature, runbook, release, and implementation report documents

## Database migration

Add a session table keyed by driver and route, a durable point table with client IDs and capture/receive timestamps, acceptance/rejection diagnostics, raw/display coordinates, network/battery/mock telemetry, and a unique `(session_id, client_point_id)` constraint. Add session lifecycle fields and indexes. Add a non-destructive compatibility path: existing ping rows remain readable and are not rewritten.

## API compatibility strategy

Keep `POST /api/orders/:id/location` operational. When sessions are enabled, the driver UI uses session endpoints; legacy callers continue to use the old service. Session start validates GPS flags, linked driver, tenant, assignment/route ownership, trackable statuses, and no active session. Batch ingestion validates each point, returns per-point results, is idempotent, and never lets one failed item reject valid items. All reads fall back to PostgreSQL if Redis is down.

## Frontend changes

Keep the ERP browser provider around the current `watchPosition` flow. The standalone Expo apps own native location access. The driver experience provides start/stop controls, current run/next stop/remaining stops, permission and connectivity diagnostics, last sync, and action guidance. Existing status and POD actions remain the business-logic source of truth.

## Standalone mobile changes

Maintain Android in `C:/myProjects/supplify-mobile` and iOS in `C:/myProjects/supplify-mobile-ios`. Both use Expo foreground location, permission diagnostics, and one active watcher while the app is open. Physical-device tests remain required for Maps, calls, permission, GPS, and network cases.

## Redis changes

Use existing `ioredis` cache infrastructure for best-effort keys `driver-location:session:{sessionId}`, `driver-location:driver:{driverId}`, and `driver-tracking-status:{driverId}` with `GPS_STALE_AFTER_SECONDS`-aligned TTL. PostgreSQL insertion is authoritative; Redis failure never rejects an accepted durable point. Socket.IO's existing Redis adapter remains the cross-replica event transport.

## Live events

Use authenticated Socket.IO rather than adding another realtime protocol. Room joins are server-authorized against tenant/order/route access. Emit confirmed `driver_location_updated`, `driver_tracking_status`, and session lifecycle events after durable acceptance. Client reconnection refetches the relevant board/tracking query; existing polling is retained as fallback. Synthetic interpolation is never persisted.

## Rollout flags

Preserve `GPS_TRACKING_ENABLED`, restaurant privacy flags, stale thresholds, and browser flags. Add `GPS_TRACKING_SESSIONS_ENABLED`, `GPS_OFFLINE_QUEUE_ENABLED`, `GPS_LIVE_EVENTS_ENABLED`, `GPS_GEOFENCE_ENABLED`, `GPS_MAX_ACCURACY_METERS`, `GPS_MAX_SPEED_KPH`, `GPS_BATCH_MAX_SIZE`, `GPS_MIN_SEND_INTERVAL_SECONDS`, `GPS_MIN_MOVEMENT_METERS`, and validated geofence thresholds. Defaults are conservative: sessions/events/native/geofences off until explicitly enabled; legacy browser tracking remains available.

## Testing strategy

Add unit tests for validation, geofence transitions, provider selection, queue ordering/idempotency, Redis fallback, session lifecycle, batch partial success, tenant/driver authorization, privacy, and socket room authorization. Preserve and rerun existing driver-location, route, ETA, dispatch, map, RBAC, and restaurant tracking tests. Document device-only Android verification.

## Migration and rollback

Deploy the additive migration first. Enable sessions/native/events per tenant or environment. Roll back flags to legacy browser/order endpoint if needed; keep old tables and APIs. Rollback code can stop consuming session writes while preserving accepted history. Do not drop columns/tables until deprecation metrics show no legacy traffic and historical access has been verified.

## Security and privacy

Authorize every session and point against the authenticated linked driver, supplier, route, and assignment. Validate schema, size, timestamp, ownership, rate, and batch count. Do not log coordinates or payloads. Continue restaurant sanitization and short-lived access expectations; never broadcast full routes or other restaurant/customer data.

## Performance

One stream per driver reduces multi-order writes. Batch uploads and Redis latest reads reduce database read/write pressure. Keep indexes on session, driver, supplier, route, and capture time. Recalculate ETA only on meaningful movement/status/stop changes; do not call an external route vendor per GPS ping. Keep polling fallback bounded.

## Delivery sequence

1. Add audit and plan (this document).
2. Add additive schema, validation, Redis helpers, provider abstraction, and focused tests.
3. Add session APIs and Socket.IO events while preserving legacy APIs.
4. Wire browser provider and driver diagnostics/start-stop UI.
5. Add standalone Expo Android/iOS tracking and document device verification.
6. Add supplier live-event refresh and retain polling fallback.
7. Add geofence assistance and routing abstraction behind flags.
8. Run tests, review security/privacy, deploy migration, and enable flags gradually.
