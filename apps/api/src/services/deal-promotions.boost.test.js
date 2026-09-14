import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
const withTransactionMock = vi.fn(async (fn) => fn({ query: queryMock }))

vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
  withTransaction: (...args) => withTransactionMock(...args),
}))

import { createDealPromotionCampaign } from './deal-promotions.service.js'

describe('deal-promotions boost packages', () => {
  beforeEach(() => {
    queryMock.mockReset()
    withTransactionMock.mockClear()
  })

  it('rejects inactive boost package', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })

    await expect(
      createDealPromotionCampaign({
        dealId: 'deal-1',
        supplierId: 'supplier-1',
        pricingKey: 'boost_flat',
      })
    ).rejects.toThrow('Boost package is not available')
  })

  it('stores package id, price paid, and duration on purchase', async () => {
    const pricing = {
      id: 'pkg-1',
      pricing_key: 'boost_7_day',
      display_name: 'Weekly Boost',
      amount: 39,
      duration_days: 7,
      billing_type: 'flat_fee',
    }

    queryMock
      .mockResolvedValueOnce({ rows: [pricing] })
      .mockResolvedValueOnce({
        rows: [{ id: 'deal-1', status: 'active', supplier_id: 'supplier-1' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'campaign-1',
            deal_id: 'deal-1',
            budget: 39,
            price_paid: 39,
            pricing_key: 'boost_7_day',
            duration_days: 7,
            package_display_name: 'Weekly Boost',
          },
        ],
      })

    const campaign = await createDealPromotionCampaign({
      dealId: 'deal-1',
      supplierId: 'supplier-1',
      pricingKey: 'boost_7_day',
    })

    expect(campaign.price_paid).toBe(39)
    expect(campaign.pricing_key).toBe('boost_7_day')

    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO deal_promotions')
    )
    expect(insertCall).toBeTruthy()
    expect(insertCall[1]).toContain('pkg-1')
    expect(insertCall[1]).toContain(39)
    expect(insertCall[1]).toContain(7)
    expect(insertCall[1]).toContain('Weekly Boost')
  })

  it('uses explicit budget as price paid snapshot', async () => {
    const pricing = {
      id: 'pkg-1',
      pricing_key: 'boost_flat',
      display_name: 'Starter Boost',
      amount: 9,
      duration_days: 1,
      billing_type: 'flat_fee',
    }

    queryMock
      .mockResolvedValueOnce({ rows: [pricing] })
      .mockResolvedValueOnce({
        rows: [{ id: 'deal-1', status: 'active', supplier_id: 'supplier-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'campaign-1', price_paid: 29, budget: 29 }],
      })

    await createDealPromotionCampaign({
      dealId: 'deal-1',
      supplierId: 'supplier-1',
      pricingKey: 'boost_flat',
      budget: 29,
    })

    const insertCall = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO deal_promotions')
    )
    expect(insertCall[1]).toContain(29)
  })
})
