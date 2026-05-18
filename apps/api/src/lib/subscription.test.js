import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.fn()
const mockCreatePendingActivation = vi.fn().mockResolvedValue(undefined)
vi.mock('./db.js', () => ({ query: (...args) => mockQuery(...args) }))
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('./billing/subscription-activation.js', () => ({
  createPendingActivationSubscription: (...args) => mockCreatePendingActivation(...args),
}))

describe('Subscription lib', () => {
  beforeEach(() => {
    mockQuery.mockReset()
    mockCreatePendingActivation.mockClear()
  })

  describe('getTenantSubscription', () => {
    it('returns subscription when one exists', async () => {
      const { getTenantSubscription } = await import('./subscription.js')
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              plan_id: 'plan-free',
              pending_plan_id: null,
              pending_effective_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              tenant_id: 'rest-1',
              tenant_type: 'RESTAURANT',
              plan_id: 'plan-free',
              plan_name: 'Free',
              limits: { chats_per_day: 10 },
              features: { chat: 'enabled' },
            },
          ],
        })

      const result = await getTenantSubscription('rest-1', 'RESTAURANT')

      expect(result).not.toBeNull()
      expect(result.plan_name).toBe('Free')
      expect(result.limits.chats_per_day).toBe(10)
    })

    it('creates free subscription when none exists and returns it', async () => {
      const { getTenantSubscription } = await import('./subscription.js')
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'plan-free', name: 'Free', code: 'free' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-new',
              plan_name: 'Free',
              plan_display_name: 'Free',
              limits: { chats_per_day: 10 },
              features: {},
            },
          ],
        })

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
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', plan_id: 'p1', pending_plan_id: null, pending_effective_at: null }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              limits: { chats_per_day: 10 },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ current_value: 3 }] })

      const result = await checkLimit('tenant-1', 'SUPPLIER', 'chats_per_day')

      expect(result.isOverLimit).toBe(false)
      expect(result.current).toBe(3)
      expect(result.limit).toBe(10)
    })
  })

  describe('recommendPlan', () => {
    it('returns gold when no entitlements (synthetic)', async () => {
      const { recommendPlan } = await import('./subscription.js')
      mockQuery.mockReset()
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] })

      const result = await recommendPlan({ tenantId: 't1', tenantType: 'RESTAURANT' })

      expect(result.recommendedPlanCode).toBe('gold')
      expect(result.recommendedPlanName).toBe('Gold')
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
        { code: 'bronze', name: 'Bronze', limits: {}, features: {} },
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
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 's1', plan_id: 'p1', pending_plan_id: null, pending_effective_at: null }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
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
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: 0 }] })
        .mockResolvedValueOnce({ rows: [{ c: 0 }] })
        .mockResolvedValueOnce({ rows: [{ c: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ current_value: 0 }] })
        .mockResolvedValueOnce({
          rows: [
            { code: 'free', name: 'Free', limits: { orders_per_day: 3 }, features: {} },
            { code: 'bronze', name: 'Bronze', limits: { orders_per_day: 20 }, features: {} },
            { code: 'gold', name: 'Gold', limits: { orders_per_day: 50 }, features: {} },
            { code: 'platinum', name: 'Platinum', limits: { orders_per_day: -1 }, features: {} },
          ],
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
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'sub-1', plan_id: 'p1', pending_plan_id: null, pending_effective_at: null }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sub-1',
              plan_id: 'p1',
              plan_name: 'Free',
              plan_code: 'free',
              limits: { chats_per_day: 10 },
              features: {},
              tenant_type: 'SUPPLIER',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              limitKey: 'chats_per_day',
              value: 20,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ c: 0 }] })
        .mockResolvedValueOnce({ rows: [{ c: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ current_value: 5 }] })

      const result = await getEntitlements('tenant-1', 'SUPPLIER')

      expect(result).not.toBeNull()
      expect(result.limits.chats_per_day).toBe(20)
      expect(result.overrides).toHaveLength(1)
    })
  })
})
