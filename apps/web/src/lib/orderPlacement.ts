export const PLACEMENT_SOURCE_DISPUTE_REPLACEMENT = 'DISPUTE_REPLACEMENT'

export function isDisputeReplacementOrder(
  order: Record<string, unknown> | null | undefined
): boolean {
  if (!order) return false
  const source = order.placement_source ?? order.placementSource
  return String(source) === PLACEMENT_SOURCE_DISPUTE_REPLACEMENT
}

export function formatOrderRef(orderId: unknown): string {
  const id = String(orderId || '')
  return id ? `#${id.slice(0, 8).toUpperCase()}` : '—'
}
