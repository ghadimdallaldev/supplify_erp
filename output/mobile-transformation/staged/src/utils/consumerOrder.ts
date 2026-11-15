import type { ConsumerOrderStatus } from '../types/consumer'

export const CONSUMER_ORDER_STATUS_CHAIN = [
  'RECEIVED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
] as const

export type ConsumerOrderTrackingStatus = (typeof CONSUMER_ORDER_STATUS_CHAIN)[number]

export const CONSUMER_ORDER_STATUS_LABELS: Record<ConsumerOrderTrackingStatus, string> = {
  RECEIVED: 'Received',
  PREPARING: 'Preparing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
}

export function consumerOrderStatusLabel(status: string): string {
  if (status === 'CANCELLED') return 'Cancelled'
  return CONSUMER_ORDER_STATUS_LABELS[status as ConsumerOrderTrackingStatus] ?? status.replace(/_/g, ' ')
}

export function getNextConsumerOrderStatus(
  current: string
): ConsumerOrderTrackingStatus | null {
  const idx = CONSUMER_ORDER_STATUS_CHAIN.indexOf(current as ConsumerOrderTrackingStatus)
  if (idx >= 0 && idx < CONSUMER_ORDER_STATUS_CHAIN.length - 1) {
    return CONSUMER_ORDER_STATUS_CHAIN[idx + 1]
  }
  return null
}

export function consumerFulfillmentLabel(type: string): string {
  switch (type) {
    case 'DELIVERY':
      return 'Delivery'
    case 'TAKEAWAY':
      return 'Takeaway'
    case 'DINE_IN':
      return 'Dine in'
    default:
      return type.replace(/_/g, ' ')
  }
}

export function nextConsumerOrderActionLabel(
  status: ConsumerOrderStatus,
  fulfillmentType: string
): string {
  const next = getNextConsumerOrderStatus(status)
  if (!next) return 'Advance'
  if (fulfillmentType === 'DELIVERY' && next === 'SHIPPED') return 'Mark on the way'
  if (fulfillmentType === 'TAKEAWAY' && next === 'SHIPPED') return 'Mark ready'
  if (fulfillmentType === 'DINE_IN' && next === 'SHIPPED') return 'Mark ready'
  if (next === 'PREPARING') return 'Start preparing'
  if (next === 'DELIVERED') return 'Complete'
  return `Mark ${consumerOrderStatusLabel(next).toLowerCase()}`
}
