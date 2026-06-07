import type { RestaurantOrderTrackingResponse, SupplierOrderTrackingResponse } from '../types'
import { isRestaurantOrderTracking } from '../types'

export function getEtaUnavailableMessage(
  data: RestaurantOrderTrackingResponse | SupplierOrderTrackingResponse | undefined
): string | null {
  if (!data?.trackingEnabled) return null

  const deliveryStatus = isRestaurantOrderTracking(data)
    ? data.delivery?.status
    : data.assignment?.status
  if (deliveryStatus === 'delivered' || deliveryStatus === 'failed') return null

  const destinationMissing =
    data.destinationCoordinatesAvailable === false ||
    (data as RestaurantOrderTrackingResponse).destinationCoordinatesAvailable === false

  if (destinationMissing) {
    return 'ETA unavailable — restaurant delivery location is not set.'
  }

  if (!data.etaAvailable) {
    return 'ETA not available yet'
  }

  return null
}
