import { z } from 'zod'
import { query } from '../lib/db.js'
import { config } from '../config/env.js'
import { getAiProvider } from '../lib/ai/index.js'
import { isAiEnvEnabled, isAiPlatformEnabledForTenant } from '../lib/ai-platform.js'
import { reserveAiUsage, refundReservedAiUsage } from '../lib/subscription.js'
import { logger } from '../lib/logger.js'
import { parseReorderAiDecisionBatch } from '../lib/reorder-ai-schema.js'
import {
  normalizeReorderAiDecision,
  buildForecastFallbackRecommendation,
} from '../lib/reorder-ai-normalize.js'
import { toLlmContextPayload } from './reorder-ai-context.service.js'
import { getReorderAssistance } from './restaurant-reorder-assistance.service.js'

const RECOMMEND_SYSTEM_PROMPT = `You are a restaurant purchasing assistant.
Use only the provided inventory, forecast, and supplier data. Do not invent products, suppliers, prices, or events.
Treat baseSuggestedQuantity / forecastReorderQty as the trusted numerical baseline.
Prefer action "order" when stock should be replenished, "wait" when inventory covers lead time, or "manual_review" when data is weak.
Keep recommendedQuantity close to the baseline. Output JSON only.`

const RECOMMEND_SCHEMA_HINT =
  '{"recommendations":[{"productId":"uuid","action":"order|wait|manual_review","recommendedQuantity":number|null,"supplierId":"uuid|null","deliveryDate":"YYYY-MM-DD|null","priority":"URGENT|HIGH|MEDIUM|LOW","confidence":0-1,"summary":"string","reasoning":["string"],"warnings":["string"],"alternatives":[{"recommendedQuantity":number,"supplierId":"uuid","rationale":"string"}],"dataQuality":"good|fair|poor"}]}'

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

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'some',
  'more',
  'order',
  'need',
  'please',
  'get',
  'buy',
  'want',
  'from',
  'this',
  'that',
  'our',
  'have',
])

/**
 * Rank allowed products by how many query terms appear in their name.
 * Used for the no-AI and quota-limited fallbacks. Scores across ALL query
 * tokens (not just the first word) so multi-word requests match sensibly.
 */
function buildKeywordMatches(text, allowedProducts) {
  const tokens = String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
  const terms = tokens.filter((t) => !STOP_WORDS.has(t))
  const effectiveTerms = terms.length > 0 ? terms : tokens

  const scored = allowedProducts
    .map((p) => {
      const name = String(p.productName || '').toLowerCase()
      const hits = effectiveTerms.filter((term) => name.includes(term)).length
      return { p, hits }
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)

  return scored.slice(0, 5).map(({ p, hits }) => ({
    productId: p.productId,
    qty: Math.max(1, p.suggestedQty || 1),
    confidence: Math.min(0.6, 0.3 + hits * 0.15),
    productName: p.productName,
  }))
}

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

/** Absolute per-tenant/day ceiling from env (safety cap on top of plan limits). */
function tenantDailyCeiling() {
  const n = Number(config.AI_MAX_REQUESTS_PER_TENANT_PER_DAY)
  return Number.isFinite(n) && n > 0 ? n : Infinity
}

/** Count today's AI request-log rows for a tenant (for the env ceiling). */
async function countTenantAiRequestsToday(restaurantId) {
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count
       FROM reorder_ai_request_log
       WHERE restaurant_id = $1 AND created_at >= CURRENT_DATE`,
      [restaurantId]
    )
    return rows[0]?.count ?? 0
  } catch {
    return 0
  }
}

/** True when the tenant has hit the env-configured daily AI ceiling. */
async function isOverTenantDailyCeiling(restaurantId) {
  const ceiling = tenantDailyCeiling()
  if (ceiling === Infinity) return false
  const used = await countTenantAiRequestsToday(restaurantId)
  return used >= ceiling
}

function nextAiResetAt() {
  const d = new Date()
  d.setUTCHours(24, 0, 0, 0)
  return d.toISOString()
}

function quotaLimitedDetails(usage = null) {
  const resetAt = usage?.resetAt ?? nextAiResetAt()
  const details = {
    usageLimited: true,
    resetAt,
    source: 'heuristic',
    usedLlm: false,
  }

  if (usage?.meterType) {
    details.aiUsage = {
      meterType: usage.meterType,
      periodType: usage.periodType,
      current: usage.current,
      limit: usage.limit,
      resetAt,
      trialPool: usage.trialPool === true,
    }
  }

  return details
}

/** Refund a reserved plan-usage unit when the LLM call did not produce a usable result. */
async function refundAiUsage(restaurantId, reservation) {
  await refundReservedAiUsage(restaurantId, 'RESTAURANT', reservation)
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
  const allowedIds = new Set(
    assistance.suggestions.filter((s) => s.productId).map((s) => String(s.productId))
  )
  const aiPlatformOn = await isAiPlatformEnabledForTenant(restaurantId, 'RESTAURANT')

  const heuristicResult = () => ({
    ...buildHeuristicExplain(assistance.suggestions, forecasts),
    source: 'heuristic',
    usedLlm: false,
  })

  if (!isAiEnvEnabled() || !aiPlatformOn) {
    return heuristicResult()
  }

  const provider = getAiProvider()
  if (!provider) {
    return heuristicResult()
  }

  // Env-level safety ceiling (independent of plan limits).
  if (await isOverTenantDailyCeiling(restaurantId)) {
    return { ...heuristicResult(), ...quotaLimitedDetails() }
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

  // Reserve a plan-usage unit up front to avoid races; refund if the call fails.
  const usage = await reserveAiUsage(restaurantId, 'RESTAURANT', 1)
  if (!usage.allowed) {
    return { ...heuristicResult(), ...quotaLimitedDetails(usage) }
  }

  try {
    const result = await provider.completeJson({
      system:
        'You explain restaurant inventory reorder suggestions clearly and concisely. Use only provided data. Output JSON.',
      user: JSON.stringify(payload),
      schemaHint: '{"summary":"string","items":[{"productId":"uuid","rationale":"string"}]}',
    })

    const parsed = explainSchema.safeParse(result.data)
    if (!parsed.success) {
      await refundAiUsage(restaurantId, usage)
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
      return heuristicResult()
    }

    // Guard against hallucinated product IDs: keep only items that map to a
    // real current suggestion (parity with the ask() allowlist).
    const safeItems = parsed.data.items.filter((item) => allowedIds.has(String(item.productId)))

    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'explain',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      success: true,
    })

    return { summary: parsed.data.summary, items: safeItems, source: 'llm', usedLlm: true }
  } catch (error) {
    await refundAiUsage(restaurantId, usage)
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
    return heuristicResult()
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

  const keywordFallback = (usageLimited = false) => {
    const matched = buildKeywordMatches(text, allowedProducts)
    return {
      intent: text,
      matchedProducts: matched,
      clarifyingQuestion: matched.length
        ? undefined
        : 'Try naming a product from your suggestions list.',
      source: 'heuristic',
      usedLlm: false,
      ...(usageLimited ? { usageLimited: true } : {}),
    }
  }

  const aiPlatformOn = await isAiPlatformEnabledForTenant(restaurantId, 'RESTAURANT')
  const provider = getAiProvider()
  if (!isAiEnvEnabled() || !provider || !aiPlatformOn) {
    return keywordFallback()
  }

  // Env-level safety ceiling (independent of plan limits) — fall back gracefully.
  if (await isOverTenantDailyCeiling(restaurantId)) {
    return { ...keywordFallback(true), resetAt: nextAiResetAt() }
  }

  // Reserve a plan-usage unit up front; on limit fall back to heuristics
  // (symmetric with explain — no hard error).
  const usage = await reserveAiUsage(restaurantId, 'RESTAURANT', 1)
  if (!usage.allowed) {
    return { ...keywordFallback(true), ...quotaLimitedDetails(usage) }
  }

  try {
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

    if (!parsed.success) {
      await refundAiUsage(restaurantId, usage)
      await logAiRequest({
        restaurantId,
        userId: opts.userId,
        endpoint: 'ask',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs,
        success: false,
        errorCode: 'invalid_schema',
      })
      return keywordFallback()
    }

    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'ask',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      success: true,
    })

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
    await refundAiUsage(restaurantId, usage)
    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'ask',
      tokensIn: 0,
      tokensOut: 0,
      success: false,
      errorCode: error.message?.slice(0, 120),
    })
    // Symmetric with explain: degrade to heuristic instead of throwing.
    return keywordFallback()
  }
}

/**
 * Map a context object into the normalize helper shape.
 * @param {object} ctx
 */
function contextToNormalizeCtx(ctx) {
  return {
    productId: ctx.productId,
    baseQuantity: ctx.baseSuggestedQuantity,
    defaultSupplierId: ctx.defaultSupplierId,
    supplierOptions: ctx.supplierOptions || [],
    unit: ctx.productUnit,
    moq: ctx.moq,
    orderMultiple: ctx.orderMultiple,
    leadTimeDays: ctx.leadTimeDays,
    urgency: ctx.urgency,
    confidence: ctx.forecast?.confidence,
    summary: ctx.forecast?.explanation || ctx.reasonLabel,
  }
}

/**
 * Forecast/rule_based recommendation for contexts that skip or fail LLM.
 * @param {object} ctx
 * @param {string} fallbackReason
 * @param {string[]} [extraWarnings]
 */
function fallbackForContext(ctx, fallbackReason, extraWarnings = []) {
  const rec = buildForecastFallbackRecommendation(contextToNormalizeCtx(ctx), {
    fallbackReason,
    warnings: extraWarnings,
  })
  return {
    ...rec,
    suggestionId: ctx.suggestionId,
    supplierName: ctx.supplierOptions?.[0]?.supplierName,
  }
}

/**
 * Batch LLM reorder *decisions* for eligible product contexts.
 * Quota: one usage increment per batch call (not per product).
 * Preserves explain/ask; does not place orders.
 *
 * @param {object[]} contexts - from buildReorderAiContexts
 * @param {{ restaurantId: string, userId?: string }} opts
 * @returns {Promise<{ recommendations: object[], usedLlm: boolean, usageLimited?: boolean }>}
 */
export async function generateReorderRecommendations(contexts, opts) {
  const restaurantId = opts.restaurantId
  const list = Array.isArray(contexts) ? contexts : []

  if (list.length === 0) {
    return { recommendations: [], usedLlm: false }
  }

  const llmEligible = []
  const skipped = []
  for (const ctx of list) {
    if (ctx.eligibility?.skipLlm) {
      skipped.push(fallbackForContext(ctx, ctx.eligibility.skipReason || 'insufficient_data'))
    } else {
      llmEligible.push(ctx)
    }
  }

  if (llmEligible.length === 0) {
    return { recommendations: skipped, usedLlm: false }
  }

  const aiPlatformOn = await isAiPlatformEnabledForTenant(restaurantId, 'RESTAURANT')
  const provider = getAiProvider()

  if (!isAiEnvEnabled() || !aiPlatformOn || !provider) {
    const reason = !isAiEnvEnabled()
      ? 'ai_disabled'
      : !aiPlatformOn
        ? 'ai_platform_off'
        : 'no_provider'
    logger.info('reorder AI recommend skipped gate', { restaurantId, reason })
    return {
      recommendations: [...skipped, ...llmEligible.map((ctx) => fallbackForContext(ctx, reason))],
      usedLlm: false,
    }
  }

  if (await isOverTenantDailyCeiling(restaurantId)) {
    return {
      recommendations: [
        ...skipped,
        ...llmEligible.map((ctx) => fallbackForContext(ctx, 'tenant_daily_ceiling')),
      ],
      usedLlm: false,
      ...quotaLimitedDetails(),
    }
  }

  const usage = await reserveAiUsage(restaurantId, 'RESTAURANT', 1)
  if (!usage.allowed) {
    return {
      recommendations: [
        ...skipped,
        ...llmEligible.map((ctx) => fallbackForContext(ctx, 'usage_limited')),
      ],
      usedLlm: false,
      ...quotaLimitedDetails(usage),
    }
  }

  const started = Date.now()
  try {
    const payload = { products: toLlmContextPayload(llmEligible) }
    const result = await provider.completeJson({
      system: RECOMMEND_SYSTEM_PROMPT,
      user: JSON.stringify(payload),
      schemaHint: RECOMMEND_SCHEMA_HINT,
    })

    const parsed = parseReorderAiDecisionBatch(result.data)
    if (!parsed.success) {
      await refundAiUsage(restaurantId, usage)
      await logAiRequest({
        restaurantId,
        userId: opts.userId,
        endpoint: 'recommend',
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs ?? Date.now() - started,
        success: false,
        errorCode: 'invalid_schema',
      })
      logger.info('reorder AI recommend malformed output', {
        restaurantId,
        productCount: llmEligible.length,
        latencyMs: result.latencyMs,
      })
      return {
        recommendations: [
          ...skipped,
          ...llmEligible.map((ctx) => fallbackForContext(ctx, 'invalid_schema')),
        ],
        usedLlm: false,
      }
    }

    const byProduct = new Map(parsed.recommendations.map((d) => [String(d.productId), d]))
    const normalized = llmEligible.map((ctx) => {
      const decision = byProduct.get(String(ctx.productId))
      const rec = normalizeReorderAiDecision(decision, contextToNormalizeCtx(ctx))
      return {
        ...rec,
        suggestionId: ctx.suggestionId,
        supplierName: ctx.supplierOptions?.[0]?.supplierName,
      }
    })

    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'recommend',
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs ?? Date.now() - started,
      success: true,
    })

    logger.info('reorder AI recommend succeeded', {
      restaurantId,
      productCount: llmEligible.length,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      aiCount: normalized.filter((r) => r.source === 'ai').length,
    })

    return {
      recommendations: [...skipped, ...normalized],
      usedLlm: true,
    }
  } catch (error) {
    await refundAiUsage(restaurantId, usage)
    await logAiRequest({
      restaurantId,
      userId: opts.userId,
      endpoint: 'recommend',
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - started,
      success: false,
      errorCode: error.message?.slice(0, 120),
    })
    logger.info('reorder AI recommend failed', {
      restaurantId,
      error: error.message?.slice(0, 120),
    })
    return {
      recommendations: [
        ...skipped,
        ...llmEligible.map((ctx) =>
          fallbackForContext(ctx, 'llm_error', ['AI recommend failed; using forecast'])
        ),
      ],
      usedLlm: false,
    }
  }
}
