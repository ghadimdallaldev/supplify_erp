# Driver live tracking

## Scope

Supplify keeps `delivery_route` and `route_stop` as the dispatch model. A driver tracking session belongs to one supplier, driver, and optional route; each accepted point is also retained in `driver_location_ping` and the current position is upserted into `driver_latest_location`.

The session API is disabled by default. Enable `GPS_TRACKING_SESSIONS_ENABLED=true` only after the migration is applied. `GPS_LIVE_EVENTS_ENABLED=true` enables Socket.IO updates; PostgreSQL polling remains the fallback.

## Driver flow

1. Start `POST /api/driver/tracking-sessions` from an assigned driver account.
2. Send points to `POST /api/driver/tracking-sessions/:sessionId/locations` or batch them at `/locations/batch`.
3. Send a heartbeat when no location point is available.
4. Stop with `POST /api/driver/tracking-sessions/:sessionId/stop` when the run ends.

Points are checked for coordinate range, timestamp skew, accuracy, speed, heading, duplicate client IDs, and impossible movement. Rejected points are recorded with a diagnostic code where possible; they do not replace the latest valid location.

## Client providers

The ERP web/PWA uses browser geolocation. Android and iOS use the standalone Expo repositories and foreground location while the app is active. The retired Capacitor WebView bridge is no longer part of the ERP.

## Configuration

See `apps/api/src/config/env.js` for server defaults and the deployment environment for overrides. Important controls include `GPS_MAX_ACCURACY_METERS`, `GPS_MAX_SPEED_KPH`, `GPS_BATCH_MAX_SIZE`, `GPS_MIN_SEND_INTERVAL_SECONDS`, and the `GPS_*_ENABLED` flags.

## Compatibility

The legacy `POST /api/orders/:id/location` endpoint remains available. Existing status transitions, supplier/restaurant visibility rules, Leaflet maps, and route/stop records are unchanged.
