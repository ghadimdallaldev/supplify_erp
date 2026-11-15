import { describe, expect, it } from 'vitest'
import { backtestForecast, computeProductForecast } from './reorder-forecast-model.js'
import { calendarDay, shiftDay } from '../lib/reorder-calendar.js'
import { buildReorderGuidance } from '../lib/reorder-guidance.js'
import { normalizeReorderAiDecision } from '../lib/reorder-ai-normalize.js'

const asOf = '2026-11-14'
const history = (days, quantity = 2) =>
  Array.from({ length: days }, (_, i) => ({ date: shiftDay(asOf, i - days), quantity }))
const base = {
  productId: 'p1',
  branchId: null,
  dailyUsage: history(30),
  sources: ['movement'],
  currentQty: 5,
  lowStockThreshold: 3,
  leadTimeDays: 7,
  moq: 1,
  orderMultiple: 1,
  productUnit: 'kg',
  modelTier: 'gold',
  asOf,
}
const supply = (deliveries = []) => ({
  known: true,
  products: new Map([['p1', { deliveries, overdue: 0, uncertain: 0 }]]),
})
const item = {
  productId: 'p1',
  productUnit: 'kg',
  currentQty: 5,
  avgDailyUsage30: 2,
  leadTimeDays: 7,
  reasonCode: 'low_stock',
  suggestedQty: 99,
  moq: 1,
  orderMultiple: 4,
  stockScope: 'restaurant',
}

describe('reorder v2 calculations', () => {
  it('uses the restaurant calendar, including the midnight boundary', () => {
    expect(calendarDay(new Date('2026-11-13T23:30:00Z'), 'Asia/Beirut')).toBe(asOf)
  })
  it('ignores partial current-day usage and integrates an exact 21-day horizon', () => {
    const result = computeProductForecast({
      ...base,
      dailyUsage: [...history(30), { date: asOf, quantity: 9999 }],
    })
    expect(result.forecastDailyUsage).toBe(2)
    expect(result.forecastReorderQty).toBe(37)
    expect(result.signals.projectedDemand).toBe(42)
  })
  it('zero-fills observed days without diluting a short history across 90 days', () => {
    const result = computeProductForecast({
      ...base,
      dailyUsage: [{ date: shiftDay(asOf, -14), quantity: 14 }],
      currentQty: 0,
    })
    expect(result.signals.dayCount).toBe(14)
    expect(result.forecastDailyUsage).toBe(1)
  })
  it('keeps procurement-only history as manual guidance', () => {
    expect(
      computeProductForecast({ ...base, sources: ['order_fallback'] }).forecastReorderQty
    ).toBeNull()
  })
  it('requires a branch stock count rather than reusing shared stock', () => {
    const result = computeProductForecast({
      ...base,
      branchId: 'branch1',
      stockScope: 'restaurant',
    })
    expect(result.forecastReorderQty).toBeNull()
    expect(result.signals.sharedStock).toBe(true)
  })
  it('keeps zero need and floating-point equality at zero instead of adding the MOQ', () => {
    expect(computeProductForecast({ ...base, currentQty: 100 }).forecastReorderQty).toBe(0)
    expect(
      computeProductForecast({ ...base, currentQty: 2.1, dailyUsage: history(30, 0.1) })
        .forecastReorderQty
    ).toBe(0)
  })
  it('backtests against the training window immediately before the holdout', () => {
    const rows = history(37).map((row, i) => ({ ...row, quantity: i >= 30 ? 10 : 2 }))
    const result = backtestForecast(rows, { asOf })
    expect(result.trainingDays).toBe(30)
    expect(result.actual).toBe(70)
    expect(result.predicted).toBe(14)
    expect(result.mape).toBe(0.8)
  })
  it('integrates weekday factors across all future days', () => {
    const rows = history(35).map((row) => ({
      ...row,
      quantity: new Date(`${row.date}T12:00:00Z`).getUTCDay() === 0 ? 0 : 7,
    }))
    const result = computeProductForecast({ ...base, modelTier: 'platinum', dailyUsage: rows })
    expect(result.forecastDailyUsage).toBeGreaterThan(0)
    expect(result.signals.coverageDays).toBe(21)
  })
})

describe('shared reorder snapshot', () => {
  it('subtracts dependable incoming stock before rounding to a supplier pack', () => {
    const result = buildReorderGuidance(
      item,
      supply([{ quantity: 10, date: asOf, dependable: true }]),
      { asOf }
    )
    expect(result.netNeed).toBe(27)
    expect(result.suggestedQty).toBe(28)
  })
  it('does not wait when a delivery arrives after the first stockout', () => {
    const result = buildReorderGuidance(
      item,
      supply([{ quantity: 100, date: shiftDay(asOf, 10), dependable: true }]),
      { asOf }
    )
    expect(result.action).toBe('order')
    expect(result.netNeed).toBe(15)
    expect(result.warnings).toContain('incoming_after_stockout')
  })
  it('waits when on-hand and timely incoming supply cover demand', () => {
    const result = buildReorderGuidance(
      item,
      supply([{ quantity: 100, date: asOf, dependable: true }]),
      { asOf }
    )
    expect(result.action).toBe('wait')
    expect(result.suggestedQty).toBe(0)
  })
  it('treats failed or unknown-unit inbound checks as unknown supply', () => {
    for (const incoming of [
      { known: false, products: new Map() },
      { known: true, products: new Map([['p1', { known: false, deliveries: [] }]]) },
    ]) {
      const result = buildReorderGuidance(item, incoming, { asOf })
      expect(result.action).toBe('manual_review')
      expect(result.incomingQty).toBeNull()
      expect(result.suggestedQty).toBeNull()
    }
  })
  it('keeps expiry guidance separate from purchase quantities', () => {
    const result = buildReorderGuidance({ ...item, reasonCode: 'near_expiry' }, supply(), { asOf })
    expect(result.action).toBe('manual_review')
    expect(result.suggestedQty).toBeNull()
  })
  it('does not let the model override a deterministic wait decision', () => {
    const result = normalizeReorderAiDecision(
      { productId: 'p1', action: 'order', recommendedQuantity: 100 },
      { productId: 'p1', baseQuantity: 0, action: 'wait' }
    )
    expect(result.action).toBe('wait')
    expect(result.recommendedQuantity).toBe(0)
  })
})
