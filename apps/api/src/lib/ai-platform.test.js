import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  AI_ENABLED: false,
  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: '',
}))

vi.mock('../config/env.js', () => ({ config: mockConfig }))

vi.mock('./feature-flags.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isFeatureEnabledForTenant: vi.fn(async () => true),
  }
})

describe('ai-platform', () => {
  beforeEach(() => {
    mockConfig.AI_ENABLED = false
    mockConfig.OPENAI_API_KEY = ''
  })

  it('isAiEnvEnabled is false when AI_ENABLED is off', async () => {
    const { isAiEnvEnabled } = await import('./ai-platform.js')
    expect(isAiEnvEnabled()).toBe(false)
  })

  it('isAiEnvEnabled requires OpenAI key when provider is openai', async () => {
    mockConfig.AI_ENABLED = true
    mockConfig.OPENAI_API_KEY = ''
    const { isAiEnvEnabled } = await import('./ai-platform.js')
    expect(isAiEnvEnabled()).toBe(false)

    mockConfig.OPENAI_API_KEY = 'sk-test'
    expect(isAiEnvEnabled()).toBe(true)
  })

  it('canUseReorderAiExplain requires forecast capability', async () => {
    mockConfig.AI_ENABLED = true
    mockConfig.OPENAI_API_KEY = 'sk-test'
    const { canUseReorderAiExplain } = await import('./ai-platform.js')
    expect(await canUseReorderAiExplain('r1', 'RESTAURANT', false)).toBe(false)
    expect(await canUseReorderAiExplain('r1', 'RESTAURANT', 'full_90day_trends')).toBe(true)
    expect(await canUseReorderAiExplain('r1', 'RESTAURANT', 'ai_forecast_seasonality')).toBe(true)
  })

  it('canUseReorderAiAsk requires seasonality capability', async () => {
    mockConfig.AI_ENABLED = true
    mockConfig.OPENAI_API_KEY = 'sk-test'
    const { canUseReorderAiAsk } = await import('./ai-platform.js')
    expect(await canUseReorderAiAsk('r1', 'RESTAURANT', 'full_90day_trends')).toBe(false)
    expect(await canUseReorderAiAsk('r1', 'RESTAURANT', 'ai_forecast_seasonality')).toBe(true)
  })
})
