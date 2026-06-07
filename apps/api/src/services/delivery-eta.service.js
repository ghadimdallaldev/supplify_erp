import { config } from '../config/env.js'
import { query } from '../lib/db.js'

const ETA_ACTIVE_ASSIGNMENT_STATUSES = new Set(['picked_up', 'out_for_delivery'])
const TERMINAL_DELIVERY_STATUSES = new Set(['delivered', 'failed', 'cancelled'])
const TERMINAL_ORDER_STATUSES = new Set(['CANCELLED'])

function roundDistanceKm(km) {
  return Math.round(km * 10) / 10
}

function roundMinutes(value) {
  return Math.max(1, Math.round(value))
}

/**
 * Great-circle distance in km, rounded to 1 decimal place.
 */
export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const km = 6371 * c
  return roundDistanceKm(km)
}

export function getDeliveryEtaConfig() {
  return {
    speedKmh: config.DELIVERY_ETA_CITY_SPEED_KMH ?? 20,
    minMultiplier: config.DELIVERY_ETA_MIN_MULTIPLIER ?? 1.0,
    maxMultiplier: config.DELIVERY_ETA_MAX_MULTIPLIER ?? 1.5,
    serviceTimeMinutes: config.DELIVERY_ETA_SERVICE_TIME_MINUTES ?? 5,
  }
}

const FIXED_ROUTE_STOP_STATUSES = new Set(['COMPLETED', 'FAILED'])

/**
 * Build route-aware ETA context from ordered route stops (DB status values).
 * Returns null when the order is not on an active route.
 */
export function buildRouteEtaContext(routeStops, targetOrderId) {
  if (!Array.isArray(routeStops) || !routeStops.length || !targetOrderId) return null

  const ordered = [...routeStops].sort(
    (a, b) =>
      (a.sequence_number ?? a.sequenceNumber ?? 0) - (b.sequence_number ?? b.sequenceNumber ?? 0)
  )
  const active = ordered.filter((s) => !FIXED_ROUTE_STOP_STATUSES.has(s.status))
  const targetIdx = active.findIndex(
    (s) => s.order_id === targetOrderId || s.orderId === targetOrderId
  )
  if (targetIdx < 0) return null

  const priorStops = active.slice(0, targetIdx).map((s) => ({
    orderId: s.order_id ?? s.orderId,
    latitude: s.latitude ?? s.destinationLatitude ?? null,
    longitude: s.longitude ?? s.destinationLongitude ?? null,
  }))

  const positionInRoute = ordered.findIndex(
    (s) => s.order_id === targetOrderId || s.orderId === targetOrderId
  )

  return {
    priorStops,
    stopsBefore: targetIdx,
    nextStop: targetIdx === 0,
    routePosition: positionInRoute >= 0 ? positionInRoute + 1 : null,
    routePositionTotal: ordered.length,
  }
}

/** Ordered route stops with coordinates for route-aware ETA (avoids circular imports). */
export async function loadRouteStopsForEta(orderId, supplierId) {
  const { rows } = await query(
    `
    SELECT
      rs.order_id,
      rs.sequence_number,
      rs.status,
      COALESCE(b.delivery_latitude, r.delivery_latitude) AS latitude,
      COALESCE(b.delivery_longitude, r.delivery_longitude) AS longitude
    FROM route_stop rs
    JOIN delivery_route dr ON dr.id = rs.route_id
    JOIN customer_order o ON o.id = rs.order_id
    JOIN restaurant r ON r.id = o.restaurant_id
    LEFT JOIN branch b ON b.id = o.branch_id
    WHERE dr.id = (
      SELECT dr2.id
      FROM route_stop rs2
      JOIN delivery_route dr2 ON dr2.id = rs2.route_id
      WHERE rs2.order_id = $1
        AND dr2.supplier_id = $2
        AND dr2.status IN ('PLANNED', 'IN_PROGRESS')
      LIMIT 1
    )
    ORDER BY rs.sequence_number ASC
    `,
    [orderId, supplierId]
  )
  return rows
}

function unavailable(reason) {
  return {
    etaAvailable: false,
    etaMinutesMin: null,
    etaMinutesMax: null,
    distanceKm: null,
    confidence: null,
    calculatedAt: null,
    unavailableReason: reason,
  }
}

/**
 * Compute supplier-side ETA from driver GPS, destination, and delivery state.
 */
export function calculateDeliveryEta({
  tracking = null,
  destination = null,
  assignmentStatus = null,
  orderStatus = null,
  etaConfig = null,
  routeContext = null,
} = {}) {
  const deliveryStatus = String(assignmentStatus || 'pending').toLowerCase()
  const normalizedOrderStatus = String(orderStatus || '').toUpperCase()

  if (TERMINAL_ORDER_STATUSES.has(normalizedOrderStatus)) {
    return unavailable('order_terminal')
  }
  if (TERMINAL_DELIVERY_STATUSES.has(deliveryStatus)) {
    return unavailable('order_terminal')
  }
  if (!ETA_ACTIVE_ASSIGNMENT_STATUSES.has(deliveryStatus)) {
    return unavailable('assignment_not_active')
  }
  if (destination?.latitude == null || destination?.longitude == null) {
    return unavailable('destination_missing')
  }

  const loc = tracking?.latestLocation
  if (!tracking?.hasLocation || loc?.latitude == null || loc?.longitude == null) {
    return unavailable('driver_location_missing')
  }

  const { speedKmh, minMultiplier, maxMultiplier, serviceTimeMinutes } =
    etaConfig ?? getDeliveryEtaConfig()

  let fromLat = Number(loc.latitude)
  let fromLng = Number(loc.longitude)
  let distanceKm = 0
  let serviceMinutes = 0

  const priorStops = routeContext?.priorStops ?? []
  for (const stop of priorStops) {
    if (stop?.latitude == null || stop?.longitude == null) continue
    distanceKm += haversineDistanceKm(
      fromLat,
      fromLng,
      Number(stop.latitude),
      Number(stop.longitude)
    )
    fromLat = Number(stop.latitude)
    fromLng = Number(stop.longitude)
    serviceMinutes += serviceTimeMinutes
  }

  distanceKm += haversineDistanceKm(
    fromLat,
    fromLng,
    Number(destination.latitude),
    Number(destination.longitude)
  )

  const baseMinutes = (distanceKm / speedKmh) * 60 + serviceMinutes
  const etaMinutesMin = roundMinutes(baseMinutes * minMultiplier)
  const etaMinutesMax = roundMinutes(baseMinutes * maxMultiplier)

  const hasRouteContext = routeContext != null
  const stopsBefore = hasRouteContext ? (routeContext.stopsBefore ?? 0) : 0
  const nextStop = hasRouteContext ? Boolean(routeContext.nextStop) : true

  return {
    etaAvailable: true,
    etaMinutesMin,
    etaMinutesMax: Math.max(etaMinutesMin, etaMinutesMax),
    distanceKm: roundDistanceKm(distanceKm),
    confidence: tracking?.isStale ? 'LOW' : 'MEDIUM',
    calculatedAt: new Date().toISOString(),
    unavailableReason: null,
    stopsBefore,
    nextStop,
    routePosition: routeContext?.routePosition ?? null,
    routePositionTotal: routeContext?.routePositionTotal ?? null,
  }
}

/** Restaurant tracking — no internal reason codes or confidence. */
export function sanitizeEtaForRestaurant(eta) {
  if (!eta) {
    return {
      etaAvailable: false,
      etaMinutesMin: null,
      etaMinutesMax: null,
      distanceKm: null,
      calculatedAt: null,
    }
  }
  const sanitized = {
    etaAvailable: Boolean(eta.etaAvailable),
    etaMinutesMin: eta.etaMinutesMin ?? null,
    etaMinutesMax: eta.etaMinutesMax ?? null,
    distanceKm: eta.distanceKm ?? null,
    calculatedAt: eta.calculatedAt ?? null,
  }
  if (eta.stopsBefore != null) sanitized.stopsBefore = eta.stopsBefore
  if (eta.nextStop != null) sanitized.nextStop = eta.nextStop
  return sanitized
}
