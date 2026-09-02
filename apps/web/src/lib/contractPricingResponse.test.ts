import { describe, expect, it } from 'vitest'
import {
  normalizeContractPricingList,
  normalizeMyContractPricing,
  normalizeResolvedContractPrices,
} from './contractPricingResponse'

describe('contractPricingResponse', () => {
  it('normalizeMyContractPricing reads unwrapped payload', () => {
    const payload = {
      pricing: [{ id: '1', product_name: 'Tomatoes' }],
      summary: [{ supplier_name: 'Acme', product_count: 1 }],
    }
    expect(normalizeMyContractPricing(payload)).toEqual(payload)
  })

  it('normalizeMyContractPricing reads envelope payload', () => {
    expect(
      normalizeMyContractPricing({
        data: { pricing: [{ id: '1' }], summary: [] },
      })
    ).toEqual({ pricing: [{ id: '1' }], summary: [] })
  })

  it('normalizeContractPricingList reads unwrapped pricing', () => {
    expect(normalizeContractPricingList({ pricing: [{ id: 'rp-1' }] })).toEqual({
      pricing: [{ id: 'rp-1' }],
    })
  })

  it('normalizeResolvedContractPrices reads unwrapped items', () => {
    const items = [
      {
        productId: 'p1',
        supplierId: 's1',
        quantity: 2,
        unitPrice: 8,
        source: 'CONTRACT_PRICE',
        defaultPrice: 10,
        contractPriceId: 'c1',
      },
    ]
    expect(normalizeResolvedContractPrices({ items })).toEqual({ items })
  })
})
