import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/db.js', () => ({ query: vi.fn() }))
vi.mock('./deal-promotions.service.js', () => ({ discoverDealsForRestaurant: vi.fn() }))
import { query } from '../lib/db.js'
import { discoverDealsForRestaurant } from './deal-promotions.service.js'
import { getNewDealsBanner } from './deal-banner.service.js'
beforeEach(() => {
  vi.clearAllMocks()
  query.mockResolvedValue({ rows: [] })
})
describe('new deals banner', () => {
  it('only advertises discoverable, recent, undismissed deals', async () => {
    const recent = {
      id: 'recent',
      name: 'Olive oil',
      type: 'percentage_discount',
      discount_value: 10,
      supplier_id: 'supplier-1',
      supplier_name: 'Cedar',
      starts_at: new Date().toISOString(),
    }
    discoverDealsForRestaurant.mockResolvedValue([
      recent,
      { ...recent, id: 'dismissed' },
      { ...recent, id: 'old', starts_at: '2000-01-01' },
    ])
    query.mockResolvedValue({ rows: [{ deal_id: 'dismissed' }] })
    const result = await getNewDealsBanner('restaurant-1')
    expect(discoverDealsForRestaurant).toHaveBeenCalledWith('restaurant-1', { sort: 'newest' })
    expect(result.deals.map((deal) => deal.id)).toEqual(['recent'])
    expect(result.deals[0].discountType).toBe('percentage_discount')
    expect(result.summary.count).toBe(1)
  })
  it('does not show a banner when no deals can be opened', async () => {
    discoverDealsForRestaurant.mockResolvedValue([])
    expect(await getNewDealsBanner('restaurant-1')).toEqual({ deals: [], summary: null })
    expect(query).not.toHaveBeenCalled()
  })
})
