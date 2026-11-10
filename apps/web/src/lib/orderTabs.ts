/**
 * Orders page tab -> status buckets.
 *
 * Every order status lands in exactly one tab (DRAFT and CANCELLED only show
 * under "all"). The API list endpoint accepts a single `status` value
 * (equality match), so only single-status tabs can be filtered server side;
 * multi-status tabs are filtered client side on the current page.
 */
export const ORDER_TAB_STATUSES: Record<string, readonly string[]> = {
  new: ['PLACED'],
  processing: ['ACKNOWLEDGED', 'PROCESSING'],
  shipped: ['SHIPPED'],
  completed: [
    'DELIVERED',
    'RECEIVED_PARTIAL',
    'RECEIVED_FULL',
    'RECEIVED_WITH_DISPUTE',
    'INVOICED',
    'COMPLETED',
  ],
}

/** Server-side status filter for a tab, or undefined when the tab spans several statuses. */
export function serverStatusForTab(tab: string): string | undefined {
  const statuses = ORDER_TAB_STATUSES[tab]
  return statuses?.length === 1 ? statuses[0] : undefined
}

export function orderMatchesTab(tab: string, orderStatus: string): boolean {
  const statuses = ORDER_TAB_STATUSES[tab]
  if (!statuses) return true
  return statuses.includes(orderStatus)
}
