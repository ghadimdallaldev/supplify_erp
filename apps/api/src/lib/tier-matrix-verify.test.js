import { describe, expect, it } from 'vitest'
import { RESTAURANT_FEATURE_KEYS } from './feature-keys.js'
import { RESTAURANT_LIMIT_KEYS } from './limit-resolution.js'
import { normalizeLimitForMonotonicCompare, verifyTenantTypeMatrix } from './tier-matrix-verify.js'

function plan(code, limits, features) {
  return { code, tenant_type: 'RESTAURANT', limits, features }
}

function fullRestaurantPlan(code, limitOverrides = {}, featureOverrides = {}) {
  const limits = Object.fromEntries(RESTAURANT_LIMIT_KEYS.map((k) => [k, 1]))
  const features = Object.fromEntries(RESTAURANT_FEATURE_KEYS.map((k) => [k, false]))
  return plan(code, { ...limits, ...limitOverrides }, { ...features, ...featureOverrides })
}

describe('tier-matrix-verify', () => {
  it('treats -1 as max for monotonic compare', () => {
    expect(normalizeLimitForMonotonicCompare(-1)).toBeGreaterThan(1000)
    expect(normalizeLimitForMonotonicCompare(10)).toBe(10)
  })

  it('flags missing limit keys', () => {
    const base = fullRestaurantPlan('free')
    const limits = { ...base.limits }
    delete limits.orders_per_day
    const plans = [
      plan('free', limits, base.features),
      fullRestaurantPlan('silver'),
      fullRestaurantPlan('gold'),
      fullRestaurantPlan('platinum'),
    ]
    const { failures } = verifyTenantTypeMatrix(plans, 'RESTAURANT')
    expect(failures.some((f) => f.includes('missing limit key "orders_per_day"'))).toBe(true)
  })

  it('flags non-monotonic limits', () => {
    const plans = [
      fullRestaurantPlan('free', { orders_per_day: 5 }),
      fullRestaurantPlan('silver', { orders_per_day: 3 }),
      fullRestaurantPlan('gold'),
      fullRestaurantPlan('platinum'),
    ]
    const { failures } = verifyTenantTypeMatrix(plans, 'RESTAURANT')
    expect(failures.some((f) => f.includes('orders_per_day') && f.includes('decreases'))).toBe(true)
  })

  it('passes when all keys present and limits are monotonic', () => {
    const plans = [
      fullRestaurantPlan('free', { orders_per_day: 3 }),
      fullRestaurantPlan('silver', { orders_per_day: 10 }),
      fullRestaurantPlan('gold', { orders_per_day: 50 }),
      fullRestaurantPlan('platinum', { orders_per_day: -1 }),
    ]
    const { failures } = verifyTenantTypeMatrix(plans, 'RESTAURANT')
    expect(failures).toEqual([])
  })
})
