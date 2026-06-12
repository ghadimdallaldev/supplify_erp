import {
  loadConsumptionHistory,
  loadForecastInventoryContext,
  listRestaurantBranches,
} from './reorder-forecast-data.service.js'
import { applySupplierPackRounding } from '../lib/reorder-unit-normalize.js'
import { forecastModelTierForFeature } from '../lib/smart-reorder-tier.js'

const MODEL_VERSION = 'v1'
const MIN_DAYS_FOR_FORECAST = 7
const COVERAGE_BUFFER_DAYS = 14

function sumUsageInWindow(dailyUsage, days) {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - days)
  const cutoffKey = cutoff.toISOString().slice(0, 10)
  return dailyUsage.filter((d) => d.date >= cutoffKey).reduce((sum, d) => sum + d.quantity, 0)
}

function avgDailyUsage(dailyUsage, days) {
  const total = sumUsageInWindow(dailyUsage, days)
  return days > 0 ? total / days : 0
}

function computeDowFactors(dailyUsage) {
  const dowTotals = Array.from({ length: 7 }, () => 0)
  const dowCounts = Array.from({ length: 7 }, () => 0)

  for (const row of dailyUsage) {
    const d = new Date(`${row.date}T12:00:00Z`)
    const dow = d.getUTCDay()
    dowTotals[dow] += row.quantity
    dowCounts[dow] += 1
  }

  const overall =
    dowTotals.reduce((a, b) => a + b, 0) /
    Math.max(
      1,
      dowCounts.reduce((a, b) => a + b, 0)
    )

  return dowTotals.map((total, i) => {
    const avg = dowCounts[i] > 0 ? total / dowCounts[i] : overall
    return overall > 0 ? avg / overall : 1
  })
}

function trendRatio(usage30, usage7) {
  const older = usage30 - usage7
  if (older <= 0) return 1
  return Math.min(2, Math.max(0.5, usage7 / (older * (7 / 23))))
}

function computeConfidence({ dayCount, sources, unitPenalty, modelTier }) {
  let c = 0.35
  if (dayCount >= MIN_DAYS_FOR_FORECAST) c += 0.2
  if (dayCount >= 21) c += 0.15
  if (dayCount >= 45) c += 0.1
  if (sources.includes('movement')) c += 0.15
  else if (sources.includes('order_fallback')) c -= 0.1
  c -= unitPenalty
  if (modelTier === 'platinum' && dayCount >= 28) c += 0.05
  return Math.min(0.95, Math.max(0.1, Number(c.toFixed(4))))
}

function computeUrgency(currentQty, dailyUsage, leadTimeDays, lowThreshold) {
  const threshold = Number(lowThreshold) || 0
  if (currentQty <= threshold) return 'URGENT'
  if (dailyUsage <= 0) return 'LOW'
  const daysLeft = currentQty / dailyUsage
  const horizon = leadTimeDays + 7
  if (daysLeft < horizon) return 'HIGH'
  if (daysLeft < horizon + 14) return 'MEDIUM'
  return 'LOW'
}

function buildExplanation({
  modelTier,
  avg30,
  avg90,
  dailyForecast,
  leadTimeDays,
  trend,
  dowFactor,
  sources,
  confidence,
}) {
  const parts = []
  if (sources.includes('movement')) {
    parts.push(
      `Based on ${avg30.toFixed(2)}/${avg90.toFixed(2)} units per day (30/90-day) from inventory usage`
    )
  } else if (sources.includes('order_fallback')) {
    parts.push('Limited movement history — using recent order quantities as fallback')
  } else {
    parts.push('Insufficient usage history for a reliable forecast')
  }

  parts.push(
    `forecast ${dailyForecast.toFixed(2)}/day for the next ${leadTimeDays + COVERAGE_BUFFER_DAYS} days`
  )

  if (modelTier === 'platinum') {
    if (trend !== 1) {
      parts.push(`trend adjustment ×${trend.toFixed(2)}`)
    }
    if (dowFactor !== 1) {
      parts.push(`weekday seasonality ×${dowFactor.toFixed(2)}`)
    }
  }

  parts.push(`confidence ${Math.round(confidence * 100)}%`)
  return parts.join('; ')
}

/**
 * Simple holdout backtest: compare last-7-day actual vs prior-window forecast rate.
 */
export function backtestForecast(dailyUsage) {
  const holdoutDays = 7
  const trainDays = 30
  const actual = sumUsageInWindow(dailyUsage, holdoutDays)
  const predictedRate = avgDailyUsage(
    dailyUsage.filter((d) => {
      const cutoff = new Date()
      cutoff.setUTCDate(cutoff.getUTCDate() - holdoutDays)
      return d.date < cutoff.toISOString().slice(0, 10)
    }),
    trainDays
  )
  const predicted = predictedRate * holdoutDays
  const mape = actual > 0 ? Math.abs(predicted - actual) / actual : predicted > 0 ? 1 : 0
  return {
    holdoutDays,
    actual: Number(actual.toFixed(3)),
    predicted: Number(predicted.toFixed(3)),
    mape: Number(mape.toFixed(4)),
  }
}

/**
 * Compute a single product/branch forecast.
 */
export function computeProductForecast({
  productId,
  branchId,
  dailyUsage,
  sources,
  avgUnitPenalty,
  currentQty,
  lowStockThreshold,
  leadTimeDays,
  moq,
  orderMultiple,
  productUnit,
  modelTier,
}) {
  const dayCount = dailyUsage.length
  const usage30 = sumUsageInWindow(dailyUsage, 30)
  const usage90 = sumUsageInWindow(dailyUsage, 90)
  let avg30 = avgDailyUsage(dailyUsage, 30)
  let avg90 = avgDailyUsage(dailyUsage, 90)

  if (dayCount < 3 && usage90 === 0) {
    return {
      productId,
      branchId,
      modelTier,
      modelVersion: MODEL_VERSION,
      forecastDailyUsage: null,
      forecastReorderQty: null,
      reorderByDate: null,
      confidence: 0.1,
      urgency: 'LOW',
      explanation:
        'Insufficient history — using existing reorder heuristics until more data is recorded',
      signals: { dayCount, sources, insufficientHistory: true },
      backtest: null,
    }
  }

  let dailyForecast = avg30 > 0 ? avg30 : avg90
  let trend = 1
  let dowFactor = 1

  if (modelTier === 'platinum') {
    const usage7 = sumUsageInWindow(dailyUsage, 7)
    trend = trendRatio(usage30, usage7)
    const dowFactors = computeDowFactors(dailyUsage)
    const todayDow = new Date().getUTCDay()
    dowFactor = dowFactors[todayDow] || 1
    dailyForecast = dailyForecast * trend * dowFactor
  } else {
    dailyForecast = avg90 > 0 ? avg30 * 0.6 + avg90 * 0.4 : avg30
  }

  const coverageDays = leadTimeDays + COVERAGE_BUFFER_DAYS
  const rawReorder = Math.max(0, dailyForecast * coverageDays - currentQty)
  const forecastReorderQty = applySupplierPackRounding(
    rawReorder,
    { moq, orderMultiple },
    productUnit
  )

  const confidence = computeConfidence({
    dayCount,
    sources,
    unitPenalty: avgUnitPenalty,
    modelTier,
  })

  const urgency = computeUrgency(currentQty, dailyForecast, leadTimeDays, lowStockThreshold)

  let reorderByDate = null
  if (dailyForecast > 0) {
    const daysUntil = Math.max(
      0,
      Math.floor((currentQty - dailyForecast * leadTimeDays) / dailyForecast)
    )
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + daysUntil)
    reorderByDate = d.toISOString().slice(0, 10)
  }

  const explanation = buildExplanation({
    modelTier,
    avg30,
    avg90,
    dailyForecast,
    leadTimeDays,
    trend,
    dowFactor,
    sources,
    confidence,
  })

  return {
    productId,
    branchId,
    modelTier,
    modelVersion: MODEL_VERSION,
    forecastDailyUsage: Number(dailyForecast.toFixed(6)),
    forecastReorderQty,
    reorderByDate,
    confidence,
    urgency,
    explanation,
    signals: {
      dayCount,
      sources,
      usage30: Number(usage30.toFixed(3)),
      usage90: Number(usage90.toFixed(3)),
      avg30: Number(avg30.toFixed(6)),
      avg90: Number(avg90.toFixed(6)),
      trend: modelTier === 'platinum' ? Number(trend.toFixed(4)) : undefined,
      dowFactor: modelTier === 'platinum' ? Number(dowFactor.toFixed(4)) : undefined,
      leadTimeDays,
      moq,
      orderMultiple,
      currentQty,
    },
    backtest: dayCount >= 14 ? backtestForecast(dailyUsage) : null,
  }
}

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
      if (!inv) continue

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
        })
      )
    }
  }

  return { forecasts, modelTier, skipped: null }
}
