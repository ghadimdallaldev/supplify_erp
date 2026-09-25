import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../lib/db.js', () => ({ query }))

import { listSupplierDemandForecast } from './supplier-demand-forecast.service.js'

describe('supplier demand forecast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forecasts repeated completed sales only and keeps insufficient history in coverage', async () => {
    query.mockResolvedValue({
      rows: [
        {
          product_id: 'p1',
          product_name: 'Tomato',
          sku: 'T',
          sold_quantity_30: 60,
          sold_quantity_90: 120,
          sale_days_90: 12,
          order_count_90: 15,
        },
        {
          product_id: 'p2',
          product_name: 'Mint',
          sku: 'M',
          sold_quantity_30: 20,
          sold_quantity_90: 30,
          sale_days_90: 3,
          order_count_90: 3,
        },
      ],
    })

    const result = await listSupplierDemandForecast('supplier-1', { horizonDays: 14 })

    expect(result.coverage).toEqual({
      productsWithCompletedSales: 2,
      productsWithSufficientHistory: 1,
    })
    expect(result.forecasts).toEqual([
      expect.objectContaining({
        productId: 'p1',
        soldQuantity30: 60,
        soldQuantity90: 120,
        forecastDailyDemand: 1.733333,
        projectedDemandQty: 24.267,
      }),
    ])
    expect(query.mock.calls[0][0]).toContain(
      "co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')"
    )
    expect(query.mock.calls[0][1]).toEqual(['supplier-1', 30, 90])
  })

  it('uses the 90-day rate when there are no recent sales and bounds untrusted horizon and limit', async () => {
    query.mockResolvedValue({
      rows: [
        {
          product_id: 'p1',
          product_name: 'Tomato',
          sold_quantity_30: 0,
          sold_quantity_90: 90,
          sale_days_90: 9,
          order_count_90: 9,
        },
        {
          product_id: 'p2',
          product_name: 'Lemon',
          sold_quantity_30: 30,
          sold_quantity_90: 60,
          sale_days_90: 8,
          order_count_90: 8,
        },
      ],
    })

    const result = await listSupplierDemandForecast('supplier-1', {
      horizonDays: '999',
      limit: '1',
    })

    expect(result.horizonDays).toBe(90)
    expect(result.forecasts).toHaveLength(1)
    expect(result.forecasts[0]).toMatchObject({
      productId: 'p1',
      forecastDailyDemand: 1,
      projectedDemandQty: 90,
    })
  })
})
