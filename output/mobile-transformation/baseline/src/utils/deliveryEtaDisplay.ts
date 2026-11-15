import type { RestaurantOrderTrackingResponse, SupplierOrderTrackingResponse } from '../types/supplify'
import { isRestaurantOrderTracking } from '../types/supplify'

export function formatEtaRange(min?: number | null, max?: number | null): string | null {
  if (min == null || max == null) return null
  if (min === max) return `${min} min`
  return `${min}–${max} min`
}

export function formatEtaMinutesRange(min?: number | null, max?: number | null): string | null {
  if (min == null || max == null) return null
  if (min === max) return `${min} minute`
  return `${min}–${max} minutes`
}

export function formatDistanceKm(km?: number | null): string | null {
  if (km == null) return null
  return `${km.toFixed(1)} km away`
}

export function getRestaurantEtaPrimaryText(data: RestaurantOrderTrackingResponse | undefined): string | null {
  if (!data?.etaAvailable) return null
  const minutes = formatEtaMinutesRange(data.etaMinutesMin, data.etaMinutesMax)
  if (!minutes) return null
  if (data.nextStop === false && (data.stopsBefore ?? 0) > 0) {
    const n = data.stopsBefore ?? 0
    const stopWord = n === 1 ? 'stop' : 'stops'
    return `Your delivery is planned after ${n} ${stopWord}`
  }
  return `Arriving in about ${minutes}`
}

export function getRestaurantEtaSecondaryText(data: RestaurantOrderTrackingResponse | undefined): string | null {
  if (!data?.etaAvailable) return null
  if (data.nextStop === false && (data.stopsBefore ?? 0) > 0) {
    const minutes = formatEtaMinutesRange(data.etaMinutesMin, data.etaMinutesMax)
    if (minutes) return `Estimated arrival: ${minutes}`
  }
  return formatDistanceKm(data.distanceKm)
}

export function getSupplierEtaPrimaryText(data: SupplierOrderTrackingResponse | undefined): string | null {
  if (!data?.etaAvailable) return null
  const range = formatEtaRange(data.etaMinutesMin, data.etaMinutesMax)
  if (!range) return null
  return `ETA ${range}`
}

export function getSupplierEtaSecondaryText(data: SupplierOrderTrackingResponse | undefined): string | null {
  if (!data?.etaAvailable) return null
  const parts: string[] = []
  if ((data.stopsBefore ?? 0) > 0) {
    const n = data.stopsBefore ?? 0
    parts.push(`${n} ${n === 1 ? 'stop' : 'stops'} before this order`)
  }
  if (data.routePosition != null && data.routePositionTotal != null) {
    parts.push(`Route position ${data.routePosition} of ${data.routePositionTotal}`)
  }
  const distance = data.distanceKm != null ? `Distance ${data.distanceKm.toFixed(1)} km` : null
  if (distance) parts.push(distance)
  return parts.length ? parts.join(' · ') : null
}

export function isDestinationMissingEtaUnavailable(
  data: RestaurantOrderTrackingResponse | SupplierOrderTrackingResponse | undefined
): boolean {
  if (!data?.trackingEnabled) return false
  const deliveryStatus = isRestaurantOrderTracking(data)
    ? data.delivery?.status
    : data.assignment?.status
  if (deliveryStatus === 'delivered' || deliveryStatus === 'failed') return false
  return data.destinationCoordinatesAvailable === false
}

export function getEtaUnavailableMessage(
  data: RestaurantOrderTrackingResponse | SupplierOrderTrackingResponse | undefined
): string | null {
  if (!data?.trackingEnabled) return null
  const deliveryStatus = isRestaurantOrderTracking(data)
    ? data.delivery?.status
    : data.assignment?.status
  if (deliveryStatus === 'delivered' || deliveryStatus === 'failed') return null
  if (data.destinationCoordinatesAvailable === false) {
    return 'ETA unavailable — delivery location not set'
  }
  if (!data.etaAvailable) return 'ETA will appear when the driver is on the way'
  return null
}

export function getGpsStatusLabel(tracking: import('../types/supplify').DeliveryTrackingInfo | null | undefined): string {
  if (!tracking?.enabled) return 'Tracking not active'
  if (!tracking.hasLocation) return 'Waiting for driver location'
  if (tracking.isStale) return 'Location may be outdated'
  return 'Driver location updating'
}
