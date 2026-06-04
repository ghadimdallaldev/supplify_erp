import type { RestaurantOrderTrackingResponse } from '../types'
import { getGpsDisplayStatus } from './deliveryTrackingLabels'

const ACTIVE_DELIVERY_STATUSES = new Set(['assigned', 'picked_up', 'out_for_delivery'])

export function shouldPollRestaurantTracking(
  data: RestaurantOrderTrackingResponse | undefined,
  orderStatus?: string
): boolean {
  if (!data?.trackingEnabled) return false
  const terminal = new Set(['CANCELLED', 'COMPLETED'])
  if (orderStatus && terminal.has(orderStatus)) return false
  const status = data.delivery?.status
  if (!status) return false
  if (status === 'delivered' || status === 'failed' || status === 'cancelled') return false
  return ACTIVE_DELIVERY_STATUSES.has(status)
}

export function getRestaurantTrackingMessage(
  data: RestaurantOrderTrackingResponse | undefined
): string {
  if (!data) return 'Loading delivery tracking…'

  if (data.reason === 'restaurant_tracking_disabled' || !data.trackingEnabled) {
    return 'Live tracking is not enabled for this order.'
  }

  const deliveryStatus = data.delivery?.status
  if (!deliveryStatus || deliveryStatus === 'pending') {
    return 'Delivery tracking will appear once the supplier assigns a driver.'
  }

  if (deliveryStatus === 'delivered') {
    return 'Delivered. You can now receive the order.'
  }

  if (deliveryStatus === 'failed') {
    return 'Delivery could not be completed. Contact your supplier for updates.'
  }

  const gps = getGpsDisplayStatus(data.tracking)
  const lastLabel = data.tracking?.lastUpdatedLabel

  if (gps === 'none') {
    return 'Driver assigned. Waiting for the first GPS update.'
  }
  if (gps === 'stale') {
    return lastLabel
      ? `Location has not updated recently. Last update: ${lastLabel}.`
      : 'Location has not updated recently.'
  }
  if (gps === 'live') {
    return lastLabel
      ? `Driver is on the way. Location updated ${lastLabel}.`
      : 'Driver is on the way.'
  }
  return 'Delivery tracking is unavailable for this order.'
}

export function canShowRestaurantReceiveCta(
  data: RestaurantOrderTrackingResponse | undefined,
  orderStatus?: string
): boolean {
  if (data?.delivery?.status === 'delivered') return true
  return orderStatus === 'DELIVERED' || orderStatus === 'COMPLETED'
}
