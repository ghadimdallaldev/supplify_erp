/**
 * Driver GPS pings (one POST per active order every ~15s) must not consume the shared per-IP
 * rate-limit budget, or a driver with a few active orders is locked out of completing deliveries.
 * They keep their own dedicated limiter plus the per-driver check in driver-location.service.js.
 */
const DRIVER_LOCATION_PING_PATH = /^\/api\/orders\/[0-9a-f-]{36}\/location\/?$/i

export function isDriverLocationPing(req) {
  return (
    req.method === 'POST' &&
    DRIVER_LOCATION_PING_PATH.test((req.originalUrl || req.url || '').split('?')[0])
  )
}
