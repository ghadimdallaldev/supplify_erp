import { listSupplierSlowMovingInventory } from './supplier-slow-moving-intelligence.service.js'
import { listSupplierStockoutRisks } from './supplier-stockout-intelligence.service.js'
import { listSupplierCrossSellOpportunities } from './supplier-cross-sell-intelligence.service.js'
import { listSupplierWarehousePerformance } from './supplier-warehouse-performance-intelligence.service.js'
import { listSupplierWarehouseDemandForecast } from './supplier-warehouse-demand-forecast.service.js'

const DEFAULT_DAYS = 7
const MAX_DAYS = 31
const MAX_HIGHLIGHTS = 3
function clampDays(value) {
  const n = Number.parseInt(value, 10)
  return Math.min(MAX_DAYS, Math.max(DEFAULT_DAYS, Number.isFinite(n) ? n : DEFAULT_DAYS))
}
function bounded(items) {
  return (items || []).slice(0, MAX_HIGHLIGHTS)
}

/** Read-only composition of existing supplier intelligence; never scores or acts. */
export async function getSupplierWeeklyIntelligenceSummary(
  supplierId,
  opts = {},
  sources = {
    listSupplierSlowMovingInventory,
    listSupplierStockoutRisks,
    listSupplierCrossSellOpportunities,
    listSupplierWarehousePerformance,
    listSupplierWarehouseDemandForecast,
  }
) {
  if (!supplierId) throw new Error('supplierId is required')
  const periodDays = clampDays(opts.days)
  const forecastHorizon = Math.min(90, Math.max(1, periodDays))
  const [slowMoving, stockout, crossSell, warehouses, warehouseForecast] = await Promise.all([
    sources.listSupplierSlowMovingInventory(supplierId, {
      days: Math.max(30, periodDays),
      limit: MAX_HIGHLIGHTS,
    }),
    sources.listSupplierStockoutRisks(supplierId, {
      horizonDays: forecastHorizon,
      limit: MAX_HIGHLIGHTS,
    }),
    sources.listSupplierCrossSellOpportunities(supplierId, {
      days: Math.max(30, periodDays),
      limit: MAX_HIGHLIGHTS,
    }),
    sources.listSupplierWarehousePerformance(supplierId, {
      days: periodDays,
      limit: MAX_HIGHLIGHTS,
    }),
    sources.listSupplierWarehouseDemandForecast(supplierId, {
      horizonDays: forecastHorizon,
      limit: MAX_HIGHLIGHTS,
    }),
  ])
  const lowStockWarehouses = (warehouses.warehouses || []).filter((w) => w.lowStockProducts > 0)
  return {
    periodDays,
    generatedAt: (opts.now instanceof Date ? opts.now : new Date()).toISOString(),
    evidenceWindows: {
      slowMovingDays: slowMoving.windowDays,
      stockoutHorizonDays: stockout.horizonDays,
      crossSellDays: crossSell.observationDays,
      warehousePerformanceDays: warehouses.windowDays,
      warehouseForecastHorizonDays: warehouseForecast.horizonDays,
    },
    summary: {
      slowMovingProducts: slowMoving.coverage?.slowMovingProducts || 0,
      stockoutRisks: stockout.risks?.length || 0,
      crossSellOpportunities: crossSell.opportunities?.length || 0,
      warehousesWithLowStock: lowStockWarehouses.length,
      warehouseForecasts: warehouseForecast.forecasts?.length || 0,
    },
    sections: {
      slowMoving: { products: bounded(slowMoving.products) },
      stockout: { risks: bounded(stockout.risks) },
      crossSell: { opportunities: bounded(crossSell.opportunities) },
      warehousePerformance: { warehouses: bounded(lowStockWarehouses) },
      warehouseForecast: { forecasts: bounded(warehouseForecast.forecasts) },
    },
  }
}
