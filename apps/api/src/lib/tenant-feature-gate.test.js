import { beforeEach, describe, expect, it, vi } from 'vitest'

const gateImpl = vi.fn()
const mockIsEnabledForTenant = vi.fn()
const mockIsPlatformEnabled = vi.fn()

vi.mock('./subscription.js', () => ({
  requireFeature: (featureKey) => (req, res, next) => gateImpl(featureKey, req, res, next),
}))
vi.mock('./impersonation.js', () => ({ isImpersonating: () => false }))
vi.mock('./feature-flags.js', () => ({
  isFeatureEnabledForTenant: (...args) => mockIsEnabledForTenant(...args),
  isPlatformFeatureEnabled: (...args) => mockIsPlatformEnabled(...args),
}))

function mockRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

describe('tenantFeatureGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gateImpl.mockImplementation((_k, _req, res) => res.status(403).json({ ok: false }))
  })

  it('tags the middleware with its feature key', async () => {
    const { tenantFeatureGate } = await import('./tenant-feature-gate.js')
    expect(tenantFeatureGate('loyalty').featureKey).toBe('loyalty')
  })

  it('delegates plan-sold keys to requireFeature for an applicable tenant', async () => {
    const { tenantFeatureGate } = await import('./tenant-feature-gate.js')
    const next = vi.fn()
    const res = mockRes()
    await tenantFeatureGate('recipe_costing')(
      {
        userData: { role: 'RESTAURANT' },
        tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' },
      },
      res,
      next
    )
    expect(gateImpl).toHaveBeenCalledWith('recipe_costing', expect.anything(), res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('bypasses for platform admins, missing tenants and non-applicable tenant types', async () => {
    const { tenantFeatureGate } = await import('./tenant-feature-gate.js')
    const gate = tenantFeatureGate('recipe_costing')
    const next = vi.fn()
    await gate(
      { userData: { role: 'ADMIN' }, tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' } },
      mockRes(),
      next
    )
    await gate({ userData: { role: 'RESTAURANT' } }, mockRes(), next)
    await gate(
      { userData: { role: 'SUPPLIER' }, tenantContext: { tenantId: 's1', tenantType: 'SUPPLIER' } },
      mockRes(),
      next
    )
    expect(next).toHaveBeenCalledTimes(3)
    expect(gateImpl).not.toHaveBeenCalled()
  })

  it('enforces for admins when adminBypass is false', async () => {
    const { tenantFeatureGate } = await import('./tenant-feature-gate.js')
    await tenantFeatureGate('recipe_costing', { adminBypass: false })(
      { userData: { role: 'ADMIN' }, tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' } },
      mockRes(),
      vi.fn()
    )
    expect(gateImpl).toHaveBeenCalled()
  })
})

describe('publicTenantFeatureGate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('404s when the owning tenant has the feature off', async () => {
    const { publicTenantFeatureGate } = await import('./tenant-feature-gate.js')
    mockIsEnabledForTenant.mockResolvedValue(false)
    const res = mockRes()
    const next = vi.fn()
    await publicTenantFeatureGate('consumer_storefront', 'RESTAURANT', async () => 'r1')(
      {},
      res,
      next
    )
    expect(mockIsEnabledForTenant).toHaveBeenCalledWith('r1', 'RESTAURANT', 'consumer_storefront')
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json.mock.calls[0][0].error.code).toBe('FEATURE_DISABLED')
    expect(next).not.toHaveBeenCalled()
  })

  it('passes when enabled or when the tenant cannot be resolved', async () => {
    const { publicTenantFeatureGate } = await import('./tenant-feature-gate.js')
    mockIsEnabledForTenant.mockResolvedValue(true)
    const next = vi.fn()
    await publicTenantFeatureGate('consumer_storefront', 'RESTAURANT', async () => 'r1')(
      {},
      mockRes(),
      next
    )
    await publicTenantFeatureGate('consumer_storefront', 'RESTAURANT', async () => null)(
      {},
      mockRes(),
      next
    )
    expect(next).toHaveBeenCalledTimes(2)
    expect(mockIsEnabledForTenant).toHaveBeenCalledTimes(1)
  })
})

describe('platformFeatureGate', () => {
  it('404s when the platform flag is off', async () => {
    const { platformFeatureGate } = await import('./tenant-feature-gate.js')
    mockIsPlatformEnabled.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const res = mockRes()
    const next = vi.fn()
    await platformFeatureGate('demo_campaign')({}, res, next)
    expect(res.status).toHaveBeenCalledWith(404)
    await platformFeatureGate('demo_campaign')({}, mockRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})
