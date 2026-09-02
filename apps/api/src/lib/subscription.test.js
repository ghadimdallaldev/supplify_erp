import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSubscriptionQueryRouter,
  subscriptionIdRow,
  subscriptionRow,
} from '../test/factories/subscription.js'

const mockQuery = vi.fn()
const mockCreatePendingActivation = vi.fn().mockResolvedValue(undefined)
const mockRecordConversionEvent = vi.fn().mockResolvedValue(undefined)
vi.mock('./db.js', () => ({
  query: (...args) => mockQuery(...args),
  withTransaction: async (fn) => fn({ query: (...args) => mockQuery(...args) }),
}))
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('./billing/subscription-activation.js', () => ({
  createPendingActivationSubscription: (...args) => mockCreatePendingActivation(...args),
}))
vi.mock('./conversion-events.js', () => ({
  recordConversionEvent: (...args) => mockRecordConversionEvent(...args),
}))
vi.mock('./cache.js', () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}))
const mockResolveAllFeatures = vi.fn().mockResolvedValue({ features: {}, featureSources: {} })
vi.mock('./feature-flags.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    resolveAllFeaturesForTenant: (...args) => mockResolveAllFeatures(...args),
  }
})
vi.mock('./ai-platform.js', () => ({
  isAiPlatformEnabledForTenant: vi.fn().mockResolvedValue(true),
}))
vi.mock('./org-billing-tenant.js', () => ({
  resolveOrgBillingTenantId: vi.fn(async (tenantId) => tenantId),
}))
vi.mock('./plan-enforcement.js', () => ({
  countActiveBranchLocations: vi.fn().mockResolvedValue(0),
  countActiveWarehouses: vi.fn().mockResolvedValue(0),
}))
const mockInvalidateBillingSubscriptionCache = vi.fn().mockResolvedValue(undefined)
vi.mock('./billing/billing-service.js', () => ({
  invalidateBillingSubscriptionCache: (...args) => mockInvalidateBillingSubscriptionCache(...args),
}))

describe('Subscription lib', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockCreatePendingActivation.mockClear()
    mockRecordConversionEvent.mockClear()
    mockQuery.mockImplementation(createSubscriptionQueryRouter())
  })

  describe('getTenantSubscription', () => {
    it('returns subscription when one exists', async () => {
      const { getTenantSubscription } = await import('./subscription.js')
      mockQuery.mockImplementation(
        createSubscriptionQueryRouter({
          subId: { rows: [subscriptionIdRow()] },
          fullSub: {
            rows: [
              subscriptionRow({
                tenant_id: 'rest-1',
                limits: { chats_per_day: 10 },
                features: { chat: 'enabled' },
              }),
            ],
          },
        })
      )

      const result = await getTenantSubscription('rest-1', 'RESTAURANT')

      expect(result).not.toBeNull()
      expect(result.plan_name).toBe('Free')
      expect(result.limits.chats_per_day).toBe(10)
    })

    it('creates free subscription when none exists and returns it', async () => {
      const { getTenantSubscription } = await import('./subscription.js')
      let fullSubCalls = 0
      mockQuery.mockImplementation(
        createSubscriptionQueryRouter({
          subId: { rows: [] },
          plan: { rows: [{ id: 'plan-free', name: 'Free', code: 'free' }] },
          fullSub: () => {
            fullSubCalls += 1
            if (fullSubCalls === 1) return { rows: [] }
            return {
              rows: [
                subscriptionRow({
                  id: 'sub-new',
                  tenant_id: 'supp-1',
                  tenant_type: 'SUPPLIER',
                  plan_name: 'Free',
                  plan_display_name: 'Free',
                  limits: { chats_per_day: 10 },
                  features: {},
                }),
              ],
            }
          },
        })
      )

      const result = await getTenantSubscription('supp-1', 'SUPPLIER')

      expect(result).not.toBeNull()
      expect(result.plan_name).toBe('Free')
      expect(mockCreatePendingActivation).toHaveBeenCalledWith(
        expect.any(Function),
        'supp-1',
        'SUPPLIER',
        'free'
      )
    })
  })

  describe('countSupplierActiveCustomerLocationsMonthly', () => {
    it('counts distinct customer branches during the supplier subscription period', async () => {
      const { countSupplierActiveCustomerLocationsMonthly } = await import('./subscription.js')
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              current_period_start: '2026-07-01T00:00:00.000Z',
              current_period_end: '2026-08-01T00:00:00.000Z',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '42' }] })

      const result = await countSupplierActiveCustomerLocationsMonthly('supplier-1')

      expect(result.count).toBe(42)
      expect(result.period).toMatchObject({
        source: 'subscription_period',
        timezone: 'UTC',
      })
      const countCall = mockQuery.mock.calls[1]
      expect(countCall[0]).toMatch(/COUNT\(DISTINCT COALESCE\(o\.branch_id, o\.restaurant_id\)\)/)
      expect(countCall[0]).toMatch(/COALESCE\(o\.placed_at, o\.created_at\) >= \$3/)
      expect(countCall[0]).toMatch(/COALESCE\(o\.placed_at, o\.created_at\) < \$4/)
      expect(countCall[1]).toEqual([
        'supplier-1',
        expect.arrayContaining(['ACKNOWLEDGED', 'PROCESSING', 'SHIPPED', 'DELIVERED']),
        '2026-07-01T00:00:00.000Z',
        '2026-08-01T00:00:00.000Z',
      ])
      expect(countCall[1][1]).not.toEqual(
        expect.arrayContaining(['DRAFT', 'PLACED', 'CANCELLED', 'REJECTED'])
      )
    })

    it('falls back to the current UTC calendar month when subscription period is unavailable', async () => {
      const { countSupplierActiveCustomerLocationsMonthly } = await import('./subscription.js')
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })

      const result = await countSupplierActiveCustomerLocationsMonthly('supplier-1')

      expect(result.count).toBe(3)
      expect(result.period).toMatchObject({
        source: 'calendar_month_utc',
        timezone: 'UTC',
      })
      const countCall = mockQuery.mock.calls[1]
      expect(countCall[0]).toMatch(/date_trunc\('month', now\(\) AT TIME ZONE 'UTC'\)/)
      expect(countCall[1]).toHaveLength(2)
    })
  })
  it('blocks supplier-initiated customer activation when active locations are at the cap', async () => {
    const { assertSupplierActiveCustomerLocationCapacity } = await import('./subscription.js')
    const supplierSub = subscriptionRow({
      tenant_id: 'supplier-1',
      tenant_type: 'SUPPLIER',
      plan_id: 'plan-growth',
      plan_name: 'Supplier Growth',
      plan_code: 'gold',
      plan_display_name: 'Supplier Growth',
      limits: { active_customer_locations_monthly: 50 },
    })
    mockQuery.mockImplementation((sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('plan_limit_override') || text.includes('tenant_limit_override')) {
        return Promise.resolve({ rows: [] })
      }
      if (text.includes('pending_plan_id') && text.includes('FROM subscription')) {
        return Promise.resolve({ rows: [subscriptionIdRow({ plan_id: 'plan-growth' })] })
      }
      if (text.includes('FROM subscription s') && text.includes('JOIN subscription_plan')) {
        return Promise.resolve({ rows: [supplierSub] })
      }
      if (text.includes('current_period_start') && text.includes('current_period_end')) {
        return Promise.resolve({
          rows: [
            {
              current_period_start: '2026-07-01T00:00:00.000Z',
              current_period_end: '2026-08-01T00:00:00.000Z',
            },
          ],
        })
      }
      if (text.includes('COUNT(DISTINCT COALESCE(o.branch_id, o.restaurant_id))')) {
        return Promise.resolve({ rows: [{ count: '50' }] })
      }
      if (text.includes('FROM subscription_plan') && text.includes("code != 'free'")) {
        return Promise.resolve({ rows: [{ code: 'platinum', name: 'Supplier Scale' }] })
      }
      return Promise.resolve({ rows: [] })
    })

    await expect(
      assertSupplierActiveCustomerLocationCapacity('supplier-1', {
        action: 'growth.connection_request',
      })
    ).rejects.toMatchObject({
      name: 'LimitExceededError',
      code: 'LIMIT_EXCEEDED',
      status: 403,
      details: expect.objectContaining({
        limitKey: 'active_customer_locations_monthly',
        limitValue: 50,
        currentUsage: 50,
        currentPlan: 'Supplier Growth',
        recommendedPlans: ['Supplier Scale'],
      }),
    })
    expect(mockRecordConversionEvent).toHaveBeenCalledWith(
      'supplier-1',
      'SUPPLIER',
      'BLOCKED_LIMIT',
      {
        limitKey: 'active_customer_locations_monthly',
        current: 50,
        limit: 50,
        action: 'growth.connection_request',
      }
    )
  })

  it('allows supplier customer activation while active locations remain below the cap', async () => {
    const { assertSupplierActiveCustomerLocationCapacity } = await import('./subscription.js')
    const supplierSub = subscriptionRow({
      tenant_id: 'supplier-1',
      tenant_type: 'SUPPLIER',
      plan_id: 'plan-growth',
      plan_name: 'Supplier Growth',
      plan_code: 'gold',
      limits: { active_customer_locations_monthly: 50 },
    })
    mockQuery.mockImplementation((sql) => {
      const text = typeof sql === 'string' ? sql : ''
      if (text.includes('plan_limit_override') || text.includes('tenant_limit_override')) {
        return Promise.resolve({ rows: [] })
      }
      if (text.includes('pending_plan_id') && text.includes('FROM subscription')) {
        return Promise.resolve({ rows: [subscriptionIdRow({ plan_id: 'plan-growth' })] })
      }
      if (text.includes('FROM subscription s') && text.includes('JOIN subscription_plan')) {
        return Promise.resolve({ rows: [supplierSub] })
      }
      if (text.includes('current_period_start') && text.includes('current_period_end')) {
        return Promise.resolve({ rows: [] })
      }
      if (text.includes('COUNT(DISTINCT COALESCE(o.branch_id, o.restaurant_id))')) {
        return Promise.resolve({ rows: [{ count: '49' }] })
      }
      return Promise.resolve({ rows: [] })
    })

    const result = await assertSupplierActiveCustomerLocationCapacity('supplier-1')

    expect(result).toMatchObject({ current: 49, limit: 50, isOverLimit: false })
    expect(mockRecordConversionEvent).not.toHaveBeenCalled()
  })
  describe('checkLimit', () => {
    it('returns isOverLimit when no subscription', async () => {
      const { checkLimit } = await import('./subscription.js')
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })

      const result = await checkLimit('tenant-1', 'SUPPLIER', 'chats_per_day')

      expect(result.isOverLimit).toBe(true)
      expect(result.limit).toBe(0)
      expect(result.current).toBe(0)
    })

    it('returns limit info from subscription and usage_meter', async () => {
      const { checkLimit } = await import('./subscription.js')
      mockQuery.mockImplementation(
        createSubscriptionQueryRouter({
          subId: { rows: [subscriptionIdRow({ plan_id: 'p1' })] },
          fullSub: {
            rows: [
              subscriptionRow({
                tenant_id: 'tenant-1',
                tenant_type: 'SUPPLIER',
                plan_id: 'p1',
                limits: { chats_per_day: 10 },
              }),
            ],
          },
          usage: { rows: [{ current_value: 3 }] },
        })
      )

      const result = await checkLimit('tenant-1', 'SUPPLIER', 'chats_per_day')

      expect(result.isOverLimit).toBe(false)
      expect(result.current).toBe(3)
      expect(result.limit).toBe(10)
    })

    it('applies Free-tier limit patches when plan JSON omits keys (not unlimited)', async () => {
      const { checkLimit } = await import('./subscription.js')
      mockQuery.mockImplementation(
        createSubscriptionQueryRouter({
          subId: { rows: [subscriptionIdRow({ plan_id: 'p-free' })] },
          fullSub: {
            rows: [
              subscriptionRow({
                tenant_id: 'rest-1',
                tenant_type: 'RESTAURANT',
                plan_id: 'p-free',
                plan_code: 'free',
                limits: {},
              }),
            ],
          },
          usage: { rows: [{ current_value: 0 }] },
        })
      )

      const result = await checkLimit('rest-1', 'RESTAURANT', 'orders_per_day')

      expect(result.isUnlimited).toBe(false)
      expect(result.limit).toBe(3)
    })

    it('fails closed when limit resolution throws', async () => {
      const { checkLimit } = await import('./subscription.js')
      let calls = 0
      mockQuery.mockImplementation((sql) => {
        calls += 1
        if (calls <= 2) {
          return createSubscriptionQueryRouter({
            subId: { rows: [subscriptionIdRow({ plan_id: 'p1' })] },
            fullSub: {
              rows: [
                subscriptionRow({
                  tenant_id: 'tenant-1',
                  tenant_type: 'SUPPLIER',
                  plan_id: 'p1',
                  limits: { chats_per_day: 10 },
                }),
              ],
            },
          })(sql)
        }
        return Promise.reject(new Error('db down'))
      })

      const result = await checkLimit('tenant-1', 'SUPPLIER', 'chats_per_day')

      expect(result.resolutionError).toBe(true)
      expect(result.isUnlimited).toBe(false)
      expect(result.isOverLimit).toBe(true)
      expect(result.limit).toBe(0)
    })
  })

  describe('recommendPlan', () => {
    it('returns tenant default Growth plan when no entitlements (synthetic)', async () => {
      const { recommendPlan } = await import('./subscription.js')
      mockQuery.mockReset()
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] })

      const result = await recommendPlan({ tenantId: 't1', tenantType: 'RESTAURANT' })

      expect(result.recommendedPlanCode).toBe('silver')
      expect(result.recommendedPlanName).toBe('Restaurant Growth')
      expect(result.reasonCode).toBe('FREE_DEFAULT')
      expect(result.reasonText).toBeDefined()
      expect(result.evidence).toBeDefined()
      expect(result.evidence.tenantType).toBe('RESTAURANT')
      expect(result.evidence.currentPlanCode).toBe('free')
      expect(result.comparedToCurrent).toBeDefined()
      expect(Array.isArray(result.comparedToCurrent.resolvesLimits)).toBe(true)
      expect(Array.isArray(result.comparedToCurrent.unlocksFeatures)).toBe(true)
    })

    it('returns CURRENT_BEST when on platinum', async () => {
      const { recommendPlan } = await import('./subscription.js')
      mockQuery.mockReset()
      const subRow = {
        id: 's1',
        plan_id: 'p4',
        plan_name: 'Platinum',
        plan_code: 'platinum',
        limits: { orders_per_day: -1 },
        features: { reports: true },
        tenant_type: 'RESTAURANT',
        plan_tenant_type: 'RESTAURANT',
        plan_price_per_month: 349,
        plan_price_per_year: 3490,
      }
      const planRows = [
        { code: 'free', name: 'Free', limits: {}, features: {} },
        { code: 'silver', name: 'Silver', limits: {}, features: {} },
        { code: 'gold', name: 'Gold', limits: {}, features: {} },
        {
          code: 'platinum',
          name: 'Platinum',
          limits: { orders_per_day: -1 },
          features: { reports: true },
        },
      ]
      mockQuery.mockImplementation((sql) => {
        if (typeof sql !== 'string') return Promise.resolve({ rows: [] })
        if (sql.includes('subscription s') && sql.includes('JOIN subscription_plan'))
          return Promise.resolve({ rows: [subRow] })
        if (sql.includes('tenant_limit_override')) return Promise.resolve({ rows: [] })
        if (
          sql.includes('meter_type') &&
          sql.includes('current_value') &&
          sql.includes('usage_meter')
        )
          return Promise.resolve({ rows: [] })
        if (
          sql.includes('subscription_plan') &&
          sql.includes('tenant_type') &&
          sql.includes('display_order')
        )
          return Promise.resolve({ rows: planRows })
        return Promise.resolve({ rows: [{ c: 0, current_value: 0 }] })
      })

      const result = await recommendPlan({ tenantId: 'rest-1', tenantType: 'RESTAURANT' })

      expect(result.recommendedPlanCode).toBe('platinum')
      expect(result.reasonCode).toBe('CURRENT_BEST')
      expect(result.evidence.currentPlanCode).toBe('platinum')
    })

    it('returns object with recommendedPlanCode, reasonCode, evidence, comparedToCurrent', async () => {
      const { recommendPlan } = await import('./subscription.js')
      mockQuery.mockReset()
      const subRow = {
        id: 's1',
        plan_id: 'p1',
        plan_name: 'Free',
        plan_code: 'free',
        limits: { orders_per_day: 3 },
        features: { reports: false },
        tenant_type: 'RESTAURANT',
        plan_tenant_type: 'RESTAURANT',
        plan_price_per_month: 0,
        plan_price_per_year: null,
      }
      mockQuery.mockImplementation((sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('plan_limit_override') || text.includes('tenant_limit_override')) {
          return Promise.resolve({ rows: [] })
        }
        if (text.includes('pending_plan_id') && text.includes('FROM subscription')) {
          return Promise.resolve({
            rows: [{ id: 's1', plan_id: 'p1', pending_plan_id: null, pending_effective_at: null }],
          })
        }
        if (text.includes('FROM subscription s') && text.includes('JOIN subscription_plan')) {
          return Promise.resolve({ rows: [subRow] })
        }
        if (text.includes('FROM subscription_plan') && text.includes('is_active')) {
          return Promise.resolve({
            rows: [
              { code: 'free', name: 'Free', limits: { orders_per_day: 3 }, features: {} },
              { code: 'silver', name: 'Silver', limits: { orders_per_day: 20 }, features: {} },
              { code: 'gold', name: 'Gold', limits: { orders_per_day: 50 }, features: {} },
              { code: 'platinum', name: 'Platinum', limits: { orders_per_day: -1 }, features: {} },
            ],
          })
        }
        if (text.includes('COUNT(*)') || text.includes('current_value')) {
          return Promise.resolve({ rows: [{ c: 0, current_value: 0 }] })
        }
        return Promise.resolve({ rows: [] })
      })

      const result = await recommendPlan({ tenantId: 'rest-1', tenantType: 'RESTAURANT' })

      expect(result).toHaveProperty('recommendedPlanCode')
      expect(result).toHaveProperty('recommendedPlanName')
      expect(result).toHaveProperty('reasonCode')
      expect(result).toHaveProperty('reasonText')
      expect(result).toHaveProperty('evidence')
      expect(result.evidence).toHaveProperty('tenantType')
      expect(result.evidence).toHaveProperty('currentPlanCode')
      expect(result.evidence).toHaveProperty('blocked')
      expect(result.comparedToCurrent).toHaveProperty('resolvesLimits')
      expect(result.comparedToCurrent).toHaveProperty('unlocksFeatures')
      expect(Array.isArray(result.comparedToCurrent.resolvesLimits)).toBe(true)
      expect(Array.isArray(result.comparedToCurrent.unlocksFeatures)).toBe(true)
    })
  })

  describe('getEntitlements', () => {
    it('applies overrides to limits and excludes expired', async () => {
      const { getEntitlements } = await import('./subscription.js')
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
      }
      mockQuery.mockImplementation((sql, params) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('plan_limit_override') && text.includes('ANY')) {
          return Promise.resolve({ rows: [] })
        }
        if (text.includes('tenant_limit_override') && text.includes('ANY')) {
          return Promise.resolve({
            rows: [
              {
                limit_type: 'chats_per_day',
                override_value: 20,
                is_active: true,
                expiration_date: null,
                reason: 'promo',
                id: 'o1',
              },
            ],
          })
        }
        if (text.includes('plan_limit_override')) return Promise.resolve({ rows: [] })
        if (text.includes('tenant_limit_override')) return Promise.resolve({ rows: [] })
        if (text.includes('pending_plan_id') && text.includes('FROM subscription'))
          return Promise.resolve({
            rows: [
              { id: 'sub-1', plan_id: 'p1', pending_plan_id: null, pending_effective_at: null },
            ],
          })
        if (text.includes('FROM subscription s') && text.includes('JOIN subscription_plan'))
          return Promise.resolve({ rows: [subRow] })
        if (text.includes('COUNT(*)') || text.includes('current_value'))
          return Promise.resolve({ rows: [{ c: 0, current_value: 5 }] })
        return Promise.resolve({ rows: [] })
      })

      const result = await getEntitlements('tenant-1', 'SUPPLIER')

      expect(result).not.toBeNull()
      expect(result.limits.chats_per_day).toBe(20)
      expect(result.overrides).toHaveLength(1)
    })

    it('includes smartReorder block for restaurant with full_90day_trends', async () => {
      const { getEntitlements } = await import('./subscription.js')
      const subRow = {
        id: 'sub-rest',
        plan_id: 'plan-gold',
        plan_name: 'Gold',
        plan_code: 'gold',
        limits: { ai_requests_per_day: 20 },
        features: { smart_reorder: 'full_90day_trends', ai_platform: true },
        tenant_type: 'RESTAURANT',
        plan_display_name: 'Gold',
        plan_price_per_month: 149,
        plan_price_per_year: null,
        plan_tenant_type: 'RESTAURANT',
        pending_plan_id: null,
        pending_effective_at: null,
      }
      mockResolveAllFeatures.mockResolvedValueOnce({
        features: { smart_reorder: 'full_90day_trends', ai_platform: true },
        featureSources: {},
      })
      mockQuery.mockImplementation((sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('plan_limit_override') || text.includes('tenant_limit_override')) {
          return Promise.resolve({ rows: [] })
        }
        if (text.includes('pending_plan_id') && text.includes('FROM subscription')) {
          return Promise.resolve({
            rows: [
              {
                id: 'sub-rest',
                plan_id: 'plan-gold',
                pending_plan_id: null,
                pending_effective_at: null,
              },
            ],
          })
        }
        if (text.includes('FROM subscription s') && text.includes('JOIN subscription_plan')) {
          return Promise.resolve({ rows: [subRow] })
        }
        if (text.includes('COUNT') || text.includes('current_value')) {
          return Promise.resolve({ rows: [{ c: 0, current_value: 0 }] })
        }
        return Promise.resolve({ rows: [] })
      })

      const result = await getEntitlements('rest-1', 'RESTAURANT')

      expect(result).not.toBeNull()
      expect(result.smartReorder).toMatchObject({
        tier: 'gold',
        capabilities: {
          assistance: true,
          forecast: true,
          forecast90d: true,
          seasonality: false,
          llmExplain: true,
          nlAsk: false,
        },
        aiPlatformEnabled: true,
      })
    })
  })

  describe('evaluateScheduledOrderLimit', () => {
    beforeEach(async () => {
      const { invalidateTenantSubscriptionCache } = await import('./subscription.js')
      await invalidateTenantSubscriptionCache('rest-1', 'RESTAURANT')
    })

    function mockCheckLimitQueries(limits, orderCount, graceUsed = 0) {
      const row = subscriptionRow({
        tenant_id: 'rest-1',
        tenant_type: 'RESTAURANT',
        plan_id: 'p1',
        limits,
        plan_code: 'free',
      })
      mockQuery.mockImplementation(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('pending_plan_id') && text.includes('FROM subscription')) {
          return { rows: [subscriptionIdRow({ plan_id: 'p1' })] }
        }
        if (text.includes('JOIN subscription_plan')) {
          return { rows: [row] }
        }
        if (text.includes('customer_order') && text.includes('COUNT')) {
          return { rows: [{ count: orderCount }] }
        }
        if (text.includes('scheduled_order_grace_per_day')) {
          return { rows: graceUsed > 0 ? [{ current_value: graceUsed }] : [] }
        }
        if (text.includes('usage_meter')) {
          return { rows: graceUsed > 0 ? [{ current_value: graceUsed }] : [] }
        }
        return { rows: [] }
      })
    }

    it('allows scheduled orders when under the daily cap', async () => {
      const { evaluateScheduledOrderLimit } = await import('./subscription.js')
      mockCheckLimitQueries({ orders_per_day: 3, scheduled_order_grace_per_day: 1 }, 2, 1)

      const result = await evaluateScheduledOrderLimit('rest-1', 1)

      expect(result.allowed).toBe(true)
      expect(result.usesGrace).toBe(false)
    })

    it('allows one grace order on Free when daily cap is reached', async () => {
      const { evaluateScheduledOrderLimit } = await import('./subscription.js')
      mockCheckLimitQueries({ orders_per_day: 3, scheduled_order_grace_per_day: 1 }, 3, 0)

      const result = await evaluateScheduledOrderLimit('rest-1', 1)

      expect(result.allowed).toBe(true)
      expect(result.usesGrace).toBe(true)
      expect(result.excess).toBe(1)
    })

    it('blocks when grace is already used for the day', async () => {
      const { evaluateScheduledOrderLimit } = await import('./subscription.js')
      mockCheckLimitQueries({ orders_per_day: 3, scheduled_order_grace_per_day: 1 }, 3, 1)

      const result = await evaluateScheduledOrderLimit('rest-1', 1)

      expect(result.allowed).toBe(false)
      expect(result.usesGrace).toBe(false)
    })
  })

  describe('invalidateTenantSubscriptionCache', () => {
    beforeEach(async () => {
      const { deleteCache } = await import('./cache.js')
      deleteCache.mockClear()
      mockInvalidateBillingSubscriptionCache.mockClear()
    })

    it('clears sub, ent, and billingSub caches', async () => {
      const { deleteCache } = await import('./cache.js')
      const { invalidateTenantSubscriptionCache } = await import('./subscription.js')

      await invalidateTenantSubscriptionCache('t1', 'RESTAURANT')

      expect(deleteCache).toHaveBeenCalledWith('sub:RESTAURANT:t1')
      expect(deleteCache).toHaveBeenCalledWith('ent:RESTAURANT:t1')
      expect(mockInvalidateBillingSubscriptionCache).toHaveBeenCalledWith('t1', 'RESTAURANT')
    })
  })

  describe('AI usage metering', () => {
    it('uses a total trial pool for free trial LLM requests', async () => {
      const { reserveAiUsage } = await import('./subscription.js')
      const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
      mockQuery.mockImplementation(
        createSubscriptionQueryRouter({
          subId: { rows: [subscriptionIdRow()] },
          fullSub: {
            rows: [
              subscriptionRow({
                tenant_id: 'rest-1',
                plan_code: 'free',
                current_period_start: '2026-07-15T00:00:00.000Z',
                free_sandbox_expires_at: expiresAt,
              }),
            ],
          },
          fallback: (sql) => {
            if (String(sql).includes('UPDATE usage_meter')) {
              return { rows: [{ current_value: 1 }] }
            }
            return { rows: [] }
          },
        })
      )

      const result = await reserveAiUsage('rest-1', 'RESTAURANT', 1)

      expect(result).toEqual(
        expect.objectContaining({
          allowed: true,
          meterType: 'ai_trial_requests_total',
          periodType: 'trial_total',
          limit: 50,
          trialPool: true,
        })
      )
      const insertCall = mockQuery.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('Billing Cycle')
      )
      expect(insertCall?.[0]).toContain('Billing Cycle')
      expect(insertCall?.[1]?.[2]).toBe('ai_trial_requests_total')
    })

    it('reports trial AI usage with reset at trial expiry', async () => {
      const { getAiUsageSummary } = await import('./subscription.js')
      const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
      mockQuery.mockImplementation(
        createSubscriptionQueryRouter({
          subId: { rows: [subscriptionIdRow()] },
          fullSub: {
            rows: [
              subscriptionRow({
                tenant_id: 'rest-1',
                plan_code: 'free',
                current_period_start: '2026-07-15T00:00:00.000Z',
                free_sandbox_expires_at: expiresAt,
              }),
            ],
          },
          usage: { rows: [{ current_value: 7 }] },
        })
      )

      const result = await getAiUsageSummary('rest-1', 'RESTAURANT')

      expect(result).toEqual(
        expect.objectContaining({
          meterType: 'ai_trial_requests_total',
          periodType: 'trial_total',
          current: 7,
          limit: 50,
          remaining: 43,
          resetAt: expiresAt,
          trialPool: true,
        })
      )
    })
  })
})
