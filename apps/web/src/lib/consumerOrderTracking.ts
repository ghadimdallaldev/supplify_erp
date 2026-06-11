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
