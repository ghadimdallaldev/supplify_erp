import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  resolveEffectiveLimit,
  discoverLimitKeys,
  fillMissingFreeTierLimits,
  formatPlanLimitDisplay,
  isLimitKeyApplicable,
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
} from './limit-resolution.js'

vi.mock('./db.js', () => ({
  query: vi.fn(),
}))

import { query } from './db.js'

describe('limit-resolution', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset()
  })

  it('returns plan default when no overrides exist', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [] })

    const result = await resolveEffectiveLimit({
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      limitKey: 'orders_per_day',
      planId: 'plan-1',
      planLimits: { orders_per_day: 3 },
    })

    expect(result.baseLimit).toBe(3)
    expect(result.effectiveLimit).toBe(3)
    expect(result.isUnlimited).toBe(false)
  })

  it('applies plan override when no tenant override', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ override_value: 20, is_active: true, expiration_date: null, id: 'po-1' }],
      })
      .mockResolvedValueOnce({ rows: [] })

    const result = await resolveEffectiveLimit({
      tenantId: 'tenant-1',
      tenantType: 'SUPPLIER',
      limitKey: 'supplier_products_skus',
      planId: 'plan-1',
      planLimits: { supplier_products_skus: 10 },
    })

    expect(result.effectiveLimit).toBe(20)
    expect(result.planOverride).toBeTruthy()
    expect(result.tenantOverride).toBeNull()
  })

  it('tenant override takes priority over plan override', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ override_value: 15, is_active: true, expiration_date: null, id: 'po-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ override_value: 50, is_active: true, expiration_date: null, id: 'to-1' }],
      })

    const result = await resolveEffectiveLimit({
      tenantId: 'tenant-1',
      tenantType: 'SUPPLIER',
      limitKey: 'supplier_products_skus',
      planId: 'plan-1',
      planLimits: { supplier_products_skus: 10 },
    })

    expect(result.effectiveLimit).toBe(50)
    expect(result.tenantOverride).toBeTruthy()
  })

  it('ignores expired and inactive overrides', async () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ override_value: 99, is_active: true, expiration_date: past, id: 'po-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ override_value: 88, is_active: false, expiration_date: null, id: 'to-1' }],
      })

    const result = await resolveEffectiveLimit({
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      limitKey: 'chats_per_day',
      planId: 'plan-1',
      planLimits: { chats_per_day: 3 },
    })

    expect(result.effectiveLimit).toBe(3)
  })

  it('override cannot reduce below plan default', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ override_value: 1, is_active: true, expiration_date: null, id: 'to-1' }],
      })

    const result = await resolveEffectiveLimit({
      tenantId: 'tenant-1',
      tenantType: 'RESTAURANT',
      limitKey: 'orders_per_day',
      planId: 'plan-1',
      planLimits: { orders_per_day: 20 },
    })

    expect(result.effectiveLimit).toBe(20)
  })

  it('discovers limit keys from plans and canonical lists', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        { tenant_type: 'RESTAURANT', limits: { orders_per_day: 3, custom_meter: 5 } },
        { tenant_type: 'SUPPLIER', limits: { promotions: 1 } },
      ],
    })

    const keys = await discoverLimitKeys()
    expect(keys).toContain('orders_per_day')
    expect(keys).toContain('custom_meter')
    expect(keys).toContain('promotions')
    expect(RESTAURANT_LIMIT_KEYS).toContain('deal_redemptions_per_day')
    expect(RESTAURANT_LIMIT_KEYS).toContain('open_conversations')
    expect(SUPPLIER_LIMIT_KEYS).toContain('open_conversations')
  })

  it('fills missing Free-tier supplier chat limits for settings UI', () => {
    const limits = {
      supplier_products_skus: 10,
      chats_per_day: 10,
      storage_mb: 50,
    }
    fillMissingFreeTierLimits(limits, 'SUPPLIER', 'free')
    expect(limits.open_conversations).toBe(1)
    expect(limits.chats_per_day).toBe(10)
    expect(limits.promotions).toBe(1)
  })

  it('does not patch paid tiers', () => {
    const limits = { chats_per_day: 50 }
    fillMissingFreeTierLimits(limits, 'SUPPLIER', 'gold')
    expect(limits.open_conversations).toBeUndefined()
  })

  it('keeps explicit restaurant deal redemption limits when set on Free tier', () => {
    const limits = { deal_redemptions_per_day: 2 }
    fillMissingFreeTierLimits(limits, 'RESTAURANT', 'free')
    expect(limits.deal_redemptions_per_day).toBe(2)
  })

  it('defaults Free Trial to 1 deal redemption per day when missing', () => {
    const limits = {}
    fillMissingFreeTierLimits(limits, 'RESTAURANT', 'free')
    expect(limits.deal_redemptions_per_day).toBe(1)
  })

  it('does not include supplier promotions meter on restaurant catalog', () => {
    expect(RESTAURANT_LIMIT_KEYS).not.toContain('promotions')
    expect(SUPPLIER_LIMIT_KEYS).toContain('promotions')
    expect(isLimitKeyApplicable('RESTAURANT', 'promotions')).toBe(false)
    expect(isLimitKeyApplicable('SUPPLIER', 'promotions')).toBe(true)
  })

  it('formatPlanLimitDisplay treats missing keys as n/a not unlimited', () => {
    expect(formatPlanLimitDisplay(undefined, { defined: false })).toBe('n/a')
    expect(formatPlanLimitDisplay(undefined, { defined: true })).toBe('unlimited')
    expect(formatPlanLimitDisplay(-1, { defined: true })).toBe('unlimited')
    expect(formatPlanLimitDisplay(10, { defined: true })).toBe('10')
  })
})
