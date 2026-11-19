import {
  loadConsumptionHistory,
  loadForecastInventoryContext,
  listRestaurantBranches,
} from './reorder-forecast-data.service.js'
import { computeProductForecast } from './reorder-forecast-model.js'
export { computeProductForecast, backtestForecast } from './reorder-forecast-model.js'
import { forecastModelTierForFeature } from '../lib/smart-reorder-tier.js'

/**
 * Recompute forecasts for a restaurant.
 * @param {string} restaurantId
 * @param {{ featureValue?: unknown, branchId?: string | null, productIds?: string[] }} opts
 */
export async function computeRestaurantForecasts(restaurantId, opts = {}) {
  const modelTier = forecastModelTierForFeature(opts.featureValue)
  if (!modelTier) {
    return { forecasts: [], modelTier: null, skipped: 'feature_disabled' }
  }

  const branches = await listRestaurantBranches(restaurantId)
  const branchScopes = opts.branchId != null ? [{ id: opts.branchId }] : [{ id: null }, ...branches]

  const inventory = await loadForecastInventoryContext(restaurantId, {
    branchId: opts.branchId,
    productIds: opts.productIds,
  })

  const inventoryByProduct = new Map(inventory.map((r) => [r.product_id, r]))

  /** @type {import('./reorder-forecast-cache.service.js').ForecastRow[]} */
  const forecasts = []

  for (const scope of branchScopes) {
    const history = await loadConsumptionHistory(restaurantId, {
      branchId: scope.id,
      lookbackDays: 90,
    })

    const seenProducts = new Set()
    for (const h of history) {
      seenProducts.add(h.productId)
      const inv = inventoryByProduct.get(h.productId)
      if (!inv || (scope.id != null && inv.branch_id != null && inv.branch_id !== scope.id))
        continue

      const computed = computeProductForecast({
        productId: h.productId,
        branchId: scope.id,
        dailyUsage: h.dailyUsage,
        sources: h.sources,
        avgUnitPenalty: h.avgUnitPenalty,
        currentQty: Number(inv.current_qty) || 0,
        lowStockThreshold: inv.low_stock_threshold,
        leadTimeDays: Number(inv.lead_time_days) || 7,
        moq: Number(inv.moq) || 1,
        orderMultiple: Number(inv.order_multiple) || 1,
        productUnit: inv.product_unit,
        modelTier,
        timeZone: h.timeZone,
        stockScope: inv.branch_id === scope.id && scope.id != null ? 'branch' : 'restaurant',
      })
      forecasts.push(computed)
    }

    for (const inv of inventory) {
      if (seenProducts.has(inv.product_id)) continue
      if (scope.id != null && inv.branch_id != null && inv.branch_id !== scope.id) continue
      forecasts.push(
        computeProductForecast({
          productId: inv.product_id,
          branchId: scope.id,
          dailyUsage: [],
          sources: [],
          avgUnitPenalty: 0,
          currentQty: Number(inv.current_qty) || 0,
          lowStockThreshold: inv.low_stock_threshold,
          leadTimeDays: Number(inv.lead_time_days) || 7,
          moq: Number(inv.moq) || 1,
          orderMultiple: Number(inv.order_multiple) || 1,
          productUnit: inv.product_unit,
          modelTier,
          stockScope: inv.branch_id === scope.id && scope.id != null ? 'branch' : 'restaurant',
        })
      )
    }
  }

  return { forecasts, modelTier, skipped: null }
}
