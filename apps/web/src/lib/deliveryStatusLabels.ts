import i18n from 'i18next'

const NS = 'fulfillment'

function ft(key: string): string {
  return i18n.t(key, { ns: NS })
}

const DELIVERY_STATUS_KEYS: Record<string, string> = {
  pending: 'tracking.deliveryStatus.pending',
  assigned: 'tracking.deliveryStatus.assigned',
  picked_up: 'tracking.deliveryStatus.picked_up',
  out_for_delivery: 'tracking.deliveryStatus.out_for_delivery',
  delivered: 'tracking.deliveryStatus.delivered',
  failed: 'tracking.deliveryStatus.failed',
  rescheduled: 'tracking.deliveryStatus.rescheduled',
}

export function formatDeliveryStatus(status: string): string {
  const key = DELIVERY_STATUS_KEYS[status]
  if (key) return ft(key)
  return status.replace(/_/g, ' ')
}
