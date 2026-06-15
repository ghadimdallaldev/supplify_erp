import OpenAI from 'openai'
import { config } from '../../config/env.js'

/** @type {import('./provider.js').AiProvider} */
export function createOpenAiProvider() {
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY })

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
  }
}
