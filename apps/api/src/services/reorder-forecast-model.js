import { calendarDay, calendarSeries, shiftDay } from '../lib/reorder-calendar.js'
import { applySupplierPackRounding } from '../lib/reorder-unit-normalize.js'

export const REORDER_MODEL_VERSION = 'v2'
const sum = (rows) => rows.reduce((total, row) => total + row.quantity, 0)
const window = (rows, end, days) =>
  rows.filter((row) => row.date >= shiftDay(end, -days) && row.date < end)

export function backtestForecast(dailyUsage, { asOf = calendarDay() } = {}) {
  const rows = calendarSeries(dailyUsage, asOf)
  const cutoff = shiftDay(asOf, -7)
  const train = window(rows, cutoff, 30)
  const holdout = window(rows, asOf, 7)
  const actual = sum(holdout)
  const predicted = train.length ? (sum(train) / train.length) * holdout.length : 0
  return {
    holdoutDays: holdout.length,
    trainingDays: train.length,
    actual: Number(actual.toFixed(3)),
    predicted: Number(predicted.toFixed(3)),
    mape: actual > 0 ? Number((Math.abs(predicted - actual) / actual).toFixed(4)) : null,
    absoluteError: Number(Math.abs(predicted - actual).toFixed(3)),
  }
}

export function computeProductForecast({
  productId,
  branchId,
  dailyUsage,
  sources = [],
  avgUnitPenalty = 0,
  currentQty,
  lowStockThreshold,
  leadTimeDays = 7,
  moq = 1,
  orderMultiple = 1,
  productUnit,
  modelTier,
  timeZone = 'UTC',
  asOf = calendarDay(new Date(), timeZone),
  stockScope = branchId ? 'branch' : 'restaurant',
}) {
  const rows = calendarSeries(dailyUsage, asOf)
  const recent = window(rows, asOf, 30)
  const usage30 = sum(recent)
  const usage90 = sum(rows)
  const avg30 = recent.length ? usage30 / recent.length : 0
  const avg90 = rows.length ? usage90 / rows.length : 0
  const measured = sources.includes('movement')
  const enough = measured && rows.length >= 7
  const sharedStock = branchId != null && stockScope !== 'branch'
  const signals = {
    dayCount: rows.length,
    sources,
    usage30,
    usage90,
    avg30,
    avg90,
    currentQty,
    leadTimeDays,
    moq,
    orderMultiple,
    asOf,
    timeZone,
    stockScope,
    insufficientHistory: !enough,
    sharedStock,
  }
  if (!enough || sharedStock) {
    return {
      productId,
      branchId,
      modelTier,
      modelVersion: REORDER_MODEL_VERSION,
      forecastDailyUsage: null,
      forecastReorderQty: null,
      reorderByDate: null,
      confidence: 0.1,
      urgency: currentQty <= (lowStockThreshold || 0) ? 'URGENT' : 'LOW',
      explanation: sharedStock
        ? 'Restaurant-wide stock is shared; a branch purchase quantity needs a branch stock count.'
        : 'Insufficient history of measured consumption; review stock and purchasing cadence manually.',
      signals,
      backtest: null,
    }
  }
  const lead = Math.max(0, Number(leadTimeDays) || 0)
  const coverageDays = lead + 14
  const previous = window(rows, shiftDay(asOf, -7), 23)
  const recent7 = window(rows, asOf, 7)
  const previousRate = previous.length ? sum(previous) / previous.length : avg30
  const recentRate = recent7.length ? sum(recent7) / recent7.length : avg30
  const trend =
    modelTier === 'platinum' && previousRate > 0
      ? Math.min(2, Math.max(0.5, recentRate / previousRate))
      : 1
  // Zero days count in weekday averages. Integrate all future weekdays, not only today's factor.
  const factors = Array.from({ length: 7 }, (_, dow) => {
    const matches = recent.filter((row) => new Date(`${row.date}T12:00:00Z`).getUTCDay() === dow)
    return matches.length && avg30 > 0 ? sum(matches) / matches.length / avg30 : 1
  })
  const baseRate =
    usage30 === 0 ? 0 : modelTier === 'platinum' ? avg30 * trend : avg30 * 0.6 + avg90 * 0.4
  let projectedDemand = 0
  for (let day = 0; day < coverageDays; day += 1) {
    const dow = new Date(`${shiftDay(asOf, day)}T12:00:00Z`).getUTCDay()
    projectedDemand += baseRate * (modelTier === 'platinum' ? factors[dow] : 1)
  }
  const daily = projectedDemand / Math.max(1, coverageDays)
  const raw = Math.max(
    0,
    Number((projectedDemand - Math.max(0, Number(currentQty) || 0)).toFixed(6))
  )
  const confidence = Math.max(
    0.1,
    Math.min(
      0.95,
      0.55 + (rows.length >= 21 ? 0.15 : 0) + (rows.length >= 45 ? 0.1 : 0) - avgUnitPenalty
    )
  )
  const daysLeft = daily > 0 ? Math.max(0, currentQty) / daily : null
  const urgency =
    raw === 0
      ? 'LOW'
      : currentQty <= (lowStockThreshold || 0)
        ? 'URGENT'
        : daysLeft < lead + 7
          ? 'HIGH'
          : 'MEDIUM'
  return {
    productId,
    branchId,
    modelTier,
    modelVersion: REORDER_MODEL_VERSION,
    forecastDailyUsage: Number(daily.toFixed(6)),
    forecastReorderQty:
      raw > 0 ? applySupplierPackRounding(raw, { moq, orderMultiple }, productUnit) : 0,
    reorderByDate:
      daily > 0 && raw > 0 ? shiftDay(asOf, Math.max(0, Math.floor(daysLeft - lead))) : null,
    confidence,
    urgency,
    explanation: `${rows.length} complete calendar days of measured inventory usage; ${daily.toFixed(2)} ${productUnit || 'units'}/day; ${coverageDays}-day coverage.`,
    signals: {
      ...signals,
      trend,
      projectedDemand,
      coverageDays,
      dataQuality: rows.length >= 21 ? 'good' : 'fair',
    },
    backtest: rows.length >= 14 ? backtestForecast(rows, { asOf }) : null,
  }
}
