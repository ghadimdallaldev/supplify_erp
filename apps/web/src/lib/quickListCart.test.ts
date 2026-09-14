import { describe, expect, it } from 'vitest'
import { cartItemsFromQuickList, quickListItemToProduct } from './quickListCart'
import type { Product } from '../types'

const sampleItem = {
  product_id: 'prod-1',
  supplier_id: 'sup-1',
  quantity: '3.5',
  product_name: 'Olive Oil',
  product_sku: 'OO-1',
  product_unit: 'L',
  product_price: '12.5',
  supplier_name: 'Acme Foods',
  notes: 'extra virgin',
}

describe('quickListItemToProduct', () => {
  it('maps API list-item joins into a cart Product', () => {
    expect(quickListItemToProduct(sampleItem)).toEqual({
      id: 'prod-1',
      supplier_id: 'sup-1',
      sku: 'OO-1',
      name: 'Olive Oil',
      unit: 'L',
      current_price: 12.5,
      supplier_name: 'Acme Foods',
      created_at: '',
      updated_at: '',
    })
  })

  it('returns null when product or supplier id is missing', () => {
    expect(quickListItemToProduct({ product_id: 'x' })).toBeNull()
    expect(quickListItemToProduct({ supplier_id: 'y' })).toBeNull()
  })
})

describe('cartItemsFromQuickList', () => {
  it('builds cart lines from list items without a catalog cache', () => {
    const items = cartItemsFromQuickList([sampleItem])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      productId: 'prod-1',
      quantity: 3.5,
      notes: 'extra virgin',
      product: { name: 'Olive Oil', supplier_id: 'sup-1', current_price: 12.5 },
    })
  })

  it('prefers richer catalog product when available', () => {
    const catalog: Product = {
      id: 'prod-1',
      supplier_id: 'sup-1',
      sku: 'OO-1',
      name: 'Olive Oil (catalog)',
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      moq: 2,
      current_price: 11,
    }
    const items = cartItemsFromQuickList([sampleItem], [catalog])
    expect(items[0].product.name).toBe('Olive Oil (catalog)')
    expect(items[0].product.moq).toBe(2)
    expect(items[0].quantity).toBe(3.5)
  })

  it('skips incomplete rows', () => {
    expect(cartItemsFromQuickList([{ product_id: 'only' }])).toEqual([])
  })
})
