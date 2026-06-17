import { ValidationError } from '../middlewares/errorHandler.js'
import { getDeliveryRoute, reorderRouteStops } from './delivery-routes.service.js'
import { query } from '../lib/db.js'

const FIXED_STATUSES = new Set(['DELIVERED', 'FAILED'])

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Nearest-neighbor stop ordering from depot (fallback when Mapbox unavailable).
 */
export function optimizeStopOrderNearestNeighbor(stops, depot) {
  const sorted = [...stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  const movable = sorted.filter((s) => !FIXED_STATUSES.has(s.status))
  const withCoords = movable.filter(
    (s) => s.destinationLatitude != null && s.destinationLongitude != null
  )
  const withoutCoords = movable.filter(
    (s) => s.destinationLatitude == null || s.destinationLongitude == null
  )

  if (withCoords.length < 2) {
    return sorted.map((s) => s.id)
  }

  let lat = depot?.lat ?? withCoords[0].destinationLatitude
  let lng = depot?.lng ?? withCoords[0].destinationLongitude

  const remaining = [...withCoords]
  const optimizedMovable = []

  while (remaining.length) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]
      const d = haversineKm(lat, lng, s.destinationLatitude, s.destinationLongitude)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]
    optimizedMovable.push(next)
    lat = next.destinationLatitude
    lng = next.destinationLongitude
  }

  const movableQueue = [...optimizedMovable, ...withoutCoords].map((s) => s.id)
  let ptr = 0
  return sorted.map((stop) => {
    if (FIXED_STATUSES.has(stop.status)) return stop.id
    return movableQueue[ptr++]
  })
}

async function getSupplierDepot(supplierId) {
  const { rows } = await query(
    `
    SELECT w.latitude, w.longitude
    FROM warehouse w
    WHERE w.supplier_id = $1 AND w.is_active = true
    ORDER BY w.is_default DESC NULLS LAST, w.created_at ASC
    LIMIT 1
    `,
    [supplierId]
  )
  const row = rows[0]
  if (row?.latitude != null && row?.longitude != null) {
    return { lat: Number(row.latitude), lng: Number(row.longitude) }
  }
  return null
}

/**
 * Preview or apply optimized stop order for a delivery route.
 */
export async function optimizeDeliveryRoute(supplierId, routeId, { apply = false } = {}) {
  const route = await getDeliveryRoute(supplierId, routeId)
  if (!route.stops?.length) {
    throw new ValidationError('Route has no stops to optimize')
  }

  const movable = route.stops.filter((s) => !FIXED_STATUSES.has(s.status))
  const geocoded = movable.filter((s) => s.destinationCoordinatesAvailable)
  if (geocoded.length < 2) {
    throw new ValidationError(
      'At least two stops need delivery coordinates. Add restaurant addresses with lat/lng.'
    )
  }

  const depot = await getSupplierDepot(supplierId)
  const proposedStopIds = optimizeStopOrderNearestNeighbor(route.stops, depot)

  let estimatedKm = 0
  let prev = depot
  for (const stopId of proposedStopIds) {
    const stop = route.stops.find((s) => s.id === stopId)
    if (!stop?.destinationCoordinatesAvailable) continue
    const lat = stop.destinationLatitude
    const lng = stop.destinationLongitude
    if (prev) {
      estimatedKm += haversineKm(prev.lat, prev.lng, lat, lng)
    }
    prev = { lat, lng }
  }

  const preview = {
    routeId,
    method: 'nearest_neighbor',
    proposedStopIds,
    estimatedDistanceKm: Math.round(estimatedKm * 10) / 10,
    stopCount: route.stops.length,
  }

  if (!apply) {
    return { preview, route: null }
  }

  const updatedRoute = await reorderRouteStops(supplierId, routeId, proposedStopIds)
  return { preview, route: updatedRoute }
}
