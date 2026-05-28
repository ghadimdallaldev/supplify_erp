export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Pending',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Failed',
  rescheduled: 'Rescheduled',
}

export function formatDeliveryStatus(status: string): string {
  return DELIVERY_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}
