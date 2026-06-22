import i18n from 'i18next'
import type { RestaurantOrderTrackingResponse, SupplierOrderTrackingResponse } from '../types'
import { isRestaurantOrderTracking } from '../types'

const NS = 'fulfillment'

function ft(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ns: NS, ...options })
}

export function formatEtaRange(min?: number | null, max?: number | null): string | null {
  if (min == null || max == null) return null
  if (min === max) return ft('tracking.eta.minSingle', { min })
  return ft('tracking.eta.minRange', { min, max })
}

export function formatEtaMinutesRange(min?: number | null, max?: number | null): string | null {
  if (min == null || max == null) return null
  if (min === max) return ft('tracking.eta.minutesSingle', { min })
  return ft('tracking.eta.minutesRange', { min, max })
}

export function formatDistanceKm(km?: number | null): string | null {
  if (km == null) return null
  return ft('tracking.eta.distanceKm', { km: km.toFixed(1) })
}

export function formatSupplierDistanceKm(km?: number | null): string | null {
  if (km == null) return null
  return ft('tracking.eta.supplierDistance', { km: km.toFixed(1) })
}

export function getRestaurantEtaPrimaryText(
  data: RestaurantOrderTrackingResponse | undefined
): string | null {
  if (!data?.etaAvailable) return null
  const range = formatEtaRange(data.etaMinutesMin, data.etaMinutesMax)
  if (!range) return null
  const minutes = formatEtaMinutesRange(data.etaMinutesMin, data.etaMinutesMax)
  if (!minutes) return null
  if (data.nextStop === false && (data.stopsBefore ?? 0) > 0) {
    return ft('tracking.eta.restaurant.plannedAfterStops', { count: data.stopsBefore })
  }
  return ft('tracking.eta.restaurant.arrivingIn', { range: minutes })
}

export function getRestaurantEtaSecondaryText(
  data: RestaurantOrderTrackingResponse | undefined
): string | null {
  if (!data?.etaAvailable) return null
  if (data.nextStop === false && (data.stopsBefore ?? 0) > 0) {
    const minutes = formatEtaMinutesRange(data.etaMinutesMin, data.etaMinutesMax)
    if (minutes) return ft('tracking.eta.restaurant.estimatedArrival', { range: minutes })
  }
  return formatDistanceKm(data.distanceKm)
}

export function getSupplierEtaPrimaryText(
  data: SupplierOrderTrackingResponse | undefined
): string | null {
  if (!data?.etaAvailable) return null
  const range = formatEtaRange(data.etaMinutesMin, data.etaMinutesMax)
  if (!range) return null
  return ft('tracking.eta.supplier.eta', { range })
}

export function getSupplierEtaSecondaryText(
  data: SupplierOrderTrackingResponse | undefined
): string | null {
  if (!data?.etaAvailable) return null
  const parts: string[] = []
  if ((data.stopsBefore ?? 0) > 0) {
    parts.push(ft('tracking.eta.supplier.stopsBefore', { count: data.stopsBefore }))
  }
  if (data.routePosition != null && data.routePositionTotal != null) {
    parts.push(
      ft('tracking.eta.supplier.routePosition', {
        position: data.routePosition,
        total: data.routePositionTotal,
      })
    )
  }
  const distance = formatSupplierDistanceKm(data.distanceKm)
  if (distance) parts.push(distance)
  return parts.length ? parts.join(' · ') : null
}

function isPreActiveDeliveryStatus(status: string | null | undefined): boolean {
  const s = String(status || 'pending').toLowerCase()
  return s === 'pending' || s === 'assigned'
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
    return ft('tracking.eta.unavailable.destinationMissing')
  }

  if (isPreActiveDeliveryStatus(deliveryStatus)) {
    return ft('tracking.eta.unavailable.startDelivery')
  }

  if (!data.etaAvailable) {
    if (!isRestaurantOrderTracking(data) && data.unavailableReason === 'driver_location_missing') {
      return ft('tracking.eta.unavailable.startDelivery')
    }
    if (!isRestaurantOrderTracking(data) && data.unavailableReason) {
      return mapSupplierUnavailableReason(data.unavailableReason)
    }
    return ft('tracking.eta.unavailable.startDelivery')
  }

  return null
}

function mapSupplierUnavailableReason(reason: string): string {
  switch (reason) {
    case 'destination_missing':
      return ft('tracking.eta.unavailable.destinationMissing')
    case 'assignment_not_active':
      return ft('tracking.eta.unavailable.startDelivery')
    case 'driver_location_missing':
      return ft('tracking.eta.unavailable.startDelivery')
    case 'order_terminal':
      return ft('tracking.eta.unavailable.orderTerminal')
    default:
      return ft('tracking.eta.unavailable.notAvailableYet')
  }
}

export function shouldShowEtaConfidence(data: SupplierOrderTrackingResponse | undefined): boolean {
  return Boolean(data?.etaAvailable && data.confidence === 'LOW')
}
