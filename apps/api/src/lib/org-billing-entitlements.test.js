import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./plan-enforcement.js', () => ({
  countActiveBranchLocations: vi.fn().mockResolvedValue(2),
}))

vi.mock('./warehouse-helpers.js', () => ({
  getWarehouseSupplierColumn: vi.fn().mockResolvedValue('tenant_id'),
}))

vi.mock('./ai-platform.js', () => ({
  isAiPlatformEnabledForTenant: vi.fn().mockResolvedValue(true),
}))

import { query } from './db.js'

const goldSubRow = {
  id: 'sub-main',
  plan_id: 'plan-gold',
  plan_name: 'Gold',
  plan_code: 'gold',
  limits: { branches: 3, multi_branch: true, warehouses: 3 },
  features: { multi_branch: true, smart_reorder: 'full_90day_trends', ai_platform: true },
  tenant_type: 'RESTAURANT',
  plan_display_name: 'Gold',
  plan_price_per_month: 149,
  plan_price_per_year: null,
  plan_tenant_type: 'RESTAURANT',
  pending_plan_id: null,
  pending_effective_at: null,
}

describe('org billing entitlements', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('child branch receives main branch plan and features', async () => {
    vi.mocked(query).mockImplementation((sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('SELECT organization_id FROM restaurant')) {
        return Promise.resolve({ rows: [{ organization_id: 'org-1' }] })
      }
      if (text.includes('is_main_branch = true')) {
        return Promise.resolve({ rows: [{ id: 'main-rest' }] })
      }
      if (text.includes('pending_plan_id') && text.includes('FROM subscription')) {
        return Promise.resolve({
          rows: [
            {
              id: 'sub-main',
              plan_id: 'plan-gold',
              pending_plan_id: null,
              pending_effective_at: null,
            },
          ],
        })
      }
      if (text.includes('FROM subscription s') && text.includes('JOIN subscription_plan')) {
        return Promise.resolve({ rows: [goldSubRow] })
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
    const ent = await getEntitlements('child-rest', 'RESTAURANT')

    expect(ent).not.toBeNull()
    expect(ent.billingTenantId).toBe('main-rest')
    expect(ent.usesOrgBilling).toBe(true)
    expect(ent.plan.code).toBe('gold')
    expect(ent.features.multi_branch).toBe(true)
    expect(ent.tenantId).toBe('child-rest')
    expect(ent.smartReorder).toMatchObject({
      tier: 'gold',
      aiPlatformEnabled: true,
      capabilities: {
        assistance: true,
        forecast: true,
        forecast90d: true,
        seasonality: false,
        trendAdjustment: false,
        llmExplain: true,
        nlAsk: false,
      },
    })
  })
})
