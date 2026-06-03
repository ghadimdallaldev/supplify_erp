import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./feature-flags.js', () => ({
  resolveAllFeaturesForTenant: vi.fn().mockResolvedValue({ features: {}, featureSources: {} }),
}))

vi.mock('./plan-enforcement.js', () => ({
  countActiveBranchLocations: vi.fn().mockResolvedValue(0),
  countActiveWarehouses: vi.fn().mockResolvedValue(0),
}))

vi.mock('./warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('tenant_id'),
}))

import { query } from './db.js'

describe('subscription plan display names', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('getEntitlements exposes Free Trial when DB plan name is Free', async () => {
    const subRow = {
      id: 'sub-1',
      plan_id: 'p1',
      plan_name: 'Free',
      plan_code: 'free',
      limits: { chats_per_day: 10 },
      features: {},
      tenant_type: 'SUPPLIER',
      plan_display_name: 'Free',
      plan_price_per_month: 0,
      plan_price_per_year: null,
      plan_tenant_type: 'SUPPLIER',
      pending_plan_id: null,
      pending_effective_at: null,
      free_sandbox_expires_at: new Date(Date.now() + 86400000).toISOString(),
    }

    vi.mocked(query).mockImplementation((sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('organization_id')) {
        return Promise.resolve({ rows: [] })
      }
      if (text.includes('pending_plan_id') && text.includes('FROM subscription')) {
        return Promise.resolve({
          rows: [{ id: 'sub-1', plan_id: 'p1', pending_plan_id: null, pending_effective_at: null }],
        })
      }
      if (text.includes('FROM subscription s') && text.includes('JOIN subscription_plan')) {
        return Promise.resolve({ rows: [subRow] })
      }
      if (text.includes('tenant_subscription_addon')) {
        return Promise.resolve({ rows: [] })
      }
      if (text.includes('plan_limit_override') || text.includes('tenant_limit_override')) {
        return Promise.resolve({ rows: [] })
      }
      if (text.includes('feature_flag')) {
        return Promise.resolve({ rows: [] })
      }
      if (text.includes('COUNT') || text.includes('current_value')) {
        return Promise.resolve({ rows: [{ c: 0, current_value: 0 }] })
      }
      return Promise.resolve({ rows: [] })
    })

    const { getEntitlements } = await import('./subscription.js')
    const result = await getEntitlements('tenant-1', 'SUPPLIER')

    expect(result?.plan.name).toBe('Free Trial')
    expect(result?.plan.code).toBe('free')
  })
})
