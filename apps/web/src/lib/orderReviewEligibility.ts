/** Must match `DELIVERED_ORDER_STATUSES` in apps/api/src/services/reviews.service.js */
export const REVIEW_ELIGIBLE_ORDER_STATUSES = [
  'COMPLETED',
  'DELIVERED',
  'RECEIVED_PARTIAL',
  'RECEIVED_FULL',
  'RECEIVED_WITH_DISPUTE',
  'INVOICED',
] as const

export const REVIEW_EDIT_WINDOW_DAYS = 7

export function isOrderEligibleForReview(status: string | undefined | null): boolean {
  if (!status) return false
  return REVIEW_ELIGIBLE_ORDER_STATUSES.includes(
    status as (typeof REVIEW_ELIGIBLE_ORDER_STATUSES)[number]
  )
}

export function canEditReview(
  review: { reviewer_user_id?: string | null; created_at?: string | null },
  userId?: string | null
): boolean {
  if (!userId || review.reviewer_user_id !== userId) return false
  if (!review.created_at) return false
  const created = new Date(review.created_at)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - REVIEW_EDIT_WINDOW_DAYS)
  return created >= cutoff
}
