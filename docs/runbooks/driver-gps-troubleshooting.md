# Driver GPS troubleshooting

## No tracking session

- Confirm `GPS_TRACKING_SESSIONS_ENABLED=true` and `GPS_TRACKING_ENABLED=true`.
- Confirm the driver is linked to the supplier and has an active assignment.
- Confirm the route is `PLANNED` or `IN_PROGRESS`.
- Inspect the API response diagnostic code and server logs.

## Points rejected

Check the point timestamp, coordinate range, accuracy, speed, heading, and client point ID. A phone with poor indoor GPS may be accepted as low accuracy but will not automatically overwrite a recent, better point.

## Map is stale

Confirm `GPS_LIVE_EVENTS_ENABLED=true` for Socket.IO updates. The fulfillment tracking view retains polling fallback. Check Redis availability, then query `driver_latest_location`; PostgreSQL is authoritative when Redis is unavailable.

## Android does not continue in background

Verify location permission, notification permission on Android 13+, battery-optimization exclusions, the foreground notification, and that the app was built from `apps/web/android` after `cap sync android`. Test on a physical device; an emulator alone is insufficient for release sign-off.

## Privacy and safety

Do not expose driver coordinates to unrelated restaurants or customers. Stop the session when delivery work ends, and use the retention job for historical ping cleanup.
