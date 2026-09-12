import { describe, expect, it, vi } from 'vitest'
import { formatStoreDealLabel, getActiveStoreWideDealsBatch } from './store-deals.service.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

describe('store-deals.service', () => {
  describe('formatStoreDealLabel', () => {
    it('formats percentage and fixed store-wide labels', () => {
      expect(formatStoreDealLabel('percentage_discount', 15)).toBe('15% off')
      expect(formatStoreDealLabel('fixed_discount', 25)).toBe('$25.00 off')
      expect(formatStoreDealLabel('buy_x_get_y', 1)).toBeNull()
    })
  })

  describe('getActiveStoreWideDealsBatch', () => {
    it('returns empty map when no supplier ids', async () => {
      const { query } = await import('../lib/db.js')
      const map = await getActiveStoreWideDealsBatch([])
      expect(map.size).toBe(0)
      expect(query).not.toHaveBeenCalled()
    })

    it('batch-loads best store-wide deal per supplier', async () => {
      const { query } = await import('../lib/db.js')
      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            supplier_id: 'sup-1',
            id: 'deal-1',
            type: 'percentage_discount',
            discount_value: 20,
          },
          {
            supplier_id: 'sup-2',
            id: 'deal-2',
            type: 'fixed_discount',
            discount_value: 10,
          },
        ],
      })

      const map = await getActiveStoreWideDealsBatch(['sup-1', 'sup-2'], 'rest-1')

      expect(query).toHaveBeenCalledOnce()
      const [sql, params] = vi.mocked(query).mock.calls[0]
      expect(sql).toContain("p.applies_to = 'all'")
      expect(sql).toContain("p.type IN ('percentage_discount', 'fixed_discount')")
      expect(sql).toContain('promotion_restaurant_targets')
      expect(params).toEqual([['sup-1', 'sup-2'], 'rest-1'])

      expect(map.get('sup-1')).toEqual({
        id: 'deal-1',
        type: 'percentage_discount',
        discount_value: 20,
        label: '20% off',
      })
      expect(map.get('sup-2')).toEqual({
        id: 'deal-2',
        type: 'fixed_discount',
        discount_value: 10,
        label: '$10.00 off',
      })
    })
  })
})
