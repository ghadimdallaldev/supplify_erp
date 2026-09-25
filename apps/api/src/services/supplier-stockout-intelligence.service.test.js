import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listSupplierDemandForecast, listSupplierStockDisplay } = vi.hoisted(() => ({
  listSupplierDemandForecast: vi.fn(),
  listSupplierStockDisplay: vi.fn(),
}))
vi.mock('./supplier-demand-forecast.service.js', () => ({ listSupplierDemandForecast }))
vi.mock('./supplier-stock.service.js', () => ({ listSupplierStockDisplay }))

import { listSupplierStockoutRisks } from './supplier-stockout-intelligence.service.js'

describe('supplier stockout intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports only forecasted products whose recorded available stock falls short', async () => {
    listSupplierDemandForecast.mockResolvedValue({
      coverage: { productsWithCompletedSales: 3, productsWithSufficientHistory: 2 },
      forecasts: [
        {
          productId: 'p1',
          productName: 'Tomato',
          forecastDailyDemand: 2,
          projectedDemandQty: 28,
        },
        {
          productId: 'p2',
          productName: 'Lemon',
          forecastDailyDemand: 1,
          projectedDemandQty: 14,
        },
      ],
    })
    listSupplierStockDisplay.mockResolvedValue([
      { product_id: 'p1', available_qty: 10 },
      { product_id: 'p2', available_qty: 30 },
    ])

    const result = await listSupplierStockoutRisks('supplier-1', { horizonDays: 14 })

    expect(result.risks).toEqual([
      expect.objectContaining({
        productId: 'p1',
        availableQty: 10,
        shortfallQty: 18,
        daysUntilStockout: 5,
        currentlyOutOfStock: false,
      }),
    ])
    expect(result.coverage).toEqual({
      productsWithCompletedSales: 3,
      productsWithSufficientHistory: 2,
      forecastedProductsWithRecordedStock: 2,
    })
    expect(listSupplierDemandForecast).toHaveBeenCalledWith('supplier-1', {
      horizonDays: 14,
      includeAll: true,
    })
  })

  it('prioritizes a current stockout and bounds untrusted output options', async () => {
    listSupplierDemandForecast.mockResolvedValue({
      coverage: { productsWithCompletedSales: 2, productsWithSufficientHistory: 2 },
      forecasts: [
        { productId: 'p1', forecastDailyDemand: 2, projectedDemandQty: 10 },
        { productId: 'p2', forecastDailyDemand: 1, projectedDemandQty: 5 },
      ],
    })
    listSupplierStockDisplay.mockResolvedValue([{ product_id: 'p1', available_qty: 2 }])

    const result = await listSupplierStockoutRisks('supplier-1', {
      horizonDays: '999',
      limit: '1',
    })

    expect(result.horizonDays).toBe(90)
    expect(result.risks).toHaveLength(1)
    expect(result.risks[0]).toMatchObject({ productId: 'p2', currentlyOutOfStock: true })
  })
})
