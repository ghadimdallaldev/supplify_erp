import { beforeEach, describe, expect, it } from 'vitest'
import { readPublicCart, writePublicCart } from './publicSalesCart'

describe('public sales cart persistence', () => {
  beforeEach(() => window.localStorage.clear())

  it('persists only the separate public storefront cart', () => {
    writePublicCart({
      supplierLocationId: 'supplier-1',
      lines: [
        {
          supplierLocationId: 'supplier-1',
          quantity: 4,
          product: {
            id: 'product-1',
            supplierId: 'supplier-1',
            name: 'Produce box',
            sku: 'BOX-1',
            currentPrice: 12,
            orderable: true,
          },
        },
      ],
    })
    expect(readPublicCart()).toMatchObject({
      supplierLocationId: 'supplier-1',
      lines: [{ quantity: 4, product: { id: 'product-1' } }],
    })
  })

  it('removes storage when checkout clears the cart', () => {
    writePublicCart({ supplierLocationId: null, lines: [] })
    expect(window.localStorage.getItem('supplify.public-sales.cart')).toBeNull()
  })
})
