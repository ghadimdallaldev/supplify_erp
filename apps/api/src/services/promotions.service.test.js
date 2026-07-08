import { describe, expect, it, vi } from 'vitest'
import { activeRestaurantDeal } from '../test/factories/deal-promotion.js'
import {
  calculatePromotionDiscount,
  filterEligibleLineItems,
  hasActiveSupplierOrderPromotions,
  isPromotionEligible,
  selectBestPromotion,
} from './promotions.service.js'

describe('promotions.service', () => {
  const basePromo = activeRestaurantDeal()

  describe('isPromotionEligible', () => {
    it('rejects inactive or expired promotions', () => {
      expect(isPromotionEligible({ ...basePromo, status: 'draft' })).toBe(false)
      expect(
        isPromotionEligible({
          ...basePromo,
          ends_at: '2020-01-01T00:00:00Z',
        })
      ).toBe(false)
    })

    it('enforces restaurant targeting', () => {
      const promo = { ...basePromo, restaurant_ids: ['r1'] }
      expect(isPromotionEligible(promo, { restaurantId: 'r2' })).toBe(false)
      expect(isPromotionEligible(promo, { restaurantId: 'r1' })).toBe(true)
    })

    it('skips when usage limit reached', () => {
      expect(isPromotionEligible({ ...basePromo, usage_limit: 5, usage_count: 5 })).toBe(false)
    })
  })

  describe('calculatePromotionDiscount', () => {
    const lines = [
      { productId: 'p1', categoryId: 'c1', quantity: 10, unitPrice: 5, lineTotal: 50 },
      { productId: 'p2', categoryId: 'c2', quantity: 2, unitPrice: 25, lineTotal: 50 },
    ]

    it('applies percentage discount with cap', () => {
      const discount = calculatePromotionDiscount(
        {
          ...basePromo,
          type: 'percentage_discount',
          discount_value: 10,
          max_discount_cap: 8,
          applies_to: 'all',
        },
        100,
        lines
      )
      expect(discount).toBe(8)
    })

    it('applies fixed discount up to subtotal', () => {
      const discount = calculatePromotionDiscount(
        {
          ...basePromo,
          type: 'fixed_discount',
          discount_value: 200,
          applies_to: 'all',
        },
        100,
        lines
      )
      expect(discount).toBe(100)
    })

    it('applies buy_x_get_y on eligible lines', () => {
      const promo = {
        ...basePromo,
        type: 'buy_x_get_y',
        buy_quantity: 5,
        get_quantity: 1,
        applies_to: 'specific_products',
        target_product_ids: ['p1'],
      }
      const discount = calculatePromotionDiscount(promo, 100, lines)
      expect(discount).toBe(10)
    })

    it('respects min order amount', () => {
      const discount = calculatePromotionDiscount(
        {
          ...basePromo,
          type: 'percentage_discount',
          discount_value: 20,
          min_order_amount: 500,
          applies_to: 'all',
        },
        100,
        lines
      )
      expect(discount).toBe(0)
    })
  })

  describe('filterEligibleLineItems', () => {
    it('filters by product targets', () => {
      const promo = {
        applies_to: 'specific_products',
        target_product_ids: ['p2'],
      }
      const filtered = filterEligibleLineItems(promo, [
        { productId: 'p1', lineTotal: 10 },
        { productId: 'p2', lineTotal: 20 },
      ])
      expect(filtered).toHaveLength(1)
      expect(filtered[0].productId).toBe('p2')
    })
  })

  describe('selectBestPromotion', () => {
    it('picks highest discount promotion', () => {
      const promos = [
        { ...basePromo, id: 'a', type: 'fixed_discount', discount_value: 5, applies_to: 'all' },
        {
          ...basePromo,
          id: 'b',
          type: 'percentage_discount',
          discount_value: 20,
          applies_to: 'all',
        },
      ]
      const result = selectBestPromotion(promos, 100, [])
      expect(result.promotion.id).toBe('b')
      expect(result.discountAmount).toBe(20)
    })

    it('ignores featured_listing for order discounts', () => {
      const promos = [
        { ...basePromo, id: 'f', type: 'featured_listing', discount_value: 99, applies_to: 'all' },
      ]
      expect(selectBestPromotion(promos, 100, [])).toBeNull()
    })
  })

  describe('hasActiveSupplierOrderPromotions', () => {
    it('accepts the pool query helper function', async () => {
      const queryFn = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })

      await expect(
        hasActiveSupplierOrderPromotions(queryFn, 'supplier-1', 'restaurant-1')
      ).resolves.toBe(true)

      expect(queryFn).toHaveBeenCalledOnce()
    })

    it('accepts a transaction client with query()', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      }

      await expect(
        hasActiveSupplierOrderPromotions(client, 'supplier-1', 'restaurant-1')
      ).resolves.toBe(false)
    })
  })

  describe('hasActiveSupplierOrderPromotionsBatch', () => {
    it('returns a map with promo flags per supplier', async () => {
      const queryFn = vi.fn().mockResolvedValue({
        rows: [{ supplier_id: 'supplier-1' }],
      })
      const { hasActiveSupplierOrderPromotionsBatch } = await import('./promotions.service.js')
      const result = await hasActiveSupplierOrderPromotionsBatch(
        queryFn,
        ['supplier-1', 'supplier-2'],
        'restaurant-1'
      )
      expect(result.get('supplier-1')).toBe(true)
      expect(result.get('supplier-2')).toBe(false)
      expect(queryFn).toHaveBeenCalledOnce()
    })
  })
})
