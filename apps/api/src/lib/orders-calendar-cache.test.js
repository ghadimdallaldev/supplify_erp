import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectOrdersCalendarTenantIdsFromOrder,
  invalidateOrdersCalendarCacheForTenants,
} from './orders-calendar-cache.js'
import { deleteCacheByPrefix } from './cache.js'

vi.mock('./cache.js', () => ({
  deleteCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

describe('orders calendar cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects restaurant and supplier tenant ids from an order', () => {
    expect(
      collectOrdersCalendarTenantIdsFromOrder({
        restaurant_id: 'restaurant-1',
        items: [
          { supplier_id: 'supplier-1' },
          { supplier_id: 'supplier-1' },
          { supplier_id: 'supplier-2' },
        ],
      })
    ).toEqual(['restaurant-1', 'supplier-1', 'supplier-2'])
  })

  it('deletes only affected calendar cache prefixes', async () => {
    await invalidateOrdersCalendarCacheForTenants(
      ['restaurant-1', 'supplier-1', 'restaurant-1', null],
      { reason: 'test' }
    )

    expect(deleteCacheByPrefix).toHaveBeenCalledTimes(2)
    expect(deleteCacheByPrefix).toHaveBeenCalledWith('orders-calendar:restaurant-1:')
    expect(deleteCacheByPrefix).toHaveBeenCalledWith('orders-calendar:supplier-1:')
  })
})
