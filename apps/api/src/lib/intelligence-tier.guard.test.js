/**
 * The real requireIntelligenceTier guard, exercised end to end through its
 * actual resolution path. intelligence-tier.test.js covers the pure mapping;
 * this file covers entitlement resolution and the Express contract.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResolveAllFeaturesForTenant = vi.fn()
const mockGetTenantSubscription = vi.fn()
const mockResolveEffectivePlanFeatures = vi.fn()

vi.mock('./feature-flags.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resolveAllFeaturesForTenant: (...args) => mockResolveAllFeaturesForTenant(...args),
  }
})

vi.mock('./subscription.js', () => ({
  getTenantSubscription: (...args) => mockGetTenantSubscription(...args),
}))

vi.mock('./subscription/free-trial-plan-features.js', () => ({
  resolveEffectivePlanFeatures: (...args) => mockResolveEffectivePlanFeatures(...args),
}))

const { getIntelligenceTierForTenant, requireIntelligenceTier } = await import(
  './intelligence-tier.js'
)

function runGuard(guard, tenantContext) {
  return new Promise((resolve) => {
    const req = { tenantContext }
    guard(req, {}, (err) => resolve(err ?? null))
  })
}

describe('getIntelligenceTierForTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTenantSubscription.mockResolvedValue({ plan_code: 'gold' })
    mockResolveEffectivePlanFeatures.mockResolvedValue({ intelligence: 'advanced' })
  })

  it('reads the resolved feature map, not the raw plan JSON', async () => {
    // The plan grants 'advanced' but an admin override turned the key off; the
    // resolved map is authoritative and must win.
    mockResolveAllFeaturesForTenant.mockResolvedValue({ features: { intelligence: false } })

    const result = await getIntelligenceTierForTenant('r1', 'RESTAURANT')
    expect(result.tier).toBe('none')
  })

  it('preserves the tier string from the resolved map', async () => {
    mockResolveAllFeaturesForTenant.mockResolvedValue({ features: { intelligence: 'scale' } })

    const result = await getIntelligenceTierForTenant('r1', 'RESTAURANT')
    expect(result.tier).toBe('scale')
    expect(result.capabilities.crossLocation).toBe(true)
  })

  it('fails closed without a tenant rather than querying', async () => {
    const result = await getIntelligenceTierForTenant(null, 'RESTAURANT')
    expect(result.tier).toBe('none')
    expect(mockGetTenantSubscription).not.toHaveBeenCalled()
  })

  it('fails closed when the key is absent from the resolved map', async () => {
    mockResolveAllFeaturesForTenant.mockResolvedValue({ features: {} })
    expect((await getIntelligenceTierForTenant('r1', 'RESTAURANT')).tier).toBe('none')
  })
})

describe('requireIntelligenceTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTenantSubscription.mockResolvedValue({ plan_code: 'gold' })
    mockResolveEffectivePlanFeatures.mockResolvedValue({})
  })

  it('passes a tenant at or above the required tier', async () => {
    mockResolveAllFeaturesForTenant.mockResolvedValue({ features: { intelligence: 'scale' } })

    const err = await runGuard(requireIntelligenceTier('advanced'), {
      tenantId: 'r1',
      tenantType: 'RESTAURANT',
    })
    expect(err).toBeNull()
  })

  it('forwards a ForbiddenError below the required tier', async () => {
    mockResolveAllFeaturesForTenant.mockResolvedValue({ features: { intelligence: 'basic' } })

    const err = await runGuard(requireIntelligenceTier('advanced'), {
      tenantId: 'r1',
      tenantType: 'RESTAURANT',
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ForbiddenError')
  })

  it('denies a request with no tenant context', async () => {
    const err = await runGuard(requireIntelligenceTier('basic'), undefined)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ForbiddenError')
  })

  it('forwards resolution failures instead of silently allowing the request', async () => {
    mockResolveAllFeaturesForTenant.mockRejectedValue(new Error('db down'))

    const err = await runGuard(requireIntelligenceTier('basic'), {
      tenantId: 'r1',
      tenantType: 'RESTAURANT',
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('db down')
  })
})
