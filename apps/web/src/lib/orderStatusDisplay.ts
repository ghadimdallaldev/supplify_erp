export type OrderCancellationParty = 'RESTAURANT' | 'SUPPLIER'

export type OrderStatusDisplayInput = {
  status: string
  cancelled_by?: string | null
  cancel_reason?: string | null
}

export function isSupplierDeclined(order: OrderStatusDisplayInput): boolean {
  return order.status === 'CANCELLED' && order.cancelled_by === 'SUPPLIER'
}

export function getOrderStatusLabel(
  order: OrderStatusDisplayInput,
  viewerRole: 'RESTAURANT' | 'SUPPLIER'
): string {
  if (order.status === 'RECEIVED_WITH_DISPUTE') {
    return 'Received — dispute open'
  }

  if (order.status !== 'CANCELLED') {
    return order.status.replace(/_/g, ' ')
  }

  if (order.cancelled_by === 'SUPPLIER') {
    return viewerRole === 'RESTAURANT' ? 'Declined by supplier' : 'Declined'
  }

  if (order.cancelled_by === 'RESTAURANT') {
    return viewerRole === 'SUPPLIER' ? 'Cancelled by restaurant' : 'Cancelled'
  }

  return 'Cancelled'
}

export function getOrderCancellationBanner(
  order: OrderStatusDisplayInput,
  viewerRole: 'RESTAURANT' | 'SUPPLIER'
): { title: string; reason?: string } | null {
  if (order.status !== 'CANCELLED') return null

  const reason = order.cancel_reason?.trim()
  if (order.cancelled_by === 'SUPPLIER' && viewerRole === 'RESTAURANT') {
    return {
      title: 'Declined by supplier',
      reason: reason || 'No reason was provided.',
    }
  }

  if (order.cancelled_by === 'RESTAURANT' && viewerRole === 'SUPPLIER' && reason) {
    return {
      title: 'Cancelled by restaurant',
      reason,
    }
  }

  if (reason && viewerRole === 'RESTAURANT' && order.cancelled_by !== 'SUPPLIER') {
    return { title: 'Order cancelled', reason }
  }

  return null
}
