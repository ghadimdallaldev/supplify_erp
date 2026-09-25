import { describe, expect, it, vi } from 'vitest'

const getWarehouseSupplierColumn = vi.fn().mockResolvedValue('supplier_id')
vi.mock('../lib/warehouse-helpers.js', () => ({ getWarehouseSupplierColumn }))

const { listSupplierWarehouseDemandForecast } = await import(
  './supplier-warehouse-demand-forecast.service.js'
)

describe('listSupplierWarehouseDemandForecast', () => {
  it('forecasts only exact delivered warehouse-order-item history', async () => {
    const dbQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          warehouse_id: 'warehouse-1',
          warehouse_name: 'Main',
          warehouse_code: 'MAIN',
          product_id: 'product-1',
          product_name: 'Tomatoes',
          sku: 'TOM',
          sold_quantity_90: '90',
          sold_quantity_30: '45',
          sale_days_90: '9',
          order_count_90: '12',
        },
        {
          warehouse_id: 'warehouse-2',
          warehouse_name: 'West',
          warehouse_code: null,
          product_id: 'product-2',
          product_name: 'Basil',
          sku: null,
          sold_quantity_90: '6',
          sold_quantity_30: '1',
          sale_days_90: '6',
          order_count_90: '6',
        },
      ],
    })

    const result = await listSupplierWarehouseDemandForecast(
      'supplier-1',
      { horizonDays: 10, limit: 5 },
      dbQuery
    )

    expect(result).toMatchObject({
      observationDays: 90,
      recentDays: 30,
      horizonDays: 10,
      coverage: {
        warehouseProductRowsWithDeliveredHistory: 2,
        warehouseProductRowsWithSufficientHistory: 1,
        warehousesWithSufficientHistory: 1,
      },
      forecasts: [
        {
          warehouseId: 'warehouse-1',
          productId: 'product-1',
          soldQuantity30: 45,
          soldQuantity90: 90,
          saleDays90: 9,
          orderCount90: 12,
          forecastDailyDemand: 1.3,
          projectedDemandQty: 13,
        },
      ],
    })
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("owa.status = 'delivered'"), [
      'supplier-1',
      30,
      90,
    ])
    const sql = dbQuery.mock.calls[0][0]
    expect(sql).toContain('owa.order_item_id IS NOT NULL')
    expect(sql).toContain('oi.id = owa.order_item_id')
    expect(sql).toContain('w.supplier_id = $1')
  })

  it('bounds horizon and limit', async () => {
    const dbQuery = vi.fn().mockResolvedValue({ rows: [] })
    const result = await listSupplierWarehouseDemandForecast(
      'supplier-1',
      { horizonDays: 999, limit: 0 },
      dbQuery
    )
    expect(result).toMatchObject({ horizonDays: 90, forecasts: [] })
  })
})
