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

function parseSnapshot(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function destinationFromSnapshot(snapshot) {
  const value = parseSnapshot(snapshot)
  if (!value || typeof value !== 'object') return null
  const latitude = toNumberOrNull(value.latitude ?? value.deliveryLatitude)
  const longitude = toNumberOrNull(value.longitude ?? value.deliveryLongitude)
  const label = value.label || value.name || value.address?.label || null
  const address = value.address ?? value.addressNotes ?? null
  if (latitude == null || longitude == null) {
    return label || address
      ? { latitude: null, longitude: null, label, address, source: 'snapshot' }
      : null
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  if (latitude === 0 && longitude === 0) return null
  return {
    latitude,
    longitude,
    label,
    address,
    source: 'snapshot',
    snapshotId: value.id ?? null,
    snapshotType: value.type ?? null,
    addressNotes: value.addressNotes ?? value.address_notes ?? null,
  }
}

/** Resolve order destination using the immutable order snapshot, then branch, then restaurant. */
export function resolveDestinationFromOrderRow(row) {
  if (!row) return null
  const snapshot = destinationFromSnapshot(row.delivery_location_snapshot)
  if (snapshot) return snapshot

  const branchLat = toNumberOrNull(row.branch_delivery_latitude)
  const branchLng = toNumberOrNull(row.branch_delivery_longitude)
  const branchHasMetadata = Boolean(
    row.branch_delivery_location_label || row.branch_name || row.branch_address
  )
  if ((branchLat != null && branchLng != null) || branchHasMetadata) {
    return {
      latitude: branchLat,
      longitude: branchLng,
      label: row.branch_delivery_location_label || row.branch_name || null,
      address: row.branch_address || null,
      source: 'branch',
    }
  }

  const restaurantLat = toNumberOrNull(row.restaurant_delivery_latitude)
  const restaurantLng = toNumberOrNull(row.restaurant_delivery_longitude)
  const restaurantHasMetadata = Boolean(
    row.restaurant_delivery_location_label || row.restaurant_name || row.restaurant_address
  )
  if ((restaurantLat != null && restaurantLng != null) || restaurantHasMetadata) {
    return {
      latitude: restaurantLat,
      longitude: restaurantLng,
      label: row.restaurant_delivery_location_label || row.restaurant_name || null,
      address: row.restaurant_address || null,
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
    label: destination?.label ?? null,
    address: destination?.address ?? null,
    source: destination?.source ?? null,
  }
  if (includeCoordinates && coordinatesAvailable) {
    payload.latitude = destination.latitude
    payload.longitude = destination.longitude
  }
  return payload
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
