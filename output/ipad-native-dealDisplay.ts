import type { ActiveDeal } from '../types/promotions'

export function activeDealDiscountLabel(deal: ActiveDeal): string {
  const kind = deal.type ?? deal.deal_type ?? ''
  const value = Number(deal.discount_value)
  if (Number.isFinite(value) && value > 0) {
    if (kind === 'percentage_discount') return `${value}% off`
    if (kind === 'fixed_discount') return `${value} off`
  }
  if (deal.discount_percent != null) return `${deal.discount_percent}% off`
  if (deal.discount_amount != null) return `${deal.discount_amount} off`
  if (kind === 'free_shipping') return 'Free delivery'
  return kind.replace(/_/g, ' ') || 'Promotion'
}

/** A failed or malformed response must not become a misleading empty list. */
export function unwrapActiveDeals(data: unknown): ActiveDeal[] {
  const payload = data as { promotions?: unknown; deals?: unknown } | null
  const rows = payload?.promotions ?? payload?.deals
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.id !== 'string' || typeof row.name !== 'string')) {
    throw new Error('Unable to load supplier deals')
  }
  return rows as ActiveDeal[]
}
