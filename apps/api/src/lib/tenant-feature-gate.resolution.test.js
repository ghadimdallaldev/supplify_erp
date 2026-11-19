/**
 * Off-state proof for default-on kill switches: real gate + real feature-flags resolver,
 * only the DB / subscription lookups are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const flagRows = { global: [], tenant: [] }
const mockIsImpersonating = vi.fn(() => false)

vi.mock('./db.js', () => ({
  query: vi.fn(async (sql, params) => {
    const text = String(sql)
    if (text.includes('FROM feature_flag_override')) {
      return { rows: flagRows.tenant.filter((r) => r.feature_key === params[2]) }
    }
    if (text.includes('FROM feature_flag')) {
      return { rows: flagRows.global.filter((r) => r.feature_key === params[0]) }
    }
    return { rows: [] }
  }),
}))
vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
  deleteCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('./subscription.js', () => ({
  requireFeature: () => (_req, res) =>
    res.status(403).json({ error: { name: 'FEATURE_NOT_AVAILABLE' } }),
  getTenantSubscription: vi.fn(async () => ({ plan_code: 'growth', features: { chat: true } })),
}))
vi.mock('./subscription/free-trial-plan-features.js', () => ({
  resolveEffectivePlanFeatures: vi.fn(async (sub) => sub?.features ?? {}),
}))
vi.mock('./org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: vi.fn(async (id) => id),
}))
vi.mock('./impersonation.js', () => ({ isImpersonating: (req) => mockIsImpersonating(req) }))

function mockRes() {
  const res = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

const restaurantReq = () => ({
  userData: { role: 'RESTAURANT' },
  tenantContext: { tenantId: 'r1', tenantType: 'RESTAURANT' },
})

async function run(req, key = 'reservations') {
  const { tenantFeatureGate } = await import('./tenant-feature-gate.js')
  const res = mockRes()
  const next = vi.fn()
  await tenantFeatureGate(key)(req, res, next)
  return { res, next }
}

describe('tenantFeatureGate resolution (default-on keys)', () => {
  beforeEach(() => {
    flagRows.global = []
    flagRows.tenant = []
    mockIsImpersonating.mockReturnValue(false)
  })

  it('passes by default with no override and no plan value', async () => {
    const { next, res } = await run(restaurantReq())
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('403 FEATURE_DISABLED when turned off for the account', async () => {
    flagRows.tenant = [{ feature_key: 'reservations', is_enabled: false }]
    const { next, res } = await run(restaurantReq())
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json.mock.calls[0][0].error.code).toBe('FEATURE_DISABLED')
  })

  it('403 when turned off globally', async () => {
    flagRows.global = [{ feature_key: 'reservations', global_override: false }]
    const { res } = await run(restaurantReq())
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('an account override ON beats a global OFF', async () => {
    flagRows.global = [{ feature_key: 'reservations', global_override: false }]
    flagRows.tenant = [{ feature_key: 'reservations', is_enabled: true }]
    const { next } = await run(restaurantReq())
    expect(next).toHaveBeenCalled()
  })

  it('platform admins bypass, but not while impersonating the account', async () => {
    flagRows.tenant = [{ feature_key: 'reservations', is_enabled: false }]
    const adminReq = { ...restaurantReq(), userData: { role: 'ADMIN' } }
    expect((await run(adminReq)).next).toHaveBeenCalled()
    mockIsImpersonating.mockReturnValue(true)
    const { next, res } = await run(adminReq)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('plan-sold keys still deny through requireFeature (upgrade paywall)', async () => {
    const { res } = await run(restaurantReq(), 'recipe_costing')
    expect(res.json.mock.calls[0][0].error.name).toBe('FEATURE_NOT_AVAILABLE')
  })
})
