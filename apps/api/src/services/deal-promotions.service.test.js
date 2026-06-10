import { beforeEach, describe, expect, it, vi } from 'vitest'

const subscriptionMocks = vi.hoisted(() => ({
  incrementUsage: vi.fn().mockResolvedValue(true),
  checkLimit: vi.fn().mockResolvedValue({
    current: 0,
    limit: 10,
    isUnlimited: false,
    isOverLimit: false,
  }),
  isFeatureEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/subscription.js', () => subscriptionMocks)

vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: 'interaction-1' }] }),
  withTransaction: vi.fn(),
}))

import {
  applyPromotionByIdToOrder,
  matchesRestaurantTargeting,
  matchesPromotionAudience,
} from './deal-promotions.service.js'

const { incrementUsage, checkLimit, isFeatureEnabled } = subscriptionMocks

describe('deal-promotions.service redemption metering', () => {
  beforeEach(() => {
    incrementUsage.mockClear()
    checkLimit.mockClear()
    isFeatureEnabled.mockClear()
    isFeatureEnabled.mockResolvedValue(true)
    checkLimit.mockResolvedValue({
      current: 0,
      limit: 10,
      isUnlimited: false,
      isOverLimit: false,
    })
  })

  it('increments deal_redemptions_per_day when a promotion is applied to an order', async () => {
    const restaurantId = '550e8400-e29b-41d4-a716-446655440002'
    const supplierId = '550e8400-e29b-41d4-a716-446655440001'
    const promotionId = 'promo-1111-4111-8111-111111111111'
    const orderId = 'order-2222-4222-8222-222222222222'
    const now = new Date()
    const promotion = {
      id: promotionId,
      supplier_id: supplierId,
      name: 'Demo 10% Off',
      type: 'percentage_discount',
      discount_value: 10,
      min_order_amount: null,
      max_discount_cap: null,
      applies_to: 'all',
      status: 'active',
      payment_status: 'not_required',
      starts_at: new Date(now.getTime() - 86400000).toISOString(),
      ends_at: new Date(now.getTime() + 86400000 * 30).toISOString(),
      boost_start_at: new Date(now.getTime() - 86400000).toISOString(),
      boost_end_at: new Date(now.getTime() + 86400000 * 7).toISOString(),
      usage_limit: null,
      usage_count: 0,
      target_product_ids: [],
      target_category_ids: [],
      restaurant_ids: [],
    }

    const client = {
      query: vi.fn(async (sql) => {
        const text = typeof sql === 'string' ? sql : ''
        if (text.includes('FROM promotions p') && text.includes('promotion_targets')) {
          return { rows: [promotion] }
        }
        if (text.includes('UPDATE customer_order SET total_amount')) {
          return { rows: [] }
        }
        if (text.includes('INSERT INTO promotion_usages')) {
          return { rows: [] }
        }
        if (text.includes('UPDATE promotions SET usage_count')) {
          return { rows: [] }
        }
        if (text.includes('FROM deal_promotions')) {
          return { rows: [] }
        }
        if (text.includes('INSERT INTO deal_interactions')) {
          return { rows: [] }
        }
        return { rows: [] }
      }),
    }

    const result = await applyPromotionByIdToOrder({
      client,
      promotionId,
      orderId,
      supplierId,
      restaurantId,
      subtotal: 100,
      lineItems: [{ quantity: 5, line_total: 100 }],
    })

    expect(result).toMatchObject({
      promotionId,
      discountAmount: 10,
    })
    expect(incrementUsage).toHaveBeenCalledTimes(1)
    expect(incrementUsage).toHaveBeenCalledWith(
      restaurantId,
      'RESTAURANT',
      'deal_redemptions_per_day',
      1
    )
  })
})

describe('deal-promotions.service targeting', () => {
  const restaurant = {
    business_type: 'fine_dining',
    city: 'Beirut',
    state: 'Mount Lebanon',
    country: 'Lebanon',
    address: 'Hamra Street',
  }

  describe('matchesRestaurantTargeting', () => {
    it('allows when no type or area filters (RST-75)', () => {
      expect(matchesRestaurantTargeting({}, restaurant)).toBe(true)
    })

    it('filters by restaurant business type', () => {
      const deal = { target_restaurant_types: ['fine_dining'] }
      expect(matchesRestaurantTargeting(deal, restaurant)).toBe(true)
      expect(
        matchesRestaurantTargeting({ target_restaurant_types: ['fast_food'] }, restaurant)
      ).toBe(false)
    })

    it('filters by geographic areas', () => {
      const deal = { target_areas: ['Beirut'] }
      expect(matchesRestaurantTargeting(deal, restaurant)).toBe(true)
      expect(matchesRestaurantTargeting({ target_areas: ['Dubai'] }, restaurant)).toBe(false)
    })

    it('parses JSON string targets from DB rows', () => {
      const deal = {
        target_restaurant_types: '["fine_dining"]',
        target_areas: '["Beirut"]',
      }
      expect(matchesRestaurantTargeting(deal, restaurant)).toBe(true)
    })
  })

  describe('matchesPromotionAudience', () => {
    it('matches all audiences when audience.all is true (RST-76 sponsored)', () => {
      expect(matchesPromotionAudience({ all: true }, restaurant)).toBe(true)
      expect(matchesPromotionAudience(null, restaurant)).toBe(true)
    })

    it('filters boost audience by restaurant type and area', () => {
      expect(
        matchesPromotionAudience(
          { restaurantTypes: ['fine_dining'], areas: ['Beirut'] },
          restaurant
        )
      ).toBe(true)
      expect(
        matchesPromotionAudience({ restaurantTypes: ['cafe'], areas: ['Beirut'] }, restaurant)
      ).toBe(false)
    })
  })
})
