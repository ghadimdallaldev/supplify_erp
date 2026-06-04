/**
 * Promotion/deal rows that pass restaurant-visible deal lifecycle gates in unit tests.
 */
export function activeRestaurantDeal(overrides = {}) {
  const now = Date.now()
  const boostStart = new Date(now - 86400000).toISOString()
  const boostEnd = new Date(now + 86400000 * 30).toISOString()
  return {
    status: 'active',
    payment_status: 'not_required',
    starts_at: '2020-01-01T00:00:00Z',
    ends_at: '2099-01-01T00:00:00Z',
    boost_start_at: boostStart,
    boost_end_at: boostEnd,
    usage_limit: 10,
    usage_count: 0,
    min_order_amount: null,
    max_discount_cap: null,
    restaurant_ids: [],
    applies_to: 'all',
    ...overrides,
  }
}
