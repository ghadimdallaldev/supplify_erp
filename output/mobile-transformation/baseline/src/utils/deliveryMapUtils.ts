export type MapPoint = { lat: number; lng: number }

export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  if (lat == null || lng == null) return false
  const la = Number(lat)
  const ln = Number(lng)
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0)
}

export function toMapPoint(lat: unknown, lng: unknown): MapPoint | null {
  return isValidCoord(lat, lng) ? { lat: Number(lat), lng: Number(lng) } : null
}

export const DEFAULT_CENTER: MapPoint = { lat: 33.8938, lng: 35.5018 }

export function fitViewToPoints(points: MapPoint[]): { center: MapPoint; delta: number } {
  if (!points.length) return { center: DEFAULT_CENTER, delta: 0.05 }
  if (points.length === 1) return { center: points[0], delta: 0.02 }
  let south = points[0].lat
  let north = points[0].lat
  let west = points[0].lng
  let east = points[0].lng
  for (const p of points) {
    south = Math.min(south, p.lat)
    north = Math.max(north, p.lat)
    west = Math.min(west, p.lng)
    east = Math.max(east, p.lng)
  }
  const latDelta = Math.max((north - south) * 1.4, 0.02)
  const lngDelta = Math.max((east - west) * 1.4, 0.02)
  return {
    center: { lat: (south + north) / 2, lng: (west + east) / 2 },
    delta: Math.max(latDelta, lngDelta),
  }
}

export function googleMapsSearchUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`
}

export function googleMapsSearchQuery(query: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`
}

export function pointsFromTracking(
  tracking?: { latestLocation?: { latitude: number; longitude: number } | null } | null,
  destLat?: unknown,
  destLng?: unknown
) {
  const driverPoint = tracking?.latestLocation
    ? toMapPoint(tracking.latestLocation.latitude, tracking.latestLocation.longitude)
    : null
  const destinationPoint = toMapPoint(destLat, destLng)
  return { driverPoint, destinationPoint }
}
