/** Shared helpers for delivery tracking maps (Leaflet). */

export type MapPoint = {
  lat: number
  lng: number
}

export function isValidCoord(lat: unknown, lng: unknown): lat is number {
  if (lat == null || lng == null) return false
  const la = Number(lat)
  const ln = Number(lng)
  return Number.isFinite(la) && Number.isFinite(ln) && !(la === 0 && ln === 0)
}

export function toMapPoint(lat: unknown, lng: unknown): MapPoint | null {
  return isValidCoord(lat, lng) ? { lat: Number(lat), lng: Number(lng) } : null
}

const DEFAULT_CENTER: MapPoint = { lat: 33.8938, lng: 35.5018 }
const DEFAULT_ZOOM = 13
const SINGLE_ZOOM = 14
const MAX_FIT_ZOOM = 16

/** Compute center + zoom to fit all points with padding. */
export function fitViewToPoints(points: MapPoint[]): { center: MapPoint; zoom: number } {
  if (!points.length) {
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM }
  }
  if (points.length === 1) {
    return { center: points[0], zoom: SINGLE_ZOOM }
  }

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

  return {
    center: { lat: (south + north) / 2, lng: (west + east) / 2 },
    zoom: MAX_FIT_ZOOM,
  }
}

export function osmTileUrl(): string {
  return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
}

export function googleMapsSearchUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`
}

export { DEFAULT_CENTER, DEFAULT_ZOOM, MAX_FIT_ZOOM, SINGLE_ZOOM }
