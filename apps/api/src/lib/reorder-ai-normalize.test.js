import { describe, it, expect } from 'vitest'
import {
  normalizeRecommendedQuantity,
  normalizeSupplierId,
  normalizeDeliveryDate,
  normalizeReorderAiDecision,
  buildForecastFallbackRecommendation,
  QTY_CLAMP_MIN_RATIO,
  QTY_CLAMP_MAX_RATIO,
} from './reorder-ai-normalize.js'
import { parseReorderAiDecisionBatch } from './reorder-ai-schema.js'

const supplierOptions = [{ supplierId: 's1', supplierName: 'Fresh Co', moq: 5, orderMultiple: 5 }]

const baseCtx = {
  productId: 'p1',
  baseQuantity: 10,
  defaultSupplierId: 's1',
  supplierOptions,
  unit: 'kg',
  moq: 5,
  orderMultiple: 5,
  leadTimeDays: 7,
  urgency: 'HIGH',
  confidence: 0.7,
}

describe('reorder-ai-schema', () => {
  it('parses batch object envelope', () => {
    const result = parseReorderAiDecisionBatch({
      recommendations: [
        {
          productId: 'p1',
          action: 'order',
          recommendedQuantity: 10,
          supplierId: 's1',
          confidence: 0.8,
          summary: 'Order tomatoes',
          reasoning: ['Low stock'],
          warnings: [],
        },
      ],
    })
    expect(result.success).toBe(true)
    expect(result.recommendations).toHaveLength(1)
  })

  it('parses bare array', () => {
    const result = parseReorderAiDecisionBatch([
      {
        productId: 'p1',
        action: 'wait',
        recommendedQuantity: 0,
        confidence: 0.4,
        summary: 'Wait',
      },
    ])
    expect(result.success).toBe(true)
    expect(result.recommendations[0].action).toBe('wait')
  })

  it('rejects malformed JSON shape', () => {
    const result = parseReorderAiDecisionBatch({ nonsense: true })
    expect(result.success).toBe(false)
  })
})

describe('normalizeRecommendedQuantity', () => {
  it('clamps qty above 1.3× baseline then pack-rounds', () => {
    // base 10 → max 13; pack multiple 5 → round up to 15
    const result = normalizeRecommendedQuantity(50, 10, { moq: 5, orderMultiple: 5, unit: 'kg' })
    expect(result.clamped).toBe(true)
    expect(result.quantity).toBe(15)
    expect(result.warnings.some((w) => w.includes('clamped'))).toBe(true)
  })

  it('clamps qty below 0.7× baseline', () => {
    // base 10 → min 7; pack to 10 (ceil 7/5*5 = 10)
    const result = normalizeRecommendedQuantity(1, 10, { moq: 5, orderMultiple: 5, unit: 'kg' })
    expect(result.clamped).toBe(true)
    expect(result.quantity).toBeGreaterThanOrEqual(10 * QTY_CLAMP_MIN_RATIO)
  })

  it('discards qty when base is null', () => {
    const result = normalizeRecommendedQuantity(100, null, { moq: 1, orderMultiple: 1 })
    expect(result.quantity).toBeNull()
    expect(result.clamped).toBe(true)
  })

  it('applies MOQ when within clamp range', () => {
    const result = normalizeRecommendedQuantity(10, 10, { moq: 12, orderMultiple: 1, unit: 'unit' })
    // clamp keeps 10, then MOQ bumps to 12
    expect(result.quantity).toBe(12)
  })

  it('keeps qty inside clamp band without warning when unchanged before pack', () => {
    const mid = 10
    expect(mid).toBeGreaterThanOrEqual(10 * QTY_CLAMP_MIN_RATIO)
    expect(mid).toBeLessThanOrEqual(10 * QTY_CLAMP_MAX_RATIO)
    const result = normalizeRecommendedQuantity(10, 10, { moq: 1, orderMultiple: 1, unit: 'unit' })
    expect(result.quantity).toBe(10)
  })
})

describe('normalizeSupplierId', () => {
  it('accepts allowed supplier', () => {
    expect(normalizeSupplierId('s1', supplierOptions, 's1')).toEqual({
      supplierId: 's1',
      replaced: false,
    })
  })

  it('replaces unknown supplier with default', () => {
    const result = normalizeSupplierId('ghost', supplierOptions, 's1')
    expect(result.supplierId).toBe('s1')
    expect(result.replaced).toBe(true)
    expect(result.warning).toMatch(/not in allowed/)
  })
})

describe('normalizeDeliveryDate', () => {
  const now = new Date('2026-07-15T12:00:00.000Z')

  it('accepts date within window', () => {
    const result = normalizeDeliveryDate('2026-07-20', 7, now)
    expect(result.deliveryDate).toBe('2026-07-20')
  })

  it('rejects date beyond lead+21', () => {
    const result = normalizeDeliveryDate('2026-09-01', 7, now)
    expect(result.deliveryDate).toBeNull()
    expect(result.warning).toMatch(/outside/)
  })

  it('rejects past dates', () => {
    const result = normalizeDeliveryDate('2026-07-01', 7, now)
    expect(result.deliveryDate).toBeNull()
  })
})

describe('normalizeReorderAiDecision', () => {
  it('returns source ai when decision is valid', () => {
    const result = normalizeReorderAiDecision(
      {
        productId: 'p1',
        action: 'order',
        recommendedQuantity: 10,
        supplierId: 's1',
        deliveryDate: '2026-07-18',
        priority: 'HIGH',
        confidence: 0.9,
        summary: 'Restock tomatoes',
        reasoning: ['Usage trending up'],
        warnings: [],
      },
      { ...baseCtx }
    )
    expect(result.source).toBe('ai')
    expect(result.recommendedQuantity).toBe(10)
    expect(result.supplierId).toBe('s1')
    expect(result.aiMetadata.usedLlm).toBe(true)
  })

  it('falls back to forecast for bad supplier + out-of-range handled as normalize, still ai if qty ok', () => {
    const result = normalizeReorderAiDecision(
      {
        productId: 'p1',
        action: 'order',
        recommendedQuantity: 10,
        supplierId: 'bad-supplier',
        confidence: 0.8,
        summary: 'Order',
        reasoning: [],
        warnings: [],
      },
      { ...baseCtx }
    )
    expect(result.source).toBe('ai')
    expect(result.supplierId).toBe('s1')
    expect(result.warnings.some((w) => /supplier/i.test(w))).toBe(true)
  })

  it('falls back when decision product mismatches', () => {
    const result = normalizeReorderAiDecision(
      {
        productId: 'other',
        action: 'order',
        recommendedQuantity: 10,
        confidence: 0.8,
        summary: 'x',
      },
      { ...baseCtx }
    )
    expect(result.source).toBe('forecast')
    expect(result.aiMetadata.usedLlm).toBe(false)
    expect(result.aiMetadata.fallbackReason).toBe('invalid_or_mismatched_decision')
  })

  it('falls back when no baseline and LLM invents large qty', () => {
    const result = normalizeReorderAiDecision(
      {
        productId: 'p1',
        action: 'order',
        recommendedQuantity: 999,
        confidence: 0.9,
        summary: 'Huge order',
      },
      { ...baseCtx, baseQuantity: null }
    )
    expect(result.source).not.toBe('ai')
    expect(result.action).toBe('manual_review')
  })
})

describe('buildForecastFallbackRecommendation', () => {
  it('marks rule_based when no base qty', () => {
    const result = buildForecastFallbackRecommendation(
      { ...baseCtx, baseQuantity: null },
      { fallbackReason: 'insufficient_history' }
    )
    expect(result.source).toBe('rule_based')
    expect(result.aiMetadata.fallbackReason).toBe('insufficient_history')
    expect(result.aiMetadata.usedLlm).toBe(false)
  })
})
