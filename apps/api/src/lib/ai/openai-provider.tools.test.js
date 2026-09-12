import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createOpenAiProvider } from './openai-provider.js'

const createMock = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args) => createMock(...args),
      },
    },
  })),
}))

vi.mock('../../config/env.js', () => ({
  config: {
    OPENAI_API_KEY: 'sk-test',
    AI_MODEL: 'gpt-4o-mini',
    AI_REQUEST_TIMEOUT_MS: 5000,
    AI_MAX_RETRIES: 0,
  },
}))

describe('createOpenAiProvider.completeWithTools', () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  it('runs a tool call then returns final text', async () => {
    createMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'get_inventory', arguments: '{"search":"tomato"}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'You have 12 kg of tomatoes.' } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      })

    const executeTool = vi.fn().mockResolvedValue({
      items: [{ productName: 'Tomato', quantity: 12, unit: 'kg' }],
    })

    const provider = createOpenAiProvider()
    const result = await provider.completeWithTools({
      system: 'You are a test assistant.',
      messages: [{ role: 'user', content: 'how many tomato kilos?' }],
      tools: [
        {
          name: 'get_inventory',
          description: 'inventory',
          parameters: { type: 'object', properties: { search: { type: 'string' } } },
        },
      ],
      executeTool,
      maxRounds: 4,
    })

    expect(executeTool).toHaveBeenCalledWith('get_inventory', { search: 'tomato' })
    expect(result.reply).toBe('You have 12 kg of tomatoes.')
    expect(result.usedLlm).toBe(true)
    expect(result.sources).toEqual([
      { tool: 'get_inventory', args: { search: 'tomato' }, ok: true },
    ])
  })
})
