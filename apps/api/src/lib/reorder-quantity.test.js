import { describe, it, expect } from 'vitest'
import {
  computeSuggestedReorderQty,
  SAFETY_BUFFER_DAYS,
  DEFAULT_LEAD_TIME_DAYS,
} from './reorder-quantity.js'

describe('computeSuggestedReorderQty', () => {
  it('uses order-up-to (usage x (lead + buffer)) minus on-hand', () => {
    // usage 2/day, lead 7 => coverage 21 days => target 42, on-hand 10 => 32
    const qty = computeSuggestedReorderQty({
      currentQty: 10,
      avgDailyUsage: 2,
      leadTimeDays: 7,
      moq: 1,
      orderMultiple: 1,
      belowThreshold: true,
      unit: 'unit',
    })
    expect(qty).toBe(2 * (7 + SAFETY_BUFFER_DAYS) - 10)
  })

  it('subtracts on-hand even when below threshold (no double-ordering)', () => {
    // Regression: below-threshold path previously ignored on-hand and over-ordered.
    const withOnHand = computeSuggestedReorderQty({
      currentQty: 20,
      avgDailyUsage: 2,
      leadTimeDays: 7,
      belowThreshold: true,
      unit: 'unit',
    })
    // target 42 - 20 = 22
    expect(withOnHand).toBe(22)
  })

  it('returns null when stock is healthy and not below reorder point', () => {
    const qty = computeSuggestedReorderQty({
      currentQty: 500,
      avgDailyUsage: 1,
      leadTimeDays: 7,
      belowThreshold: false,
      unit: 'unit',
    })
    expect(qty).toBeNull()
  })

  it('falls back to last order qty when below threshold with no usage', () => {
    const qty = computeSuggestedReorderQty({
      currentQty: 0,
      avgDailyUsage: 0,
      leadTimeDays: 7,
      lastOrderQty: 8,
      belowThreshold: true,
      unit: 'unit',
    })
    expect(qty).toBe(8)
  })

  it('falls back to MOQ when below threshold with no usage and no order history', () => {
    const qty = computeSuggestedReorderQty({
      currentQty: 0,
      avgDailyUsage: 0,
      leadTimeDays: 7,
      lastOrderQty: 0,
      moq: 5,
      belowThreshold: true,
      unit: 'unit',
    })
    expect(qty).toBe(5)
  })

  it('rounds up to MOQ', () => {
    const qty = computeSuggestedReorderQty({
      currentQty: 0,
      avgDailyUsage: 0.1,
      leadTimeDays: 7,
      moq: 12,
      belowThreshold: true,
      unit: 'unit',
    })
    expect(qty).toBe(12)
  })

  it('rounds up to the supplier pack multiple', () => {
    // target: 3/day * 21 = 63 - 0 on-hand = 63, multiple 10 => 70
    const qty = computeSuggestedReorderQty({
      currentQty: 0,
      avgDailyUsage: 3,
      leadTimeDays: 7,
      moq: 1,
      orderMultiple: 10,
      belowThreshold: true,
      unit: 'unit',
    })
    expect(qty).toBe(70)
  })

  it('defaults lead time when missing', () => {
    const qty = computeSuggestedReorderQty({
      currentQty: 0,
      avgDailyUsage: 1,
      leadTimeDays: null,
      belowThreshold: true,
      unit: 'unit',
    })
    expect(qty).toBe(1 * (DEFAULT_LEAD_TIME_DAYS + SAFETY_BUFFER_DAYS))
  })

  it('honours fractional units (kg) with 0.1 rounding', () => {
    const qty = computeSuggestedReorderQty({
      currentQty: 0,
      avgDailyUsage: 0.25,
      leadTimeDays: 3,
      moq: 1,
      orderMultiple: 1,
      belowThreshold: true,
      unit: 'kg',
    })
    // 0.25 * (3+14) = 4.25 -> max(moq 1, 4.25) = 4.25 -> snap 0.1 => 4.3 (round)
    expect(qty).toBeCloseTo(4.3, 5)
  })
})
