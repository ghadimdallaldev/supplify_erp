import { describe, expect, it } from 'vitest'
import { formatPlanLimitDisplayValue, resolvePlanLimitFromCatalog } from './adminPlanLimitLookup'
import type { SubscriptionPlan } from '../types'

const catalog: SubscriptionPlan[] = [
  {
    id: '1',
    code: 'free',
    name: 'Free Trial',
    tenant_type: 'SUPPLIER',
    limits: { supplier_products_skus: 10 },
    features: {},
    price_per_month: 0,
    price_per_year: 0,
    is_active: true,
  },
  {
    id: '2',
    code: 'gold',
    name: 'Gold',
    tenant_type: 'RESTAURANT',
    limits: { orders_per_day: 100, branches: 3 },
    features: {},
    price_per_month: 149,
    price_per_year: 1490,
    is_active: true,
  },
]

describe('adminPlanLimitLookup', () => {
  it('resolves limit by plan code and tenant type', () => {
    expect(resolvePlanLimitFromCatalog(catalog, 'SUPPLIER', 'free', 'supplier_products_skus')).toBe(
      10
    )
    expect(resolvePlanLimitFromCatalog(catalog, 'RESTAURANT', 'gold', 'orders_per_day')).toBe(100)
  })

  it('formats undefined limit as em dash', () => {
    expect(formatPlanLimitDisplayValue(undefined)).toBe('—')
  })

  it('returns null when plan or key missing', () => {
    expect(resolvePlanLimitFromCatalog(catalog, 'RESTAURANT', 'silver', 'orders_per_day')).toBe(
      null
    )
  })
})
