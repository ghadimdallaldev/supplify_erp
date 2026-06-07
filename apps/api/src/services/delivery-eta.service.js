import { config } from '../config/env.js'

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
  }
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

  const { speedKmh, minMultiplier, maxMultiplier } = etaConfig ?? getDeliveryEtaConfig()
  const distanceKm = haversineDistanceKm(
    Number(loc.latitude),
    Number(loc.longitude),
    Number(destination.latitude),
    Number(destination.longitude)
  )

  const baseMinutes = (distanceKm / speedKmh) * 60
  const etaMinutesMin = roundMinutes(baseMinutes * minMultiplier)
  const etaMinutesMax = roundMinutes(baseMinutes * maxMultiplier)

  return {
    etaAvailable: true,
    etaMinutesMin,
    etaMinutesMax: Math.max(etaMinutesMin, etaMinutesMax),
    distanceKm,
    confidence: tracking?.isStale ? 'LOW' : 'MEDIUM',
    calculatedAt: new Date().toISOString(),
    unavailableReason: null,
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
  return {
    etaAvailable: Boolean(eta.etaAvailable),
    etaMinutesMin: eta.etaMinutesMin ?? null,
    etaMinutesMax: eta.etaMinutesMax ?? null,
    distanceKm: eta.distanceKm ?? null,
    calculatedAt: eta.calculatedAt ?? null,
  }
}
