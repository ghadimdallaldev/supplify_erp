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
  checkAndIncrementUsage: (...args) => mockCheckUsage(...args),
  incrementUsage: (...args) => mockIncrementUsage(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn(async (sql) => {
    if (String(sql).includes('COUNT(*)')) {
      return { rows: [{ count: aiRequestsToday }] }
    }
    return { rows: [] }
  }),
}))

vi.mock('./restaurant-reorder-assistance.service.js', () => ({
  getReorderAssistance: (...args) => mockGetReorderAssistance(...args),
}))

describe('reorder-ai.service (LLM path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiRequestsToday = 0
    mockCheckUsage.mockResolvedValue({ allowed: true })
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
    expect(mockIncrementUsage).toHaveBeenCalledWith('r1', 'RESTAURANT', 'ai_requests_per_day', -1)
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
    mockCheckUsage.mockResolvedValue({ allowed: false, current: 20, limit: 20 })

    const { parseReorderIntent } = await import('./reorder-ai.service.js')
    const result = await parseReorderIntent('r1', {
      query: 'olive oil',
      smartReorderFeatureValue: 'ai_forecast_seasonality',
    })

    expect(result.usedLlm).toBe(false)
    expect(result.usageLimited).toBe(true)
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
    expect(mockIncrementUsage).toHaveBeenCalledWith('r1', 'RESTAURANT', 'ai_requests_per_day', -1)
  })
})
