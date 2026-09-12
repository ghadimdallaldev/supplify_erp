import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetReorderAssistance = vi.fn()
const mockIsAiPlatformEnabled = vi.fn()
const mockCheckUsage = vi.fn()
const mockIncrementUsage = vi.fn()
const mockCompleteJson = vi.fn()

vi.mock('../config/env.js', () => ({
  config: { AI_ENABLED: false, AI_PROVIDER: 'openai', OPENAI_API_KEY: '' },
}))

vi.mock('../lib/ai-platform.js', () => ({
  isAiEnvEnabled: () => false,
  isAiPlatformEnabledForTenant: (...args) => mockIsAiPlatformEnabled(...args),
}))

vi.mock('../lib/ai/index.js', () => ({
  getAiProvider: () => null,
}))

vi.mock('../lib/subscription.js', () => ({
  reserveAiUsage: (...args) => mockCheckUsage(...args),
  refundReservedAiUsage: (...args) => mockIncrementUsage(...args),
}))

vi.mock('../lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
}))

vi.mock('./restaurant-reorder-assistance.service.js', () => ({
  getReorderAssistance: (...args) => mockGetReorderAssistance(...args),
}))

describe('reorder-ai.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAiPlatformEnabled.mockResolvedValue(false)
    mockCheckUsage.mockResolvedValue({ allowed: true, meterType: 'ai_requests_per_day' })
    mockIncrementUsage.mockResolvedValue(undefined)
    mockGetReorderAssistance.mockResolvedValue({
      suggestions: [
        {
          productId: 'p1',
          productName: 'Tomatoes',
          reasonLabel: 'Low stock',
          reasonCode: 'low_stock',
          suggestedQty: 5,
        },
      ],
      forecasts: [
        {
          productId: 'p1',
          explanation: 'Usage trending up over 30 days',
        },
      ],
    })
  })

  it('explainReorderSuggestions returns heuristic when AI env is off', async () => {
    const { explainReorderSuggestions } = await import('./reorder-ai.service.js')
    const result = await explainReorderSuggestions('r1', {
      smartReorderFeatureValue: 'full_90day_trends',
    })
    expect(result.usedLlm).toBe(false)
    expect(result.source).toBe('heuristic')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].rationale).toContain('Usage trending')
  })

  it('parseReorderIntent returns keyword heuristic when AI is off', async () => {
    mockGetReorderAssistance.mockResolvedValue({
      suggestions: [
        {
          productId: 'p1',
          productName: 'Tomatoes',
          suggestedQty: 3,
          supplierName: 'Farm Co',
        },
      ],
      forecasts: [],
    })
    const { parseReorderIntent } = await import('./reorder-ai.service.js')
    const result = await parseReorderIntent('r1', {
      query: 'tomatoes',
      smartReorderFeatureValue: 'ai_forecast_seasonality',
    })
    expect(result.usedLlm).toBe(false)
    expect(result.matchedProducts).toHaveLength(1)
    expect(result.matchedProducts[0].productId).toBe('p1')
  })
})
