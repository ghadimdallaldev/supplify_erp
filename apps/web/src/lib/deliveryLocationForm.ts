export type DeliveryLocationForm = {
  deliveryLatitude: string
  deliveryLongitude: string
  deliveryLocationLabel: string
  deliveryAddressNotes: string
}

export type DeliveryLocationPayload = {
  deliveryLatitude?: number | null
  deliveryLongitude?: number | null
  deliveryLocationLabel: string | null
  deliveryAddressNotes: string | null
}

export function emptyDeliveryLocationForm(): DeliveryLocationForm {
  return {
    deliveryLatitude: '',
    deliveryLongitude: '',
    deliveryLocationLabel: '',
    deliveryAddressNotes: '',
  }
}

/** Normalize a single coordinate token (supports comma decimals). */
export function parseCoordinateInput(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/**
 * Split "lat, lng" pasted into one field (common from Google Maps).
 */
export function splitCoordinatePair(raw: string): { lat: string; lng: string } | null {
  const parts = raw
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length !== 2) return null
  const lat = parseCoordinateInput(parts[0])
  const lng = parseCoordinateInput(parts[1])
  if (lat == null || lng == null) return null
  return { lat: String(lat), lng: String(lng) }
}

export function formFromDeliveryLocation(
  location?: {
    deliveryLatitude?: number | null
    deliveryLongitude?: number | null
    deliveryLocationLabel?: string | null
    deliveryAddressNotes?: string | null
  } | null
): DeliveryLocationForm {
  if (!location) return emptyDeliveryLocationForm()
  return {
    deliveryLatitude: location.deliveryLatitude != null ? String(location.deliveryLatitude) : '',
    deliveryLongitude: location.deliveryLongitude != null ? String(location.deliveryLongitude) : '',
    deliveryLocationLabel: location.deliveryLocationLabel ?? '',
    deliveryAddressNotes: location.deliveryAddressNotes ?? '',
  }
}

/**
 * Build PATCH payload. Omits coordinate fields when both inputs are empty so
 * label-only saves do not clear stored GPS coordinates.
 */
export function buildDeliveryLocationPayload(
  form: DeliveryLocationForm,
  { clearCoordinates = false }: { clearCoordinates?: boolean } = {}
): DeliveryLocationPayload {
  const payload: DeliveryLocationPayload = {
    deliveryLocationLabel: form.deliveryLocationLabel.trim() || null,
    deliveryAddressNotes: form.deliveryAddressNotes.trim() || null,
  }

  const latRaw = form.deliveryLatitude.trim()
  const lngRaw = form.deliveryLongitude.trim()

  if (clearCoordinates || latRaw || lngRaw) {
    payload.deliveryLatitude = latRaw ? parseCoordinateInput(latRaw) : null
    payload.deliveryLongitude = lngRaw ? parseCoordinateInput(lngRaw) : null
  }

  return payload
}

export function validateDeliveryLocationForm(form: DeliveryLocationForm): string | null {
  const latRaw = form.deliveryLatitude.trim()
  const lngRaw = form.deliveryLongitude.trim()
  if (!latRaw && !lngRaw) return null
  if (!latRaw || !lngRaw) {
    return 'Enter both latitude and longitude, or leave both empty.'
  }
  const lat = parseCoordinateInput(latRaw)
  const lng = parseCoordinateInput(lngRaw)
  if (lat == null || lng == null) {
    return 'Latitude and longitude must be valid numbers.'
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return 'Latitude or longitude is out of range.'
  }
  if (lat === 0 && lng === 0) {
    return 'Invalid coordinates.'
  }
  return null
}
