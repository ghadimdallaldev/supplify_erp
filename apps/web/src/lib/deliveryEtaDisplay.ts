import type { RestaurantOrderTrackingResponse, SupplierOrderTrackingResponse } from '../types'
import { isRestaurantOrderTracking } from '../types'

export function formatEtaRange(min?: number | null, max?: number | null): string | null {
  if (min == null || max == null) return null
  if (min === max) return `${min} min`
  return `${min}–${max} min`
}

export function formatDistanceKm(km?: number | null): string | null {
  if (km == null) return null
  return `${km.toFixed(1)} km away`
}

export function getRestaurantEtaPrimaryText(
  data: RestaurantOrderTrackingResponse | undefined
): string | null {
  if (!data?.etaAvailable) return null
  const range = formatEtaRange(data.etaMinutesMin, data.etaMinutesMax)
  if (!range) return null
  return `Arriving in about ${range.replace(' min', ' minutes')}`
}

export function getSupplierEtaPrimaryText(
  data: SupplierOrderTrackingResponse | undefined
): string | null {
  if (!data?.etaAvailable) return null
  const range = formatEtaRange(data.etaMinutesMin, data.etaMinutesMax)
  if (!range) return null
  return `ETA ${range}`
}

function isPreActiveDeliveryStatus(status: string | null | undefined): boolean {
  const s = String(status || 'pending').toLowerCase()
  return s === 'pending' || s === 'assigned'
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
    return 'ETA unavailable — restaurant delivery location is not set.'
  }

  if (isPreActiveDeliveryStatus(deliveryStatus)) {
    return 'ETA will appear once the driver starts delivery.'
  }

  if (!data.etaAvailable) {
    if (!isRestaurantOrderTracking(data) && data.unavailableReason === 'driver_location_missing') {
      return 'ETA will appear once the driver starts delivery.'
    }
    if (!isRestaurantOrderTracking(data) && data.unavailableReason) {
      return mapSupplierUnavailableReason(data.unavailableReason)
    }
    return 'ETA will appear once the driver starts delivery.'
  }

  return null
}

function mapSupplierUnavailableReason(reason: string): string {
  switch (reason) {
    case 'destination_missing':
      return 'ETA unavailable — restaurant delivery location is not set.'
    case 'assignment_not_active':
      return 'ETA will appear once the driver starts delivery.'
    case 'driver_location_missing':
      return 'ETA will appear once the driver starts delivery.'
    case 'order_terminal':
      return 'ETA not available for this order.'
    default:
      return 'ETA not available yet'
  }
}

export function shouldShowEtaConfidence(data: SupplierOrderTrackingResponse | undefined): boolean {
  return Boolean(data?.etaAvailable && data.confidence === 'LOW')
}
