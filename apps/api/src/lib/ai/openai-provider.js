import OpenAI from 'openai'
import { config } from '../../config/env.js'

/** @type {import('./provider.js').AiProvider} */
export function createOpenAiProvider() {
  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    timeout: config.AI_REQUEST_TIMEOUT_MS,
    maxRetries: config.AI_MAX_RETRIES,
  })

  return {
    async completeJson({ system, user, schemaHint }) {
      const started = Date.now()
      const response = await client.chat.completions.create({
        model: config.AI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: schemaHint ? `${user}\n\nRespond with JSON matching: ${schemaHint}` : user,
          },
        ],
      })

      const text = response.choices[0]?.message?.content || '{}'
      let data
      try {
        data = JSON.parse(text)
      } catch {
        data = { raw: text }
      }

      return {
        data,
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: response.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - started,
        usedLlm: true,
      }
    },

    /**
     * Multi-turn tool-calling loop. Executes up to maxRounds of tool calls, then returns final text.
     */
    async completeWithTools({ system, messages, tools, executeTool, maxRounds = 4 }) {
      const started = Date.now()
      let tokensIn = 0
      let tokensOut = 0
      /** @type {Array<{ tool: string, args: unknown, ok: boolean }>} */
      const sources = []

      const openaiTools = (tools || []).map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }))

      /** @type {import('openai').Chat.ChatCompletionMessageParam[]} */
      const thread = [{ role: 'system', content: system }, ...messages]

      let rounds = 0
      while (rounds < maxRounds) {
        rounds += 1
        const response = await client.chat.completions.create({
          model: config.AI_MODEL,
          temperature: 0.2,
          messages: thread,
          tools: openaiTools.length ? openaiTools : undefined,
          tool_choice: openaiTools.length ? 'auto' : undefined,
        })

        tokensIn += response.usage?.prompt_tokens ?? 0
        tokensOut += response.usage?.completion_tokens ?? 0

        const choice = response.choices[0]?.message
        if (!choice) {
          return {
            reply: 'I could not generate a reply. Please try again.',
            sources,
            tokensIn,
            tokensOut,
            latencyMs: Date.now() - started,
            usedLlm: true,
          }
        }

        const toolCalls = choice.tool_calls || []
        if (!toolCalls.length) {
          return {
            reply: String(choice.content || '').trim() || 'I could not find an answer.',
            sources,
            tokensIn,
            tokensOut,
            latencyMs: Date.now() - started,
            usedLlm: true,
          }
        }

        thread.push({
          role: 'assistant',
          content: choice.content || null,
          tool_calls: toolCalls,
        })

        for (const call of toolCalls) {
          const name = call.function?.name || 'unknown'
          let args = {}
          try {
            args = JSON.parse(call.function?.arguments || '{}')
          } catch {
            args = {}
          }

          let result
          let ok = true
          try {
            result = await executeTool(name, args)
          } catch (err) {
            ok = false
            result = { error: err?.message || 'Tool failed' }
          }
          sources.push({ tool: name, args, ok })
          thread.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result ?? null),
          })
        }
      }

      // Force a final answer without further tools after max rounds.
      const final = await client.chat.completions.create({
        model: config.AI_MODEL,
        temperature: 0.2,
        messages: [
          ...thread,
          {
            role: 'user',
            content:
              'Using only the tool results above, give your final answer now. Do not call more tools.',
          },
        ],
      })
      tokensIn += final.usage?.prompt_tokens ?? 0
      tokensOut += final.usage?.completion_tokens ?? 0

      return {
        reply: String(final.choices[0]?.message?.content || '').trim() || 'I could not find an answer.',
        sources,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - started,
        usedLlm: true,
      }
    },
  }
}
