import { applySupplierPackRounding } from './reorder-unit-normalize.js'

export const QTY_CLAMP_MIN_RATIO = 0.7
export const QTY_CLAMP_MAX_RATIO = 1.3
export const DELIVERY_DATE_BUFFER_DAYS = 21

/**
 * @typedef {object} SupplierOption
 * @property {string} supplierId
 * @property {string} [supplierName]
 * @property {number} [moq]
 * @property {number} [orderMultiple]
 * @property {number} [leadTimeDays]
 */

/**
 * @typedef {object} NormalizeContext
 * @property {string} productId
 * @property {number | null | undefined} baseQuantity - Forecast/heuristic baseline qty
 * @property {string | null | undefined} defaultSupplierId
 * @property {SupplierOption[]} supplierOptions
 * @property {string} [unit]
 * @property {number} [moq]
 * @property {number} [orderMultiple]
 * @property {number} [leadTimeDays]
 * @property {string} [urgency]
 * @property {number} [confidence]
 * @property {string} [summary]
 */

/**
 * Clamp a recommended quantity into [0.7×base, 1.3×base], then apply pack/MOQ rounding.
 * When base is 0/null, returns null (caller should fallback to wait/manual_review).
 *
 * @param {number | null | undefined} recommendedQty
 * @param {number | null | undefined} baseQty
 * @param {{ moq?: number, orderMultiple?: number, unit?: string }} pack
 * @returns {{ quantity: number | null, clamped: boolean, warnings: string[] }}
 */
export function normalizeRecommendedQuantity(recommendedQty, baseQty, pack = {}) {
  const warnings = []
  const base = Number(baseQty)
  const hasBase = Number.isFinite(base) && base > 0

  if (!hasBase) {
    const raw = Number(recommendedQty)
    if (!Number.isFinite(raw) || raw <= 0) {
      return { quantity: null, clamped: false, warnings }
    }
    // No trusted baseline — do not invent a large order; reject positive LLM qty.
    warnings.push('No forecast baseline quantity; AI quantity discarded')
    return { quantity: null, clamped: true, warnings }
  }

  let qty = Number(recommendedQty)
  if (!Number.isFinite(qty) || qty < 0) {
    warnings.push('Invalid recommended quantity; using forecast baseline')
    qty = base
  }

  const min = base * QTY_CLAMP_MIN_RATIO
  const max = base * QTY_CLAMP_MAX_RATIO
  let clamped = false
  if (qty < min || qty > max) {
    clamped = true
    warnings.push(
      `Quantity clamped to ${(QTY_CLAMP_MIN_RATIO * 100).toFixed(0)}–${(QTY_CLAMP_MAX_RATIO * 100).toFixed(0)}% of forecast baseline`
    )
    qty = Math.min(max, Math.max(min, qty))
  }

  const rounded = applySupplierPackRounding(
    qty,
    { moq: pack.moq, orderMultiple: pack.orderMultiple },
    pack.unit || 'unit'
  )

  if (rounded !== qty) {
    clamped = true
    warnings.push('Quantity rounded to supplier MOQ / pack multiple')
  }

  return { quantity: rounded, clamped, warnings }
}

/**
 * Ensure supplierId is one of the allowed options; otherwise use default + warning.
 *
 * @param {string | null | undefined} supplierId
 * @param {SupplierOption[]} supplierOptions
 * @param {string | null | undefined} defaultSupplierId
 * @returns {{ supplierId: string | null, replaced: boolean, warning?: string }}
 */
export function normalizeSupplierId(supplierId, supplierOptions = [], defaultSupplierId = null) {
  const allowed = new Set((supplierOptions || []).map((s) => String(s.supplierId)).filter(Boolean))
  const fallback =
    (defaultSupplierId && String(defaultSupplierId)) ||
    (supplierOptions[0] ? String(supplierOptions[0].supplierId) : null)

  if (supplierId != null && supplierId !== '' && allowed.has(String(supplierId))) {
    return { supplierId: String(supplierId), replaced: false }
  }

  if (supplierId != null && supplierId !== '' && !allowed.has(String(supplierId))) {
    return {
      supplierId: fallback,
      replaced: true,
      warning: 'Supplier not in allowed options; using default supplier',
    }
  }

  return { supplierId: fallback, replaced: false }
}

/**
 * Accept ISO date (YYYY-MM-DD or full ISO) only if within [today, today+leadTime+21].
 *
 * @param {string | null | undefined} deliveryDate
 * @param {number} [leadTimeDays=7]
 * @param {Date} [now]
 * @returns {{ deliveryDate: string | null, warning?: string }}
 */
export function normalizeDeliveryDate(deliveryDate, leadTimeDays = 7, now = new Date()) {
  if (deliveryDate == null || deliveryDate === '') {
    return { deliveryDate: null }
  }

  const raw = String(deliveryDate).trim()
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw)
  if (Number.isNaN(parsed.getTime())) {
    return { deliveryDate: null, warning: 'Invalid delivery date ignored' }
  }

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const lead =
    Number.isFinite(Number(leadTimeDays)) && Number(leadTimeDays) > 0 ? Number(leadTimeDays) : 7
  const max = new Date(today)
  max.setUTCDate(max.getUTCDate() + lead + DELIVERY_DATE_BUFFER_DAYS)

  const day = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))

  if (day < today || day > max) {
    return {
      deliveryDate: null,
      warning: 'Delivery date outside allowed window; ignored',
    }
  }

  return { deliveryDate: day.toISOString().slice(0, 10) }
}

/**
 * Build a forecast/rule_based recommendation from the baseline context.
 *
 * @param {NormalizeContext} ctx
 * @param {{ source?: 'forecast' | 'rule_based', fallbackReason?: string, warnings?: string[] }} meta
 */
export function buildForecastFallbackRecommendation(ctx, meta = {}) {
  const base = Number(ctx.baseQuantity)
  const hasBase = Number.isFinite(base) && base > 0
  const supplier = normalizeSupplierId(null, ctx.supplierOptions, ctx.defaultSupplierId)
  const pack = {
    moq: ctx.moq,
    orderMultiple: ctx.orderMultiple,
    unit: ctx.unit,
  }
  const qtyResult = hasBase
    ? normalizeRecommendedQuantity(base, base, pack)
    : { quantity: null, clamped: false, warnings: [] }

  const source = meta.source || (hasBase ? 'forecast' : 'rule_based')
  const action = hasBase ? 'order' : 'manual_review'

  return {
    productId: String(ctx.productId),
    source,
    action,
    recommendedQuantity: qtyResult.quantity,
    supplierId: supplier.supplierId,
    deliveryDate: null,
    priority: ctx.urgency || 'MEDIUM',
    confidence:
      ctx.confidence != null && Number.isFinite(Number(ctx.confidence))
        ? Math.min(1, Math.max(0, Number(ctx.confidence)))
        : hasBase
          ? 0.5
          : 0.2,
    summary:
      ctx.summary ||
      (hasBase
        ? 'Forecast reorder recommendation based on usage and stock levels'
        : 'Insufficient data for a confident reorder quantity — review manually'),
    reasoning: hasBase
      ? ['Based on deterministic forecast / stock heuristics']
      : ['Insufficient forecast history'],
    warnings: [...(meta.warnings || []), ...qtyResult.warnings],
    alternatives: [],
    dataQuality: hasBase ? 'fair' : 'poor',
    aiMetadata: {
      usedLlm: false,
      fallbackReason: meta.fallbackReason || 'forecast_baseline',
      normalized: qtyResult.clamped,
    },
  }
}

/**
 * Validate and normalize one LLM decision against a product context.
 * On invalid/out-of-range decisions, returns a forecast fallback with source !== 'ai'.
 *
 * @param {object | null | undefined} decision - Parsed LLM item
 * @param {NormalizeContext} ctx
 */
export function normalizeReorderAiDecision(decision, ctx) {
  if (!decision || String(decision.productId) !== String(ctx.productId)) {
    return buildForecastFallbackRecommendation(ctx, {
      fallbackReason: 'invalid_or_mismatched_decision',
      warnings: ['AI decision missing or mismatched product; using forecast'],
    })
  }

  const base = Number(ctx.baseQuantity)
  const hasBase = Number.isFinite(base) && base > 0

  const qtyResult = normalizeRecommendedQuantity(decision.recommendedQuantity, ctx.baseQuantity, {
    moq: ctx.moq,
    orderMultiple: ctx.orderMultiple,
    unit: ctx.unit,
  })

  const supplier = normalizeSupplierId(
    decision.supplierId,
    ctx.supplierOptions,
    ctx.defaultSupplierId
  )

  const delivery = normalizeDeliveryDate(decision.deliveryDate, ctx.leadTimeDays)

  const warnings = [
    ...(Array.isArray(decision.warnings) ? decision.warnings : []),
    ...qtyResult.warnings,
    ...(supplier.warning ? [supplier.warning] : []),
    ...(delivery.warning ? [delivery.warning] : []),
  ]

  // If we cannot trust a quantity after normalize, degrade to forecast/manual.
  if (decision.action === 'order' && qtyResult.quantity == null) {
    return buildForecastFallbackRecommendation(ctx, {
      fallbackReason: 'qty_untrusted_no_baseline',
      warnings,
    })
  }

  let action = REORDER_AI_ACTIONS_SET.has(decision.action) ? decision.action : 'manual_review'
  if (action === 'order' && !hasBase && qtyResult.quantity == null) {
    action = 'manual_review'
  }

  const priority = REORDER_AI_PRIORITIES_SET.has(decision.priority)
    ? decision.priority
    : ctx.urgency || 'MEDIUM'

  let confidence = Number(decision.confidence)
  if (!Number.isFinite(confidence)) confidence = hasBase ? 0.55 : 0.25
  confidence = Math.min(1, Math.max(0, confidence))

  const summary =
    typeof decision.summary === 'string' && decision.summary.trim()
      ? decision.summary.trim()
      : ctx.summary || 'AI reorder recommendation'

  return {
    productId: String(ctx.productId),
    source: 'ai',
    action,
    recommendedQuantity:
      action === 'wait' ? qtyResult.quantity : (qtyResult.quantity ?? (hasBase ? base : null)),
    supplierId: supplier.supplierId,
    deliveryDate: delivery.deliveryDate,
    priority,
    confidence,
    summary,
    reasoning: Array.isArray(decision.reasoning)
      ? decision.reasoning.map(String).filter(Boolean).slice(0, 8)
      : [],
    warnings,
    alternatives: Array.isArray(decision.alternatives)
      ? decision.alternatives.slice(0, 3).map((a) => ({
          recommendedQuantity:
            a.recommendedQuantity != null ? Number(a.recommendedQuantity) : undefined,
          supplierId: a.supplierId != null ? String(a.supplierId) : undefined,
          rationale: a.rationale != null ? String(a.rationale) : undefined,
        }))
      : [],
    dataQuality: ['good', 'fair', 'poor'].includes(decision.dataQuality)
      ? decision.dataQuality
      : hasBase
        ? 'good'
        : 'poor',
    aiMetadata: {
      usedLlm: true,
      normalized: qtyResult.clamped || supplier.replaced || Boolean(delivery.warning),
    },
  }
}

const REORDER_AI_ACTIONS_SET = new Set(['order', 'wait', 'manual_review'])
const REORDER_AI_PRIORITIES_SET = new Set(['URGENT', 'HIGH', 'MEDIUM', 'LOW'])
