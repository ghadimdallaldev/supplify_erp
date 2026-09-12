import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
vi.mock('../db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('../cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
}))

describe('free-trial-plan-features', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

  it('returns gold features for free plan subscriptions', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ features: { supplier_growth: true, promotions: true } }],
    })
    const { resolveEffectivePlanFeatures } = await import('./free-trial-plan-features.js')
    const result = await resolveEffectivePlanFeatures({
      plan_code: 'free',
      plan_tenant_type: 'SUPPLIER',
      features: { chat: true },
    })
    expect(result).toEqual({ supplier_growth: true, promotions: true })
  })

  it('returns plan features unchanged for paid tiers', async () => {
    const { resolveEffectivePlanFeatures } = await import('./free-trial-plan-features.js')
    const paid = { plan_code: 'silver', features: { supplier_growth: true } }
    const result = await resolveEffectivePlanFeatures(paid)
    expect(result).toEqual({ supplier_growth: true })
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
