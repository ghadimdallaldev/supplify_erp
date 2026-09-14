import { describe, it, expect, vi, beforeEach } from 'vitest'

const queryMock = vi.fn()

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('./recipe-recalc-queue.service.js', () => ({
  markRecipeRecalcDirty: vi.fn(),
}))

const PRODUCT_ID = '33333333-3333-4333-8333-333333333333'
const RESTAURANT_A = '11111111-1111-4111-8111-111111111111'

describe('recipe-price-impact.service', () => {
  beforeEach(() => {
    queryMock.mockReset()
    queryMock.mockImplementation(async (sql) => {
      if (String(sql).includes('FROM product WHERE')) {
        return { rows: [{ id: PRODUCT_ID, name: 'Tomatoes', supplier_id: 'sup-1' }] }
      }
      return { rows: [] }
    })
  })

  describe('propagateCatalogPriceChange', () => {
    it('fans out to all restaurants using the product when no restaurantId', async () => {
      const { propagateCatalogPriceChange } = await import('./recipe-price-impact.service.js')

      await propagateCatalogPriceChange(PRODUCT_ID, 9.5, 'CATALOG', null, queryMock)

      const restaurantQueryCall = queryMock.mock.calls.find((call) =>
        String(call[0]).includes('DISTINCT r.restaurant_id')
      )
      expect(restaurantQueryCall).toBeDefined()
      expect(String(restaurantQueryCall[0])).not.toContain('r.restaurant_id = $2')
      expect(restaurantQueryCall[1]).toEqual([PRODUCT_ID])
    })

    it('scopes CONTRACT propagation to the provided restaurant only', async () => {
      const { propagateCatalogPriceChange } = await import('./recipe-price-impact.service.js')

      await propagateCatalogPriceChange(PRODUCT_ID, 8, 'CONTRACT', RESTAURANT_A, queryMock)

      const restaurantQueryCall = queryMock.mock.calls.find((call) =>
        String(call[0]).includes('DISTINCT r.restaurant_id')
      )
      expect(String(restaurantQueryCall[0])).toContain('r.restaurant_id = $2')
      expect(restaurantQueryCall[1]).toEqual([PRODUCT_ID, RESTAURANT_A])
    })
  })
})
