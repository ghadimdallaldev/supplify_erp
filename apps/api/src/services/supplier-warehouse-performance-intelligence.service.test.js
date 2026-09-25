import { describe, expect, it, vi } from 'vitest'

const getWarehouseSupplierColumn = vi.fn().mockResolvedValue('supplier_id')
vi.mock('../lib/warehouse-helpers.js', () => ({ getWarehouseSupplierColumn }))

const { listSupplierWarehousePerformance } = await import(
  './supplier-warehouse-performance-intelligence.service.js'
)

describe('listSupplierWarehousePerformance', () => {
  it('reports only recorded inventory thresholds and assignment states for active supplier warehouses', async () => {
    const dbQuery = vi.fn().mockResolvedValue({
      rows: [
        {
          warehouse_id: 'warehouse-1',
          warehouse_name: 'Main',
          warehouse_code: 'MAIN',
          stocked_products: '8',
          low_stock_products: '2',
          available_quantity: '42.5',
          assignment_count: '6',
          delivered_count: '3',
          failed_count: '1',
          active_count: '2',
        },
      ],
    })

    const result = await listSupplierWarehousePerformance(
      'supplier-1',
      { days: 60, limit: 5 },
      dbQuery
    )

    expect(result).toEqual({
      windowDays: 60,
      coverage: {
        activeWarehouses: 1,
        warehousesWithAssignments: 1,
        warehousesWithLowStock: 1,
      },
      warehouses: [
        {
          warehouseId: 'warehouse-1',
          warehouseName: 'Main',
          warehouseCode: 'MAIN',
          stockedProducts: 8,
          lowStockProducts: 2,
          availableQuantity: 42.5,
          assignmentCount: 6,
          deliveredCount: 3,
          failedCount: 1,
          activeCount: 2,
        },
      ],
    })
    expect(getWarehouseSupplierColumn).toHaveBeenCalledTimes(1)
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("owa.status NOT IN ('delivered', 'failed')"),
      ['supplier-1', 60, 5]
    )
    expect(dbQuery.mock.calls[0][0]).toContain('w.supplier_id = $1')
    expect(dbQuery.mock.calls[0][0]).toContain('w.is_active = TRUE')
    expect(dbQuery.mock.calls[0][0]).toContain('wi.reorder_point IS NOT NULL')
  })

  it('bounds the observation window and response size', async () => {
    const dbQuery = vi.fn().mockResolvedValue({ rows: [] })

    const result = await listSupplierWarehousePerformance(
      'supplier-1',
      { days: 9999, limit: 0 },
      dbQuery
    )

    expect(result).toMatchObject({
      windowDays: 365,
      coverage: {
        activeWarehouses: 0,
        warehousesWithAssignments: 0,
        warehousesWithLowStock: 0,
      },
      warehouses: [],
    })
    expect(dbQuery.mock.calls[0][1]).toEqual(['supplier-1', 365, 1])
  })
})
