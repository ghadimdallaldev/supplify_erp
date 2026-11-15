export const DISPUTE_ELIGIBLE_ORDER_STATUSES = [
  'COMPLETED',
  'DELIVERED',
  'RECEIVED',
  'PARTIALLY_RECEIVED',
] as const

export function isOrderEligibleForDispute(status: string | undefined | null): boolean {
  if (!status) return false
  return DISPUTE_ELIGIBLE_ORDER_STATUSES.includes(
    status.toUpperCase() as (typeof DISPUTE_ELIGIBLE_ORDER_STATUSES)[number]
  )
}

export function disputeEligibilityMessage(status: string | undefined | null): string {
  if (isOrderEligibleForDispute(status)) return ''
  return 'Disputes can only be opened after the supplier has delivered the order (delivered, received, or completed).'
}
