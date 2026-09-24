import { listSupplierDemandForecast } from './supplier-demand-forecast.service.js'
import { listSupplierStockDisplay } from './supplier-stock.service.js'

const DEFAULT_HORIZON_DAYS = 14
const MAX_HORIZON_DAYS = 90
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function listSupplierStockoutRisks(
  supplierId,
  { horizonDays = DEFAULT_HORIZON_DAYS, limit = DEFAULT_LIMIT } = {}
) {
  const parsedHorizon = Number.parseInt(horizonDays, 10)
  const effectiveHorizonDays = Math.min(
    MAX_HORIZON_DAYS,
    Math.max(1, parsedHorizon || DEFAULT_HORIZON_DAYS)
  )
  const parsedLimit = Number.parseInt(limit, 10)
  const effectiveLimit = Math.min(MAX_LIMIT, Math.max(1, parsedLimit || DEFAULT_LIMIT))

  const [demand, stock] = await Promise.all([
    listSupplierDemandForecast(supplierId, {
      horizonDays: effectiveHorizonDays,
      includeAll: true,
    }),
    listSupplierStockDisplay(supplierId),
  ])
  const stockByProduct = new Map(
    stock.map((row) => [row.product_id, Number(row.available_qty) || 0])
  )

  const risks = demand.forecasts
    .map((forecast) => {
      const availableQty = stockByProduct.get(forecast.productId) || 0
      const shortfallQty = Math.max(0, forecast.projectedDemandQty - availableQty)
      const daysUntilStockout =
        forecast.forecastDailyDemand > 0 ? availableQty / forecast.forecastDailyDemand : null

      return {
        ...forecast,
        availableQty,
        shortfallQty: Number(shortfallQty.toFixed(3)),
        daysUntilStockout:
          daysUntilStockout == null ? null : Number(Math.max(0, daysUntilStockout).toFixed(2)),
        currentlyOutOfStock: availableQty <= 0,
      }
    })
    .filter((row) => row.shortfallQty > 0)
    .sort((a, b) => {
      if (a.currentlyOutOfStock !== b.currentlyOutOfStock) return a.currentlyOutOfStock ? -1 : 1
      return (a.daysUntilStockout ?? Infinity) - (b.daysUntilStockout ?? Infinity)
    })

  return {
    horizonDays: effectiveHorizonDays,
    coverage: {
      productsWithCompletedSales: demand.coverage.productsWithCompletedSales,
      productsWithSufficientHistory: demand.coverage.productsWithSufficientHistory,
      forecastedProductsWithRecordedStock: demand.forecasts.filter((forecast) =>
        stockByProduct.has(forecast.productId)
      ).length,
    },
    risks: risks.slice(0, effectiveLimit),
  }
}
