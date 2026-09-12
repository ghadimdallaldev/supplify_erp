import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetReorderAssistance = vi.fn()
const mockCheckUsage = vi.fn()
const mockIncrementUsage = vi.fn()
const mockCompleteJson = vi.fn()
let aiRequestsToday = 0

vi.mock('../config/env.js', () => ({
  config: {
    AI_ENABLED: true,
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test',
    AI_MAX_REQUESTS_PER_TENANT_PER_DAY: 50,
  },
}))

vi.mock('../lib/ai-platform.js', () => ({
  isAiEnvEnabled: () => true,
  isAiPlatformEnabledForTenant: vi.fn().mockResolvedValue(true),
}))

vi.mock('../lib/ai/index.js', () => ({
  getAiProvider: () => ({ completeJson: (...args) => mockCompleteJson(...args) }),
}))

vi.mock('../lib/subscription.js', () => ({
  reserveAiUsage: (...args) => mockCheckUsage(...args),
  refundReservedAiUsage: (...args) => mockIncrementUsage(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn(async (sql) => {
    if (String(sql).includes('COUNT(*)')) {
      return { rows: [{ count: aiRequestsToday }] }
    }
    return { rows: [] }
  }),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('./restaurant-reorder-assistance.service.js', () => ({
  getReorderAssistance: (...args) => mockGetReorderAssistance(...args),
}))

describe('reorder-ai.service (LLM path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiRequestsToday = 0
    mockCheckUsage.mockResolvedValue({ allowed: true, meterType: 'ai_requests_per_day' })
    mockIncrementUsage.mockResolvedValue(undefined)
    mockGetReorderAssistance.mockResolvedValue({
      suggestions: [
        { productId: 'p1', productName: 'Tomatoes', reasonCode: 'low_stock', suggestedQty: 5 },
        { productId: 'p2', productName: 'Olive Oil', reasonCode: 'frequent', suggestedQty: 2 },
      ],
      forecasts: [],
    })
  })

  it('explain filters out hallucinated product IDs not in the suggestion set', async () => {
    mockCompleteJson.mockResolvedValue({
      data: {
        summary: 'Two items need attention.',
        items: [
          { productId: 'p1', rationale: 'Below reorder point' },
          { productId: 'ghost-999', rationale: 'Invented by the model' },
        ],
      },
      tokensIn: 100,
      tokensOut: 50,
      latencyMs: 12,
    })

    const { explainReorderSuggestions } = await import('./reorder-ai.service.js')
    const result = await explainReorderSuggestions('r1', {
      smartReorderFeatureValue: 'full_90day_trends',
    })

    expect(result.usedLlm).toBe(true)
    expect(result.source).toBe('llm')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].productId).toBe('p1')
  })

  it('explain refunds usage and falls back to heuristic on invalid schema', async () => {
    mockCompleteJson.mockResolvedValue({
      data: { nonsense: true },
      tokensIn: 10,
      tokensOut: 0,
      latencyMs: 5,
    })

    const { explainReorderSuggestions } = await import('./reorder-ai.service.js')
    const result = await explainReorderSuggestions('r1', {
      smartReorderFeatureValue: 'full_90day_trends',
    })

    expect(result.usedLlm).toBe(false)
    expect(result.source).toBe('heuristic')
    // Reserved unit refunded (-1) because the LLM output was unusable.
    expect(mockIncrementUsage).toHaveBeenCalledWith(
      'r1',
      'RESTAURANT',
      expect.objectContaining({ meterType: 'ai_requests_per_day' })
    )
  })

  it('explain respects the env per-tenant daily ceiling without calling the LLM', async () => {
    aiRequestsToday = 50 // == AI_MAX_REQUESTS_PER_TENANT_PER_DAY

    const { explainReorderSuggestions } = await import('./reorder-ai.service.js')
    const result = await explainReorderSuggestions('r1', {
      smartReorderFeatureValue: 'full_90day_trends',
    })

    expect(result.usageLimited).toBe(true)
    expect(result.usedLlm).toBe(false)
    expect(mockCompleteJson).not.toHaveBeenCalled()
    expect(mockCheckUsage).not.toHaveBeenCalled()
  })

  it('ask falls back to heuristic (no throw) when the plan limit is reached', async () => {
    const trialResetAt = '2026-08-14T00:00:00.000Z'
    mockCheckUsage.mockResolvedValue({
      allowed: false,
      current: 50,
      limit: 50,
      meterType: 'ai_trial_requests_total',
      periodType: 'trial_total',
      resetAt: trialResetAt,
      trialPool: true,
    })

    const { parseReorderIntent } = await import('./reorder-ai.service.js')
    const result = await parseReorderIntent('r1', {
      query: 'olive oil',
      smartReorderFeatureValue: 'ai_forecast_seasonality',
    })

    expect(result.usedLlm).toBe(false)
    expect(result.usageLimited).toBe(true)
    expect(result.resetAt).toBe(trialResetAt)
    expect(result.aiUsage).toMatchObject({
      meterType: 'ai_trial_requests_total',
      periodType: 'trial_total',
      current: 50,
      limit: 50,
      resetAt: trialResetAt,
      trialPool: true,
    })
    // Keyword fallback still matches "Olive Oil".
    expect(result.matchedProducts.map((m) => m.productId)).toContain('p2')
    expect(mockCompleteJson).not.toHaveBeenCalled()
  })

  it('ask matches across multiple query tokens, not just the first word', async () => {
    mockGetReorderAssistance.mockResolvedValue({
      suggestions: [
        { productId: 'p3', productName: 'Roma Tomatoes', suggestedQty: 4, supplierName: 'Farm' },
        { productId: 'p4', productName: 'Yellow Onions', suggestedQty: 3, supplierName: 'Farm' },
      ],
      forecasts: [],
    })
    // Force the heuristic path by disabling the plan usage.
    mockCheckUsage.mockResolvedValue({ allowed: false })

    const { parseReorderIntent } = await import('./reorder-ai.service.js')
    const result = await parseReorderIntent('r1', {
      query: 'order more roma tomatoes please',
      smartReorderFeatureValue: 'ai_forecast_seasonality',
    })

    expect(result.matchedProducts[0]?.productId).toBe('p3')
  })

  it('ask falls back to keyword matching when LLM returns invalid schema', async () => {
    mockCompleteJson.mockResolvedValue({
      data: { unexpected: true },
      tokensIn: 12,
      tokensOut: 0,
      latencyMs: 8,
    })

    const { parseReorderIntent } = await import('./reorder-ai.service.js')
    const result = await parseReorderIntent('r1', {
      query: 'olive oil',
      smartReorderFeatureValue: 'ai_forecast_seasonality',
    })

    expect(result.usedLlm).toBe(false)
    expect(result.source).toBe('heuristic')
    expect(result.matchedProducts.map((m) => m.productId)).toContain('p2')
    expect(mockIncrementUsage).toHaveBeenCalledWith(
      'r1',
      'RESTAURANT',
      expect.objectContaining({ meterType: 'ai_requests_per_day' })
    )
  })

  const eligibleContext = {
    productId: 'p1',
    suggestionId: 'stock-p1',
    productName: 'Tomatoes',
    productUnit: 'kg',
    urgency: 'HIGH',
    reasonCode: 'low_stock',
    reasonLabel: 'Low stock',
    baseSuggestedQuantity: 10,
    defaultSupplierId: 's1',
    supplierOptions: [{ supplierId: 's1', supplierName: 'Fresh Co', moq: 1, orderMultiple: 1 }],
    moq: 1,
    orderMultiple: 1,
    leadTimeDays: 7,
    forecast: { confidence: 0.7, explanation: 'Lead-time coverage' },
    eligibility: { skipLlm: false },
  }

  it('recommend returns source ai on success and increments usage once per batch', async () => {
    mockCompleteJson.mockResolvedValue({
      data: {
        recommendations: [
          {
            productId: 'p1',
            action: 'order',
            recommendedQuantity: 10,
            supplierId: 's1',
            confidence: 0.9,
            summary: 'Restock tomatoes',
            reasoning: ['Below threshold'],
            warnings: [],
          },
        ],
      },
      tokensIn: 40,
      tokensOut: 20,
      latencyMs: 15,
    })

    const { generateReorderRecommendations } = await import('./reorder-ai.service.js')
    const result = await generateReorderRecommendations([eligibleContext], { restaurantId: 'r1' })

    expect(result.usedLlm).toBe(true)
    expect(result.recommendations[0].source).toBe('ai')
    expect(mockCheckUsage).toHaveBeenCalledTimes(1)
    expect(mockCompleteJson).toHaveBeenCalledTimes(1)
  })

  it('recommend falls back on malformed JSON and refunds usage', async () => {
    mockCompleteJson.mockResolvedValue({
      data: { nonsense: true },
      tokensIn: 5,
      tokensOut: 0,
      latencyMs: 3,
    })

    const { generateReorderRecommendations } = await import('./reorder-ai.service.js')
    const result = await generateReorderRecommendations([eligibleContext], { restaurantId: 'r1' })

    expect(result.usedLlm).toBe(false)
    expect(result.recommendations[0].source).not.toBe('ai')
    expect(result.recommendations[0].aiMetadata.fallbackReason).toBe('invalid_schema')
    expect(mockIncrementUsage).toHaveBeenCalledWith(
      'r1',
      'RESTAURANT',
      expect.objectContaining({ meterType: 'ai_requests_per_day' })
    )
  })

  it('recommend skips LLM for insufficient-history items without burning quota', async () => {
    const weak = {
      ...eligibleContext,
      productId: 'p2',
      suggestionId: 'stock-p2',
      baseSuggestedQuantity: null,
      eligibility: { skipLlm: true, skipReason: 'insufficient_history' },
    }

    const { generateReorderRecommendations } = await import('./reorder-ai.service.js')
    const result = await generateReorderRecommendations([weak], { restaurantId: 'r1' })

    expect(result.usedLlm).toBe(false)
    expect(mockCompleteJson).not.toHaveBeenCalled()
    expect(mockCheckUsage).not.toHaveBeenCalled()
    expect(result.recommendations[0].aiMetadata.fallbackReason).toBe('insufficient_history')
  })

  it('recommend clamps out-of-range qty and replaces bad supplier', async () => {
    mockCompleteJson.mockResolvedValue({
      data: {
        recommendations: [
          {
            productId: 'p1',
            action: 'order',
            recommendedQuantity: 1000,
            supplierId: 'ghost-supplier',
            confidence: 0.9,
            summary: 'Over-order',
            reasoning: [],
            warnings: [],
          },
        ],
      },
      tokensIn: 10,
      tokensOut: 10,
      latencyMs: 5,
    })

    const { generateReorderRecommendations } = await import('./reorder-ai.service.js')
    const result = await generateReorderRecommendations([eligibleContext], { restaurantId: 'r1' })

    expect(result.recommendations[0].source).toBe('ai')
    expect(result.recommendations[0].recommendedQuantity).toBeLessThanOrEqual(13)
    expect(result.recommendations[0].supplierId).toBe('s1')
    expect(result.recommendations[0].warnings.join(' ')).toMatch(/clamped|supplier/i)
  })
})
