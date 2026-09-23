import { describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('../lib/db.js', () => ({ query: (...args) => queryMock(...args) }))
vi.mock('../lib/restaurant-org.js', () => ({
  listRestaurantOrgBranchesForUser: vi.fn().mockResolvedValue([{ id: 'branch-1' }]),
}))
vi.mock('../lib/supplier-org.js', () => ({ listOrgBranchesForUser: vi.fn() }))

const {
  restaurantOrgBranchComparison,
  restaurantOrgBranchDemandForecast,
  restaurantOrgCrossBranchPurchasingInsights,
  restaurantOrgStockTransferSuggestions,
  restaurantOrgAdvancedAnalytics,
} = await import('./org-reports.service.js')

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

describe('restaurantOrgCrossBranchPurchasingInsights', () => {
  it('reports only factual same-product/supplier price ranges', async () => {
    queryMock.mockReset()
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          product_id: 'product-1',
          product_name: 'Tomatoes',
          product_unit: 'kg',
          supplier_id: 'supplier-1',
          supplier_name: 'Fresh Co',
          branch_count: '2',
          min_unit_price: '5',
          max_unit_price: '6',
          price_spread_pct: '20',
          latest_purchase_at: '2026-09-23T10:00:00.000Z',
          branch_prices: [{ branchAccountName: 'Main', unitPrice: 5 }],
        },
      ],
    })

    const result = await restaurantOrgCrossBranchPurchasingInsights('user-1', 'org-1', {
      from: '2026-09-01',
      to: '2026-09-23',
    })

    expect(queryMock.mock.calls[0][1][0]).toEqual(['branch-1'])
    expect(queryMock.mock.calls[0][0]).toContain('co.restaurant_id = ANY($1::uuid[])')
    expect(queryMock.mock.calls[0][0]).toContain(
      'HAVING COUNT(*) >= 2 AND MIN(unit_price) <> MAX(unit_price)'
    )
    expect(result.data.signals[0]).toMatchObject({
      productId: 'product-1',
      supplierId: 'supplier-1',
      branchCount: 2,
      minUnitPrice: 5,
      maxUnitPrice: 6,
      priceSpreadPct: 20,
    })
  })
})

describe('restaurantOrgStockTransferSuggestions', () => {
  it('returns recommendation-only exact-product surplus-to-forecast facts', async () => {
    queryMock.mockReset()
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          source_restaurant_id: 'source',
          source_branch_account_name: 'Main',
          destination_restaurant_id: 'destination',
          destination_branch_account_name: 'North',
          product_id: 'product-1',
          product_name: 'Tomatoes',
          product_unit: 'kg',
          urgency: 'HIGH',
          source_surplus_qty: '12',
          forecast_reorder_qty: '8',
          suggested_qty: '8',
        },
      ],
    })
    const result = await restaurantOrgStockTransferSuggestions('user-1', 'org-1')
    expect(queryMock.mock.calls[0][0]).toContain('di.low_stock_threshold IS NOT NULL')
    expect(queryMock.mock.calls[0][0]).toContain("rf.urgency IN ('URGENT','HIGH')")
    expect(result.data.suggestions[0]).toMatchObject({
      sourceBranchAccountId: 'source',
      destinationBranchAccountId: 'destination',
      suggestedQty: 8,
    })
  })
})

describe('restaurantOrgAdvancedAnalytics', () => {
  it('accepts an uncapped historical range', async () => {
    queryMock.mockReset()
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          month: '2001-01-01',
          branch_account_id: 'branch-1',
          branch_account_name: 'North',
          order_count: '2',
          spend: '10',
        },
      ],
    })
    const result = await restaurantOrgAdvancedAnalytics('user-1', 'org-1', {
      from: '2001-01-01',
      to: '2026-01-01',
    })
    expect(result.meta.unrestrictedDateRange).toBe(true)
    expect(queryMock.mock.calls[0][1][1]).toBeInstanceOf(Date)
    expect(result.data.months[0].spend).toBe(10)
  })
})
