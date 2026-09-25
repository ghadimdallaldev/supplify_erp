import { ValidationError } from '../middlewares/errorHandler.js'

const ZONE_TYPES = new Set(['polygon', 'radius', 'postal_codes'])

function postalCodesOf(value) {
  if (Array.isArray(value)) {
    return value.map((code) => String(code).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Coverage fields for a warehouse delivery zone.
 * Returns null when the request does not change how the zone matches.
 * A postal zone clears radius fields, and a radius zone clears postal codes,
 * so a later edit cannot flip the match type from leftover columns.
 */
export function normalizeZoneCoverage(body = {}) {
  const zoneType = body.zone_type
  const touchesCoverage =
    zoneType != null ||
    body.postal_codes != null ||
    body.radius_km != null ||
    body.center_lat != null ||
    body.center_lng != null ||
    body.geometry != null ||
    body.coverage_area_json != null
  if (!touchesCoverage) return null

  if (!ZONE_TYPES.has(zoneType)) {
    throw new ValidationError('zone_type must be polygon, radius, or postal_codes')
  }

  if (zoneType === 'radius') {
    const radiusKm = Number(body.radius_km)
    const centerLat = Number(body.center_lat)
    const centerLng = Number(body.center_lng)
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new ValidationError('Radius zones need a radius in kilometers')
    }
    if (
      !Number.isFinite(centerLat) ||
      centerLat < -90 ||
      centerLat > 90 ||
      !Number.isFinite(centerLng) ||
      centerLng < -180 ||
      centerLng > 180
    ) {
      throw new ValidationError('Radius zones need a center latitude and longitude')
    }
    return {
      zone_type: 'radius',
      postal_codes: null,
      radius_km: radiusKm,
      center_lat: centerLat,
      center_lng: centerLng,
      geometry: null,
      coverage_area_json: null,
    }
  }

  if (zoneType === 'postal_codes') {
    const postalCodes = postalCodesOf(body.postal_codes)
    if (!postalCodes.length) {
      throw new ValidationError('Postal zones need at least one postal code')
    }
    return {
      zone_type: 'postal_codes',
      postal_codes: postalCodes,
      radius_km: null,
      center_lat: null,
      center_lng: null,
      geometry: null,
      coverage_area_json: null,
    }
  }

  return {
    zone_type: 'polygon',
    postal_codes: null,
    radius_km: null,
    center_lat: null,
    center_lng: null,
    geometry: body.geometry ?? null,
    coverage_area_json: body.coverage_area_json ?? body.geometry ?? null,
  }
}
