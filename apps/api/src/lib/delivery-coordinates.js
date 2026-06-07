import { ValidationError } from '../middlewares/errorHandler.js'

/**
 * Validate optional delivery destination coordinates.
 * Both null clears the location; both set validates range.
 */
export function validateDeliveryCoordinates(latitude, longitude) {
  const latMissing = latitude == null || latitude === ''
  const lngMissing = longitude == null || longitude === ''
  if (latMissing && lngMissing) {
    return { latitude: null, longitude: null }
  }
  if (latMissing !== lngMissing) {
    throw new ValidationError('latitude and longitude must both be set or both be cleared')
  }
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ValidationError('latitude and longitude must be valid numbers')
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ValidationError('latitude or longitude out of range')
  }
  if (lat === 0 && lng === 0) {
    throw new ValidationError('invalid coordinates')
  }
  return { latitude: lat, longitude: lng }
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Resolve order destination: branch coords first, then restaurant tenant fallback.
 */
export function resolveDestinationFromOrderRow(row) {
  if (!row) return null

  const branchLat = toNumberOrNull(row.branch_delivery_latitude)
  const branchLng = toNumberOrNull(row.branch_delivery_longitude)
  if (branchLat != null && branchLng != null) {
    return {
      latitude: branchLat,
      longitude: branchLng,
      label: row.branch_delivery_location_label || row.branch_name || null,
      source: 'branch',
    }
  }

  const restaurantLat = toNumberOrNull(row.restaurant_delivery_latitude)
  const restaurantLng = toNumberOrNull(row.restaurant_delivery_longitude)
  if (restaurantLat != null && restaurantLng != null) {
    return {
      latitude: restaurantLat,
      longitude: restaurantLng,
      label: row.restaurant_delivery_location_label || row.restaurant_name || null,
      source: 'restaurant',
    }
  }

  return null
}

export function buildDestinationPayload(destination, { includeCoordinates = false } = {}) {
  const coordinatesAvailable = Boolean(
    destination?.latitude != null && destination?.longitude != null
  )
  const payload = {
    coordinatesAvailable,
    label: coordinatesAvailable ? (destination?.label ?? null) : null,
  }
  if (includeCoordinates && coordinatesAvailable) {
    payload.latitude = destination.latitude
    payload.longitude = destination.longitude
  }
  return payload
}

/** ETA readiness: driver GPS + destination coordinates (ETA calculation is a follow-up). */
export function computeEtaReadiness(tracking, destination) {
  const destinationReady = Boolean(destination?.latitude != null && destination?.longitude != null)
  const driverReady = Boolean(tracking?.hasLocation && tracking?.latestLocation)
  return destinationReady && driverReady
}

export function mapDeliveryLocationRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? null,
    deliveryLatitude: toNumberOrNull(row.delivery_latitude),
    deliveryLongitude: toNumberOrNull(row.delivery_longitude),
    deliveryLocationLabel: row.delivery_location_label ?? null,
    deliveryAddressNotes: row.delivery_address_notes ?? null,
    coordinatesAvailable:
      toNumberOrNull(row.delivery_latitude) != null &&
      toNumberOrNull(row.delivery_longitude) != null,
  }
}
