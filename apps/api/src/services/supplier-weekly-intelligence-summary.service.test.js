import { describe, expect, it, vi } from 'vitest'
import { getSupplierWeeklyIntelligenceSummary } from './supplier-weekly-intelligence-summary.service.js'
describe('getSupplierWeeklyIntelligenceSummary', () => {
  it('composes bounded source facts without recalculating them', async () => {
    const s = {
      listSupplierSlowMovingInventory: vi.fn().mockResolvedValue({
        windowDays: 30,
        coverage: { slowMovingProducts: 2 },
        products: [1, 2, 3, 4],
      }),
      listSupplierStockoutRisks: vi.fn().mockResolvedValue({ horizonDays: 7, risks: [1, 2, 3, 4] }),
      listSupplierCrossSellOpportunities: vi
        .fn()
        .mockResolvedValue({ observationDays: 30, opportunities: [1] }),
      listSupplierWarehousePerformance: vi.fn().mockResolvedValue({
        windowDays: 7,
        warehouses: [{ lowStockProducts: 1 }, { lowStockProducts: 0 }],
      }),
      listSupplierWarehouseDemandForecast: vi
        .fn()
        .mockResolvedValue({ horizonDays: 7, forecasts: [1, 2] }),
    }
    const r = await getSupplierWeeklyIntelligenceSummary(
      's',
      { days: 7, now: new Date('2026-01-01') },
      s
    )
    expect(r).toMatchObject({
      periodDays: 7,
      summary: {
        slowMovingProducts: 2,
        stockoutRisks: 4,
        crossSellOpportunities: 1,
        warehousesWithLowStock: 1,
        warehouseForecasts: 2,
      },
    })
    expect(r.sections.stockout.risks).toHaveLength(3)
    expect(s.listSupplierSlowMovingInventory).toHaveBeenCalledWith('s', { days: 30, limit: 3 })
  })
})
