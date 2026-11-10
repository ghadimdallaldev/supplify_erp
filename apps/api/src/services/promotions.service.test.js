import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activeRestaurantDeal } from '../test/factories/deal-promotion.js'
const mockQuery = vi.hoisted(() => vi.fn())

vi.mock('../lib/db.js', () => ({
  query: (...args) => mockQuery(...args),
}))

import {
  calculatePromotionDiscount,
  filterEligibleLineItems,
  deactivateExpiredPromotions,
  hasActiveSupplierOrderPromotions,
  isPromotionEligible,
  selectBestPromotion,
} from './promotions.service.js'

describe('promotions.service', () => {
  beforeEach(() => {
    mockQuery.mockReset()
  })

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
  describe('deactivateExpiredPromotions', () => {
    it('activates scheduled promotions only for unlocked suppliers', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })

      await deactivateExpiredPromotions()

      const scheduledSql = String(mockQuery.mock.calls[0][0])
      expect(scheduledSql).toContain('FROM subscription sub')
      expect(scheduledSql).toContain('sub.tenant_id = promotions.supplier_id')
      expect(scheduledSql).toContain("sub.tenant_type = 'SUPPLIER'")
      expect(scheduledSql).toContain('sub.account_locked_at IS NULL')
    })
  })

  describe('releasePromotionUsageForOrder (B7)', () => {
    it('decrements usage_count once per redeemed promotion and marks the usage released', async () => {
      const { releasePromotionUsageForOrder } = await import('./promotions.service.js')
      const client = {
        query: vi.fn(async (sql) => {
          if (String(sql).includes('UPDATE promotion_usages')) {
            return { rows: [{ promotion_id: 'promo-1' }, { promotion_id: 'promo-1' }] }
          }
          return { rows: [], rowCount: 1 }
        }),
      }

      const result = await releasePromotionUsageForOrder(client, 'ord-1')

      expect(result).toEqual({ released: 2 })
      const mark = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE promotion_usages')
      )
      expect(String(mark[0])).toContain('released_at IS NULL')
      const decrement = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE promotions')
      )
      expect(String(decrement[0])).toContain('GREATEST(0, usage_count - $2)')
      expect(decrement[1]).toEqual(['promo-1', 2])
    })

    it('is idempotent: already-released usages decrement nothing', async () => {
      const { releasePromotionUsageForOrder } = await import('./promotions.service.js')
      const client = { query: vi.fn(async () => ({ rows: [] })) }

      const result = await releasePromotionUsageForOrder(client, 'ord-1')

      expect(result).toEqual({ released: 0 })
      expect(client.query).toHaveBeenCalledTimes(1)
    })
  })

  describe('applyBestPromotionToOrder', () => {
    const percentOff = {
      ...basePromo,
      id: 'promo-1',
      supplier_id: 'sup-1',
      name: '10% off',
      type: 'percentage_discount',
      discount_value: 10,
      usage_limit: 5,
      usage_count: 4,
      target_product_ids: [],
      target_category_ids: [],
      restaurant_ids: [],
    }

    function makeClient({ claimed = true } = {}) {
      return {
        query: vi.fn(async (sql) => {
          const text = String(sql)
          if (text.includes('FROM promotions p')) return { rows: [percentOff] }
          if (text.includes('UPDATE promotions') && text.includes('usage_count')) {
            return { rows: claimed ? [{ id: 'promo-1', usage_count: 5 }] : [] }
          }
          return { rows: [] }
        }),
      }
    }

    it('keeps QUOTE_PRICE lines in the order total: $1000 quote + $200 catalog at 10% = $1180 (B8)', async () => {
      const { applyBestPromotionToOrder } = await import('./promotions.service.js')
      const client = makeClient()
      const result = await applyBestPromotionToOrder({
        client,
        orderId: 'ord-1',
        supplierId: 'sup-1',
        restaurantId: 'rest-1',
        // Discount is computed on the promo-eligible (catalog) lines only...
        subtotal: 200,
        lineItems: [{ productId: 'p1', quantity: 1, unitPrice: 200, lineTotal: 200 }],
        // ...but the order total starts from the FULL subtotal, quote line included.
        orderSubtotal: 1200,
        skipDealPreflight: true,
      })

      expect(result.discountAmount).toBe(20)
      expect(result.totalAfterDiscount).toBe(1180)
      const totalUpdate = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE customer_order SET total_amount')
      )
      expect(totalUpdate[1]).toEqual([1180, 'ord-1'])
    })

    it('defaults the order total base to the discounted subtotal when no orderSubtotal is passed', async () => {
      const { applyBestPromotionToOrder } = await import('./promotions.service.js')
      const result = await applyBestPromotionToOrder({
        client: makeClient(),
        orderId: 'ord-1',
        supplierId: 'sup-1',
        restaurantId: 'rest-1',
        subtotal: 200,
        lineItems: [{ productId: 'p1', quantity: 1, unitPrice: 200, lineTotal: 200 }],
        skipDealPreflight: true,
      })
      expect(result.totalAfterDiscount).toBe(180)
    })

    it('claims usage atomically and writes nothing when the limit was hit concurrently (B12)', async () => {
      const { applyBestPromotionToOrder } = await import('./promotions.service.js')
      const client = makeClient({ claimed: false })
      const result = await applyBestPromotionToOrder({
        client,
        orderId: 'ord-1',
        supplierId: 'sup-1',
        restaurantId: 'rest-1',
        subtotal: 200,
        lineItems: [{ productId: 'p1', quantity: 1, unitPrice: 200, lineTotal: 200 }],
        skipDealPreflight: true,
      })

      expect(result).toBeNull()
      const claim = client.query.mock.calls.find(
        ([sql]) => String(sql).includes('UPDATE promotions') && String(sql).includes('usage_count')
      )
      expect(String(claim[0])).toContain('usage_limit IS NULL OR usage_count < usage_limit')
      expect(String(claim[0])).toContain('stock_quantity IS NULL OR usage_count < stock_quantity')
      expect(String(claim[0])).toContain('RETURNING')
      expect(
        client.query.mock.calls.some(([sql]) =>
          String(sql).includes('INSERT INTO promotion_usages')
        )
      ).toBe(false)
      expect(
        client.query.mock.calls.some(([sql]) =>
          String(sql).includes('UPDATE customer_order SET total_amount')
        )
      ).toBe(false)
    })
  })
})
