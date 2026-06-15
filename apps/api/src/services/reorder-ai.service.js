import { z } from 'zod'
import { query } from '../lib/db.js'
import { getAiProvider } from '../lib/ai/index.js'
import { isAiEnvEnabled, isAiPlatformEnabledForTenant } from '../lib/ai-platform.js'
import { checkAndIncrementUsage } from '../lib/subscription.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { getReorderAssistance } from './restaurant-reorder-assistance.service.js'

const explainSchema = z.object({
  summary: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      rationale: z.string(),
    })
  ),
})

const askSchema = z.object({
  intent: z.string(),
  matchedProducts: z.array(
    z.object({
      productId: z.string(),
      qty: z.number().positive(),
      confidence: z.number().min(0).max(1),
    })
  ),
  clarifyingQuestion: z.string().optional(),
})

function buildHeuristicExplain(suggestions, forecasts) {
  const forecastByProduct = new Map(forecasts.map((f) => [f.productId, f]))
  const items = suggestions
    .filter((s) => s.productId)
    .slice(0, 10)
    .map((s) => {
      const f = forecastByProduct.get(s.productId)
      return {
        productId: String(s.productId),
        rationale:
          f?.explanation ||
          s.reasonLabel ||
          `Suggested because of ${s.reasonCode || 'inventory signals'}`,
      }
    })

  return {
    summary:
      items.length > 0
        ? `Found ${items.length} reorder suggestion(s) based on inventory usage and stock levels.`
        : 'No reorder suggestions right now.',
    items,
  }
}

async function logAiRequest({
  restaurantId,
  userId,
  endpoint,
  tokensIn,
  tokensOut,
  latencyMs,
  success,
  errorCode,
}) {
  try {
    await query(
      `
      INSERT INTO reorder_ai_request_log (
        restaurant_id, user_id, endpoint, tokens_in, tokens_out, latency_ms, success, error_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        restaurantId,
        userId ?? null,
        endpoint,
        tokensIn ?? 0,
        tokensOut ?? 0,
        latencyMs ?? null,
        success,
        errorCode ?? null,
      ]
    )
  } catch (error) {
    if (error.code === '42P01') return
    throw error
  }
}

/**
 * @param {string} restaurantId
 * @param {{ smartReorderFeatureValue: unknown, branchId?: string | null, userId?: string }} opts
 */
export async function explainReorderSuggestions(restaurantId, opts) {
  const assistance = await getReorderAssistance(restaurantId, {
    smartReorderFeatureValue: opts.smartReorderFeatureValue,
    branchId: opts.branchId ?? null,
    limit: 15,
  })
  const forecasts = assistance.forecasts || []
  const aiPlatformOn = await isAiPlatformEnabledForTenant(restaurantId, 'RESTAURANT')

  if (!isAiEnvEnabled() || !aiPlatformOn) {
    const heuristic = buildHeuristicExplain(assistance.suggestions, forecasts)
    return { ...heuristic, source: 'heuristic', usedLlm: false }
  }

  const provider = getAiProvider()
  if (!provider) {
    const heuristic = buildHeuristicExplain(assistance.suggestions, forecasts)
    return { ...heuristic, source: 'heuristic', usedLlm: false }
  }

  const payload = {
    suggestions: assistance.suggestions.map((s) => ({
      productId: s.productId,
      productName: s.productName,
      reasonCode: s.reasonCode,
      urgency: s.urgency,
      suggestedQty: s.suggestedQty,
      forecast: s.forecast?.explanation || s.forecast?.signals || null,
    })),
  }

  try {
    const usage = await checkAndIncrementUsage(restaurantId, 'RESTAURANT', 'ai_requests_per_day', 1)
    if (!usage.allowed) {
      const heuristic = buildHeuristicExplain(assistance.suggestions, forecasts)
      return {
        ...heuristic,
        source: 'heuristic',
        usedLlm: false,
        usageLimited: true,
      }
    }

    const result = await provider.completeJson({
      system:
        'You explain restaurant inventory reorder suggestions clearly and concisely. Use only provided data. Output JSON.',
      user: JSON.stringify(payload),
      schemaHint: '{"summary":"string","items":[{"productId":"uuid","rationale":"string"}]}',
    })

    const parsed = explainSchema.safeParse(result.data)
    if (!parsed.success) {
      const heuristic = buildHeuristicExplain(assistance.suggestions, forecasts)
      await logAiRequest({
        restaurantId,
        userId: opts.userId,
        endpoint: 'explain',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs,
        success: false,
        errorCode: 'invalid_schema',
      })
      return { ...heuristic, source: 'heuristic', usedLlm: false }
    }

    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'explain',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      success: true,
    })

    return { ...parsed.data, source: 'llm', usedLlm: true }
  } catch (error) {
    const heuristic = buildHeuristicExplain(assistance.suggestions, forecasts)
    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'explain',
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: null,
      success: false,
      errorCode: error.message?.slice(0, 120),
    })
    return { ...heuristic, source: 'heuristic', usedLlm: false }
  }
}

/**
 * @param {string} restaurantId
 * @param {{ query: string, smartReorderFeatureValue: unknown, branchId?: string | null, userId?: string }} opts
 */
export async function parseReorderIntent(restaurantId, opts) {
  const text = String(opts.query || '').trim()
  if (!text) {
    return { intent: '', matchedProducts: [], clarifyingQuestion: 'What would you like to order?' }
  }

  const assistance = await getReorderAssistance(restaurantId, {
    smartReorderFeatureValue: opts.smartReorderFeatureValue,
    branchId: opts.branchId ?? null,
    limit: 40,
  })

  const allowedProducts = assistance.suggestions
    .filter((s) => s.productId)
    .map((s) => ({
      productId: String(s.productId),
      productName: s.productName,
      suggestedQty: s.suggestedQty,
      supplierName: s.supplierName,
    }))

  const aiPlatformOn = await isAiPlatformEnabledForTenant(restaurantId, 'RESTAURANT')
  if (!isAiEnvEnabled() || !getAiProvider() || !aiPlatformOn) {
    const keyword = text.toLowerCase()
    const matched = allowedProducts
      .filter((p) => p.productName?.toLowerCase().includes(keyword.split(' ')[0]))
      .slice(0, 5)
      .map((p) => ({
        productId: p.productId,
        qty: Math.max(1, p.suggestedQty || 1),
        confidence: 0.4,
      }))
    return {
      intent: text,
      matchedProducts: matched,
      clarifyingQuestion: matched.length
        ? undefined
        : 'Try naming a product from your suggestions list.',
      source: 'heuristic',
      usedLlm: false,
    }
  }

  const provider = getAiProvider()
  try {
    const usage = await checkAndIncrementUsage(restaurantId, 'RESTAURANT', 'ai_requests_per_day', 1)
    if (!usage.allowed) {
      throw new ValidationError('Daily AI assist limit reached for your plan')
    }

    const result = await provider.completeJson({
      system:
        'Map the user request to products from the allowed list only. Never invent product IDs. Output JSON.',
      user: JSON.stringify({ query: text, allowedProducts }),
      schemaHint:
        '{"intent":"string","matchedProducts":[{"productId":"uuid","qty":number,"confidence":number}],"clarifyingQuestion":"string optional"}',
    })

    const parsed = askSchema.safeParse(result.data)
    const allowedIds = new Set(allowedProducts.map((p) => p.productId))
    const safeItems = (parsed.success ? parsed.data.matchedProducts : [])
      .filter((m) => allowedIds.has(m.productId))
      .map((m) => ({
        productId: m.productId,
        qty: m.qty,
        confidence: m.confidence,
        productName: allowedProducts.find((p) => p.productId === m.productId)?.productName,
      }))

    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'ask',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      success: parsed.success,
      errorCode: parsed.success ? null : 'invalid_schema',
    })

    if (!parsed.success) {
      return {
        intent: text,
        matchedProducts: [],
        clarifyingQuestion: 'Could not match products — try being more specific.',
        source: 'heuristic',
        usedLlm: false,
      }
    }

    return {
      intent: parsed.data.intent,
      matchedProducts: safeItems,
      clarifyingQuestion: safeItems.length
        ? parsed.data.clarifyingQuestion
        : 'Which items did you mean?',
      source: 'llm',
      usedLlm: true,
    }
  } catch (error) {
    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'ask',
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: error.message?.slice(0, 120),
    })
    throw error
  }
}
