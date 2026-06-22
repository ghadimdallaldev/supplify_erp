import i18n from 'i18next'

const NS = 'disputes'

function dt(key: string): string {
  return i18n.t(key, { ns: NS })
}

/** Must match `DELIVERED_ORDER_STATUSES` in apps/api/src/services/reviews.service.js */
export const DISPUTE_ELIGIBLE_ORDER_STATUSES = [
  'COMPLETED',
  'DELIVERED',
  'RECEIVED_PARTIAL',
  'RECEIVED_FULL',
  'RECEIVED_WITH_DISPUTE',
  'INVOICED',
] as const

export function isOrderEligibleForDispute(status: string | undefined | null): boolean {
  if (!status) return false
  return DISPUTE_ELIGIBLE_ORDER_STATUSES.includes(
    status as (typeof DISPUTE_ELIGIBLE_ORDER_STATUSES)[number]
  )
}

export function disputeEligibilityMessage(status: string | undefined | null): string {
  if (isOrderEligibleForDispute(status)) return ''
  return dt('eligibility.notEligible')
}
