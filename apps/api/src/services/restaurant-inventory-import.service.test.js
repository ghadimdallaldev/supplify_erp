import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  parseRestaurantInventoryImportCsv,
  previewRestaurantInventoryImport,
  INVENTORY_IMPORT_TEMPLATE,
} from './restaurant-inventory-import.service.js'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}))

vi.mock('../lib/subscription.js', () => ({
  checkLimit: vi.fn().mockResolvedValue({
    current: 0,
    limit: 100,
    effectiveLimit: 100,
    isOverLimit: false,
    isUnlimited: false,
  }),
}))

vi.mock('./reorder-forecast-cache.service.js', () => ({
  markReorderForecastDirty: vi.fn(),
}))

import { query } from '../lib/db.js'

describe('restaurant-inventory-import.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    query.mockImplementation(async (sql) => {
      if (sql.includes('restaurant_inventory WHERE restaurant_id')) {
        return { rows: [] }
      }
      if (sql.includes('lower(trim(sku))')) {
        return {
          rows: [{ id: '11111111-1111-4111-8111-111111111111', sku: 'RICE-5KG', name: 'Rice 5kg' }],
        }
      }
      if (sql.includes('product WHERE id')) {
        return {
          rows: [
            { id: '22222222-2222-4222-8222-222222222222', sku: 'OIL-1L', name: 'Cooking Oil' },
          ],
        }
      }
      return { rows: [] }
    })
  })

  it('parses template CSV', () => {
    const { rows } = parseRestaurantInventoryImportCsv(INVENTORY_IMPORT_TEMPLATE)
    expect(rows).toHaveLength(3)
    expect(rows[0].raw.sku).toBe('RICE-5KG')
    expect(rows[0].raw.quantity).toBe('25')
    expect(rows[0].raw.reason).toBe('Opening stock count')
  })

  it('flags missing identifier and quantity in preview', async () => {
    const csv = `sku,quantity\n,10\nRICE-5KG,`
    const result = await previewRestaurantInventoryImport('restaurant-1', csv)
    expect(result.errorCount).toBe(2)
    expect(result.validCount).toBe(0)
  })

  it('resolves SKU and product_id rows in preview', async () => {
    const skuCsv = `sku,quantity\nRICE-5KG,4`
    const skuResult = await previewRestaurantInventoryImport('restaurant-1', skuCsv)
    expect(skuResult.validCount).toBe(1)
    expect(skuResult.preview[0].mapped.productName).toBe('Rice 5kg')

    const idCsv = `product_id,quantity\n22222222-2222-4222-8222-222222222222,6`
    const idResult = await previewRestaurantInventoryImport('restaurant-1', idCsv)
    expect(idResult.validCount).toBe(1)
    expect(idResult.preview[0].mapped.sku).toBe('OIL-1L')
  })

  it('accepts quoted fields with commas', () => {
    const csv = `sku,quantity,reason\n"RICE, bulk",12,"Morning delivery, dock 2"`
    const { rows } = parseRestaurantInventoryImportCsv(csv)
    expect(rows[0].raw.sku).toBe('RICE, bulk')
    expect(rows[0].raw.reason).toBe('Morning delivery, dock 2')
  })
})
