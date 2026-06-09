import type { SubscriptionPlan } from '../types'

/** Resolve a plan limit from the admin plan catalog by tenant type and plan code. */
export function resolvePlanLimitFromCatalog(
  plans: SubscriptionPlan[] | undefined,
  tenantType: 'RESTAURANT' | 'SUPPLIER',
  planCode: string | null | undefined,
  limitKey: string
): number | null {
  if (!plans?.length || !planCode) return null
  const plan = plans.find(
    (p) => p.tenant_type === tenantType && (p.code ?? '').toLowerCase() === planCode.toLowerCase()
  )
  if (!plan?.limits || !(limitKey in plan.limits)) return null
  const val = plan.limits[limitKey]
  if (val === -1) return -1
  if (typeof val === 'number' && Number.isFinite(val)) return val
  return null
}

export function formatPlanLimitDisplayValue(limit: number | null): string {
  if (limit === -1) return 'Unlimited'
  if (limit == null) return '—'
  return String(limit)
}
