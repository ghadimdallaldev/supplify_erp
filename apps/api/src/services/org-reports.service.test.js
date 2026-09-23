import { describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('../lib/db.js', () => ({ query: (...args) => queryMock(...args) }))
vi.mock('../lib/restaurant-org.js', () => ({
  listRestaurantOrgBranchesForUser: vi.fn().mockResolvedValue([{ id: 'branch-1' }]),
}))
vi.mock('../lib/supplier-org.js', () => ({ listOrgBranchesForUser: vi.fn() }))

const { restaurantOrgBranchComparison } = await import('./org-reports.service.js')

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
