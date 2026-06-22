import i18n from 'i18next'
import type { RestaurantOrderTrackingResponse } from '../types'
import { getGpsDisplayStatus } from './deliveryTrackingLabels'

const NS = 'orders'

function ot(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ns: NS, ...options })
}

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
  if (!data) return ot('tracking.messages.loading')

  if (data.reason === 'restaurant_tracking_disabled' || !data.trackingEnabled) {
    return ot('tracking.messages.notEnabled')
  }

  const deliveryStatus = data.delivery?.status
  if (!deliveryStatus || deliveryStatus === 'pending') {
    return ot('tracking.messages.pendingDriver')
  }

  if (deliveryStatus === 'delivered') {
    return ot('tracking.messages.delivered')
  }

  if (deliveryStatus === 'failed') {
    return ot('tracking.messages.failed')
  }

  const gps = getGpsDisplayStatus(data.tracking)
  const lastLabel = data.tracking?.lastUpdatedLabel

  if (gps === 'none') {
    return ot('tracking.messages.waitingGps')
  }
  if (gps === 'stale') {
    return lastLabel
      ? ot('tracking.messages.staleWithTime', { time: lastLabel })
      : ot('tracking.messages.stale')
  }
  if (gps === 'live') {
    return lastLabel
      ? ot('tracking.messages.liveWithTime', { time: lastLabel })
      : ot('tracking.messages.live')
  }
  return ot('tracking.messages.unavailable')
}

export function canShowRestaurantReceiveCta(
  data: RestaurantOrderTrackingResponse | undefined,
  orderStatus?: string
): boolean {
  if (data?.delivery?.status === 'delivered') return true
  return orderStatus === 'DELIVERED' || orderStatus === 'COMPLETED'
}
