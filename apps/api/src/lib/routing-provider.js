import { haversineDistanceKm } from '../services/delivery-eta.service.js'

/** Routing abstraction. The Haversine provider is deliberately vendor-free. */
export class HaversineRoutingProvider {
  async computeRoute({ origin, destinations = [] }) {
    const points = [origin, ...destinations].filter(Boolean)
    let distanceKm = 0
    for (let index = 1; index < points.length; index += 1) {
      distanceKm += haversineDistanceKm(
        points[index - 1].latitude,
        points[index - 1].longitude,
        points[index].latitude,
        points[index].longitude
      )
    }
    return {
      provider: 'haversine',
      distanceKm,
      durationSeconds: Math.round((distanceKm / 20) * 3600),
      trafficAware: false,
      polyline: null,
      calculatedAt: new Date().toISOString(),
    }
  }

  async computeRouteMatrix({ origins = [], destinations = [] }) {
    return {
      provider: 'haversine',
      matrix: origins.map((origin) =>
        destinations.map((destination) => ({
          distanceKm: haversineDistanceKm(
            origin.latitude,
            origin.longitude,
            destination.latitude,
            destination.longitude
          ),
        }))
      ),
      calculatedAt: new Date().toISOString(),
    }
  }
}

export function getRoutingProvider() {
  return new HaversineRoutingProvider()
}
