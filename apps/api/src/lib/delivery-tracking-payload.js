import { config } from '../config/env.js'

export function isGpsTrackingEnabled() {
  return config.GPS_TRACKING_ENABLED
}

export function formatLastUpdatedLabel(recordedAt) {
  if (!recordedAt) return null
  const ms = Date.now() - new Date(recordedAt).getTime()
  if (ms < 60_000) return 'just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function getGpsStaleAfterSeconds() {
  return config.GPS_STALE_AFTER_SECONDS ?? 300
}

function mapLatestLocation(loc) {
  if (!loc) return null
  const recordedAt = loc.recordedAt ?? loc.recorded_at
  return {
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude),
    accuracyMeters:
      loc.accuracyMeters != null
        ? loc.accuracyMeters
        : loc.accuracy_meters != null
          ? Number(loc.accuracy_meters)
          : null,
    speedMps:
      loc.speedMps != null ? loc.speedMps : loc.speed_mps != null ? Number(loc.speed_mps) : null,
    headingDegrees:
      loc.headingDegrees != null
        ? loc.headingDegrees
        : loc.heading_degrees != null
          ? Number(loc.heading_degrees)
          : null,
    recordedAt,
  }
}

function isLocationStale(recordedAt, staleAfterSeconds) {
  if (!recordedAt) return false
  const ageMs = Date.now() - new Date(recordedAt).getTime()
  return ageMs > staleAfterSeconds * 1000
}

/**
 * Resolve location for an order: prefer ping tied to this order_id, else driver latest when allowed.
 */
export function resolveLocationForOrder(locationRow, orderId, { allowDriverFallback = true } = {}) {
  if (!locationRow) return null
  if (locationRow.orderId === orderId || locationRow.order_id === orderId) {
    return mapLatestLocation(locationRow)
  }
  if (allowDriverFallback) {
    return mapLatestLocation(locationRow)
  }
  return null
}

/**
 * Standard tracking payload for supplier dispatch/board/detail APIs.
 */
export function buildTrackingPayload({
  enabled = null,
  latestLocation = null,
  orderId = null,
  locationRow = null,
  allowDriverFallback = true,
  staleAfterSeconds = null,
}) {
  const trackingEnabled = enabled ?? isGpsTrackingEnabled()
  const staleSec = staleAfterSeconds ?? getGpsStaleAfterSeconds()

  if (!trackingEnabled) {
    return {
      enabled: false,
      hasLocation: false,
      lastSeenAt: null,
      isStale: false,
      staleAfterSeconds: staleSec,
      latestLocation: null,
      lastUpdatedLabel: null,
    }
  }

  let loc = latestLocation ? mapLatestLocation(latestLocation) : null
  if (!loc && locationRow) {
    loc = orderId
      ? resolveLocationForOrder(locationRow, orderId, { allowDriverFallback })
      : mapLatestLocation(locationRow)
  }

  const hasLocation = Boolean(loc?.latitude != null && loc?.longitude != null)
  const lastSeenAt = loc?.recordedAt ?? null
  const isStale = hasLocation && isLocationStale(lastSeenAt, staleSec)

  return {
    enabled: true,
    hasLocation,
    lastSeenAt,
    isStale,
    staleAfterSeconds: staleSec,
    latestLocation: hasLocation ? loc : null,
    lastUpdatedLabel: formatLastUpdatedLabel(lastSeenAt),
  }
}

/** @deprecated Use buildTrackingPayload — alias for dispatch cards */
export function buildDriverLastSeenAlias(tracking) {
  if (!tracking?.enabled) return null
  if (!tracking.hasLocation && !tracking.lastSeenAt) return null
  return {
    recordedAt: tracking.lastSeenAt,
    lastUpdatedLabel: tracking.lastUpdatedLabel,
    latitude: tracking.latestLocation?.latitude,
    longitude: tracking.latestLocation?.longitude,
    isStale: tracking.isStale,
  }
}
