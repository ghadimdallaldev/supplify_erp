/** Order statuses where the restaurant can record receiving (supplier handoff done). */
export const RECEIVABLE_ORDER_STATUSES = ['DELIVERED', 'COMPLETED'] as const

export function isOrderReadyForReceiving(status?: string | null): boolean {
  const normalized = (status || '').toUpperCase()
  return RECEIVABLE_ORDER_STATUSES.includes(
    normalized as (typeof RECEIVABLE_ORDER_STATUSES)[number]
  )
}
