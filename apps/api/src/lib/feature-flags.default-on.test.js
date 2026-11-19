import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
vi.mock('./db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('./logger.js', () => ({ logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }))
vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  deleteCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./subscription.js', () => ({
  invalidateEntitlementsCache: vi.fn().mockResolvedValue(undefined),
}))

describe('default-on feature keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
  })

  it('registers default-on keys per tenant type without requiring them in plan JSON', async () => {
    const keys = await import('./feature-keys.js')
    expect(keys.getAllowedFeatureKeys('RESTAURANT')).toEqual(
      expect.arrayContaining(['reservations', 'loyalty', 'chat'])
    )
    expect(keys.getAllowedFeatureKeys('SUPPLIER')).toEqual(
      expect.arrayContaining(['public_sales', 'quote_requests', 'fulfillment'])
    )
    // Plan-sold keys (what the tier verifier demands in plan JSON) exclude default-on keys.
    expect(keys.getPlanFeatureKeys('RESTAURANT')).not.toContain('reservations')
    expect(keys.ADMIN_GLOBAL_FEATURE_KEYS).toEqual(
      expect.arrayContaining(['ordering', 'demo_campaign', 'mobile_public_shop'])
    )
    for (const key of keys.DEFAULT_ON_FEATURE_KEYS) {
      expect(keys.featureDisplayName(key)).not.toBe(key)
    }
  })

  it('resolves a default-on key to ON when no override or plan value exists', async () => {
    const { resolveAllFeaturesForTenant } = await import('./feature-flags.js')
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    const { features, featureSources } = await resolveAllFeaturesForTenant('t1', 'RESTAURANT', {
      chat: false,
    })
    expect(features.reservations).toBe(true)
    expect(featureSources.reservations).toBe('default')
    expect(features.chat).toBe(false)
    expect(features.recipe_costing).toBe(false) // plan-sold key absent from plan stays off
  })

  it('lets a global off and a tenant off disable a default-on key', async () => {
    const { resolveAllFeaturesForTenant } = await import('./feature-flags.js')
    mockQuery
      .mockResolvedValueOnce({ rows: [{ feature_key: 'loyalty', global_override: false }] })
      .mockResolvedValueOnce({ rows: [{ feature_key: 'reservations', is_enabled: false }] })
    const { features, featureSources } = await resolveAllFeaturesForTenant('t1', 'RESTAURANT', {})
    expect(features.loyalty).toBe(false)
    expect(featureSources.loyalty).toBe('global')
    expect(features.reservations).toBe(false)
    expect(featureSources.reservations).toBe('tenant_override')
  })

  it('honours a plan that explicitly turns a default-on key off', async () => {
    const { resolveAllFeaturesForTenant } = await import('./feature-flags.js')
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    const { features } = await resolveAllFeaturesForTenant('t1', 'SUPPLIER', {
      public_sales: false,
    })
    expect(features.public_sales).toBe(false)
    expect(features.quote_requests).toBe(true)
  })

  it('single-key resolver matches the bulk resolver default', async () => {
    const { resolveFeatureEnabled } = await import('./feature-flags.js')
    mockQuery.mockResolvedValue({ rows: [] })
    await expect(resolveFeatureEnabled('t1', 'SUPPLIER', 'quote_requests', {})).resolves.toEqual({
      enabled: true,
      source: 'default',
    })
    await expect(resolveFeatureEnabled('t1', 'SUPPLIER', 'promotions', {})).resolves.toEqual({
      enabled: false,
      source: 'default',
    })
  })

  it('platform default-on key is on at inherit and off when forced off', async () => {
    const { isPlatformFeatureEnabled } = await import('./feature-flags.js')
    mockQuery.mockResolvedValueOnce({ rows: [{ global_override: null }] })
    await expect(isPlatformFeatureEnabled('demo_campaign')).resolves.toBe(true)
    mockQuery.mockResolvedValueOnce({ rows: [{ global_override: false }] })
    await expect(isPlatformFeatureEnabled('demo_campaign')).resolves.toBe(false)
    mockQuery.mockResolvedValueOnce({ rows: [] })
    await expect(isPlatformFeatureEnabled('mobile_public_shop')).resolves.toBe(false)
  })
})
