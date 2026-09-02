import { describe, it, expect } from 'vitest'
import { computeProductForecast, backtestForecast } from './reorder-forecast.service.js'
import { applySupplierPackRounding } from '../lib/reorder-unit-normalize.js'

describe('reorder-forecast.service', () => {
  const baseDaily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - (29 - i))
    return { date: d.toISOString().slice(0, 10), quantity: 2 }
  })

  it('computes gold forecast with movement history', () => {
    const result = computeProductForecast({
      productId: 'p1',
      branchId: null,
      dailyUsage: baseDaily,
      sources: ['movement'],
      avgUnitPenalty: 0,
      currentQty: 5,
      lowStockThreshold: 10,
      leadTimeDays: 7,
      moq: 1,
      orderMultiple: 1,
      productUnit: 'kg',
      modelTier: 'gold',
    })
    expect(result.forecastDailyUsage).toBeGreaterThan(0)
    expect(result.forecastReorderQty).toBeGreaterThan(0)
    expect(result.confidence).toBeGreaterThan(0.3)
    expect(result.explanation).toContain('inventory usage')
  })

  it('applies platinum seasonality and trend without crashing', () => {
    const result = computeProductForecast({
      productId: 'p1',
      branchId: 'b1',
      dailyUsage: baseDaily,
      sources: ['movement'],
      avgUnitPenalty: 0,
      currentQty: 2,
      lowStockThreshold: 5,
      leadTimeDays: 5,
      moq: 2,
      orderMultiple: 4,
      productUnit: 'case',
      modelTier: 'platinum',
    })
    expect(result.modelTier).toBe('platinum')
    expect(result.signals.trend).toBeDefined()
    expect(result.forecastReorderQty % 4).toBe(0)
  })

  it('returns graceful fallback when history insufficient', () => {
    const result = computeProductForecast({
      productId: 'p1',
      branchId: null,
      dailyUsage: [],
      sources: [],
      avgUnitPenalty: 0,
      currentQty: 1,
      lowStockThreshold: 5,
      leadTimeDays: 7,
      moq: 1,
      orderMultiple: 1,
      productUnit: 'kg',
      modelTier: 'gold',
    })
    expect(result.forecastDailyUsage).toBeNull()
    expect(result.signals.insufficientHistory).toBe(true)
    expect(result.explanation).toContain('Insufficient history')
  })

  it('backtest returns mape for holdout window', () => {
    const bt = backtestForecast(baseDaily)
    expect(bt.holdoutDays).toBe(7)
    expect(bt.actual).toBeGreaterThan(0)
    expect(bt.mape).toBeGreaterThanOrEqual(0)
  })
})

describe('reorder-unit-normalize', () => {
  it('rounds to order_multiple and moq', () => {
    expect(applySupplierPackRounding(5, { moq: 3, orderMultiple: 4 }, 'case')).toBe(8)
  })
})
