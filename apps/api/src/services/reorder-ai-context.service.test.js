import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}))

import {
  buildReorderAiContextForProduct,
  toLlmContextPayload,
} from './reorder-ai-context.service.js'

describe('reorder-ai-context.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds compact context with supplier options and baseline qty', () => {
    const ctx = buildReorderAiContextForProduct(
      {
        id: 'stock-p1',
        productId: 'p1',
        productName: 'Tomatoes',
        productUnit: 'kg',
        supplierId: 's1',
        supplierName: 'Fresh Co',
        urgency: 'HIGH',
        reasonCode: 'low_stock',
        reasonLabel: 'Low stock',
        suggestedQty: 8,
        currentQty: 2,
        leadTimeDays: 5,
        moq: 5,
        orderMultiple: 5,
        avgDailyUsage30: 1.2,
        lowStockThreshold: 3,
      },
      {
        forecastReorderQty: 10,
        confidence: 0.7,
        urgency: 'HIGH',
        explanation: 'Coverage for lead time',
        signals: { insufficientHistory: false, avg30: 1.2 },
      }
    )

    expect(ctx.baseSuggestedQuantity).toBe(10)
    expect(ctx.supplierOptions).toHaveLength(1)
    expect(ctx.eligibility.skipLlm).toBe(false)
    expect(ctx.eligibility.insufficientHistory).toBe(false)
  })

  it('skips LLM when insufficient history', () => {
    const ctx = buildReorderAiContextForProduct(
      {
        id: 'stock-p1',
        productId: 'p1',
        productName: 'Tomatoes',
        suggestedQty: null,
        supplierId: 's1',
        urgency: 'MEDIUM',
      },
      {
        forecastReorderQty: null,
        confidence: 0.1,
        signals: { insufficientHistory: true },
      }
    )
    expect(ctx.eligibility.skipLlm).toBe(true)
    expect(ctx.eligibility.skipReason).toBe('insufficient_history')
  })

  it('omits invented fields from LLM payload', () => {
    const ctx = buildReorderAiContextForProduct(
      {
        id: 'stock-p1',
        productId: 'p1',
        productName: 'Tomatoes',
        supplierId: 's1',
        suggestedQty: 5,
        urgency: 'HIGH',
      },
      null
    )
    const payload = toLlmContextPayload([ctx])[0]
    expect(payload.productId).toBe('p1')
    expect(payload.baseSuggestedQuantity).toBe(5)
    expect(payload).not.toHaveProperty('reservations')
    expect(payload).not.toHaveProperty('promotions')
  })
})
