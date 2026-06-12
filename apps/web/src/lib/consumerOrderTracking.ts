import type { ConsumerFulfillmentType } from '../services/consumerApi'

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

export const CONSUMER_ORDER_TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'] as const

const FULFILLMENT_STATUS_LABELS: Record<
  ConsumerFulfillmentType,
  Record<ConsumerOrderTrackingStatus, string>
> = {
  DELIVERY: {
    RECEIVED: 'Order received',
    PREPARING: 'Preparing',
    SHIPPED: 'On the way',
    DELIVERED: 'Delivered',
  },
  TAKEAWAY: {
    RECEIVED: 'Order received',
    PREPARING: 'Preparing',
    SHIPPED: 'Ready for pickup',
    DELIVERED: 'Picked up',
  },
  DINE_IN: {
    RECEIVED: 'Order received',
    PREPARING: 'Preparing',
    SHIPPED: 'Ready to serve',
    DELIVERED: 'Served',
  },
}

export function getConsumerStatusLabels(
  fulfillmentType?: ConsumerFulfillmentType | string | null
): Record<ConsumerOrderTrackingStatus, string> {
  if (fulfillmentType && fulfillmentType in FULFILLMENT_STATUS_LABELS) {
    return FULFILLMENT_STATUS_LABELS[fulfillmentType as ConsumerFulfillmentType]
  }
  return CONSUMER_ORDER_STATUS_LABELS
}

export function getNextConsumerOrderStatus(current: string): ConsumerOrderTrackingStatus | null {
  const idx = CONSUMER_ORDER_STATUS_CHAIN.indexOf(current as ConsumerOrderTrackingStatus)
  if (idx >= 0 && idx < CONSUMER_ORDER_STATUS_CHAIN.length - 1) {
    return CONSUMER_ORDER_STATUS_CHAIN[idx + 1]
  }
  return null
}

export function isConsumerOrderTerminal(status: string): boolean {
  return (CONSUMER_ORDER_TERMINAL_STATUSES as readonly string[]).includes(status)
}

export type ConsumerOrderLineModifier = {
  groupName?: string
  optionName?: string
  priceDelta?: number
}

export type ConsumerOrderLine = {
  id: string
  item_name: string
  quantity: number
  unit_price: number
  line_total: number
  modifiers?: ConsumerOrderLineModifier[]
  notes?: string | null
}

export type ConsumerOrderHistoryEntry = {
  status: string
  created_at: string
  notes?: string | null
}
