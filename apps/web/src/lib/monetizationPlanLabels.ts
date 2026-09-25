type TenantTypeLike = 'RESTAURANT' | 'SUPPLIER' | string | null | undefined

/**
 * Normalize legacy plan codes in monetization errors without confusing the
 * tenant-specific meaning of `gold`.
 */
export function sanitizeMonetizationPlanLabel(value: unknown, tenantType?: TenantTypeLike): string {
  const raw = String(value || '').trim()
  const key = raw.toLowerCase()
  const type = String(tenantType || '').toUpperCase()

  if (key === 'free' || key === 'free trial') return '30-day Free Trial'

  if (type === 'RESTAURANT') {
    if (key === 'silver' || key === 'bronze') return 'Growth'
    if (key === 'gold') return 'Intelligence'
    if (key === 'platinum') return 'Scale'
    if (key === 'custom') return 'Custom'
  }

  if (type === 'SUPPLIER') {
    if (key === 'silver' || key === 'gold' || key === 'bronze') return 'Growth'
    if (key === 'platinum') return 'Scale'
  }

  if (key === 'silver' || key === 'bronze') return 'Growth'
  if (key === 'platinum') return 'Scale'
  // Gold is tenant-dependent: Restaurant Intelligence, Supplier Growth.
  return raw
}

export function sanitizeMonetizationRecommendedPlans(
  value: unknown,
  tenantType?: TenantTypeLike
): string[] {
  const source = Array.isArray(value) ? value : ['Scale']
  return source.map((plan) => sanitizeMonetizationPlanLabel(plan, tenantType)).filter(Boolean)
}
