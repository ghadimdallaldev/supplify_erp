import { describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('../lib/db.js', () => ({ query: (...args) => queryMock(...args) }))
vi.mock('../lib/restaurant-org.js', () => ({
  listRestaurantOrgBranchesForUser: vi.fn().mockResolvedValue([{ id: 'branch-1' }]),
}))
vi.mock('../lib/supplier-org.js', () => ({ listOrgBranchesForUser: vi.fn() }))

const { restaurantOrgBranchComparison, restaurantOrgBranchDemandForecast } = await import(
  './org-reports.service.js'
)

describe('restaurantOrgBranchComparison', () => {
  it('returns tenant-scoped stored branch facts and marks food cost unavailable', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          branch_account_id: 'branch-1',
          branch_account_name: 'North',
          is_main_branch: true,
          order_count: '4',
          spend: '120',
          previous_spend: '100',
          tracked_products: '8',
          out_of_stock_products: '1',
          low_stock_products: '2',
          waste_incidents: '3',
          waste_cost: '9',
          receiving_reports: '2',
          average_quality_score: '4.5',
          fill_rate_pct: '95',
        },
      ],
    })

    const result = await restaurantOrgBranchComparison('user-1', 'org-1', {
      from: '2026-09-01',
      to: '2026-09-07',
    })

    expect(queryMock.mock.calls[0][1][0]).toEqual(['branch-1'])
    expect(result.data.branches[0]).toMatchObject({
      branchAccountId: 'branch-1',
      purchasing: { orderCount: 4, spend: 120, previousSpend: 100 },
      inventory: { trackedProducts: 8, outOfStockProducts: 1, lowStockProducts: 2 },
      waste: { incidents: 3, cost: 9 },
      supplierPerformance: { receivingReports: 2, averageQualityScore: 4.5, fillRatePct: 95 },
    })
    expect(result.data.coverage.foodCost).toEqual({
      available: false,
      reason: 'no_shared_recipe_identity_model',
    })
  })
})

describe('restaurantOrgBranchDemandForecast', () => {
  it('reuses only fresh restaurant-account aggregate forecast facts', async () => {
    queryMock.mockReset()
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          branch_account_id: 'branch-1',
          branch_account_name: 'North',
          is_main_branch: true,
          product_id: 'product-1',
          product_name: 'Tomatoes',
          product_unit: 'kg',
          forecast_daily_usage: '3.5',
          forecast_reorder_qty: '21',
          reorder_by_date: '2026-09-27',
          confidence: '0.8',
          urgency: 'HIGH',
          computed_at: '2026-09-23T10:00:00.000Z',
          forecast_count: '4',
          high_or_urgent_count: '2',
          latest_computed_at: '2026-09-23T10:00:00.000Z',
        },
      ],
    })

    const result = await restaurantOrgBranchDemandForecast('user-1', 'org-1')

    expect(queryMock.mock.calls[0][1]).toEqual([['branch-1'], 8])
    expect(queryMock.mock.calls[0][0]).toContain('rf.branch_id IS NULL')
    expect(queryMock.mock.calls[0][0]).toContain('rf.stale_after > now()')
    expect(result.data.branches[0]).toMatchObject({
      branchAccountId: 'branch-1',
      coverage: { freshForecasts: 4, highOrUrgentForecasts: 2 },
      forecasts: [
        {
          productId: 'product-1',
          forecastDailyUsage: 3.5,
          forecastReorderQty: 21,
          urgency: 'HIGH',
        },
      ],
    })
    expect(result.data.coverage).toEqual({
      scope: 'restaurant_account_aggregate_only',
      source: 'cached_reorder_forecast',
    })
  })
})
