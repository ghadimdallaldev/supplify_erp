import { createHash } from 'crypto'
import { query } from '../lib/db.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { resolveSmartReorderCapabilities } from '../lib/smart-reorder-tier.js'
import { resolveReorderAiCapabilities, canUseReorderAiExplain } from '../lib/ai-platform.js'
import { computeSuggestedReorderQty } from '../lib/reorder-quantity.js'
import { applySupplierPackRounding } from '../lib/reorder-unit-normalize.js'
import { getCache, setCache, deleteCacheByPrefix } from '../lib/cache.js'
import { logger } from '../lib/logger.js'
import { listRestaurantReminders } from './reorder-cadence.service.js'
import { listExpiryLots } from './inventory-expiry.service.js'
import { getCachedForecasts, refreshIfStale } from './reorder-forecast-cache.service.js'
import { buildReorderAiContexts } from './reorder-ai-context.service.js'

const AI_RECOMMEND_CACHE_TTL_SECONDS = 15 * 60
const AI_RECOMMEND_DEFAULT_LIMIT = 8
const AI_RECOMMEND_MAX_LIMIT = 15
const AI_RECOMMEND_URGENCIES = new Set(['URGENT', 'HIGH', 'MEDIUM'])

export function reorderAiRecommendCachePrefix(restaurantId) {
  return `reorder-ai-rec:${restaurantId}:`
}

export async function invalidateReorderAiRecommendCache(restaurantId) {
  if (!restaurantId) return
  try {
    await deleteCacheByPrefix(reorderAiRecommendCachePrefix(restaurantId))
  } catch (error) {
    logger.warn('Failed to invalidate reorder AI recommend cache', {
      restaurantId,
      error: error.message,
    })
  }
}

const URGENCY_RANK = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

const REASON_LABELS = {
  low_stock: 'Low stock',
  near_expiry: 'Near expiry',
  expired: 'Expired',
  cadence: 'Usually ordered on this day',
  frequent: 'Frequently ordered',
  quick_list: 'On a recurring order list',
  not_ordered_recently: 'Last ordered a while ago',
  forecast: 'Forecasted reorder need',
}

export async function getActiveSuppressions(restaurantId) {
  const { rows } = await query(
    `
    SELECT scope_type, scope_id, action, snooze_until
    FROM reorder_suggestion_suppression
    WHERE restaurant_id = $1
      AND (
        action = 'not_needed'
        OR (action = 'snooze' AND snooze_until > now())
      )
    `,
    [restaurantId]
  )
  return rows
}

function isSuppressed(suppressions, scopeType, scopeId) {
  return suppressions.some((s) => s.scope_type === scopeType && s.scope_id === String(scopeId))
}

async function fetchLowStockSuggestions(restaurantId, { branchId = null } = {}) {
  const { rows } = await query(
    `
    WITH usage_stats AS (
      SELECT
        iml.product_id,
        COALESCE((
          SELECT SUM(ABS(iml2.quantity))
          FROM inventory_movement_log iml2
          WHERE iml2.restaurant_id = iml.restaurant_id
            AND iml2.product_id = iml.product_id
            AND iml2.type = 'SUBTRACT'
            AND iml2.created_at >= NOW() - INTERVAL '30 days'
        ), 0) / 30.0 AS avg_daily_usage_30day,
        COALESCE((
          SELECT oi.quantity
          FROM order_item oi
          JOIN customer_order co ON co.id = oi.order_id
          WHERE co.restaurant_id = iml.restaurant_id AND oi.product_id = iml.product_id
          ORDER BY co.placed_at DESC NULLS LAST
          LIMIT 1
        ), 0) AS last_order_qty,
        COALESCE((
          SELECT EXTRACT(DAY FROM NOW() - MAX(co.placed_at))::int
          FROM order_item oi
          JOIN customer_order co ON co.id = oi.order_id
          WHERE co.restaurant_id = iml.restaurant_id AND oi.product_id = iml.product_id
        ), 999) AS days_since_last_order
      FROM inventory_movement_log iml
      WHERE iml.restaurant_id = $1
      GROUP BY iml.product_id, iml.restaurant_id
    )
    SELECT
      ri.product_id,
      p.name AS product_name,
      p.unit AS product_unit,
      s.id AS supplier_id,
      s.name AS supplier_name,
      ri.quantity AS current_qty,
      ri.low_stock_threshold,
      COALESCE(us.avg_daily_usage_30day, 0) AS avg_daily_usage_30day,
      COALESCE(us.last_order_qty, 0) AS last_order_qty,
      COALESCE(us.days_since_last_order, 999) AS days_since_last_order,
      COALESCE(pis.lead_time_days, 7) AS lead_time_days,
      COALESCE(pis.moq, 1) AS moq,
      COALESCE(pis.order_multiple, 1) AS order_multiple,
      CASE
        WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN 'URGENT'
        WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / NULLIF(us.avg_daily_usage_30day, 0) < (COALESCE(pis.lead_time_days, 7) + 7) THEN 'HIGH'
        WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / NULLIF(us.avg_daily_usage_30day, 0) < (COALESCE(pis.lead_time_days, 7) + 21) THEN 'MEDIUM'
        ELSE 'LOW'
      END AS urgency_level
    FROM restaurant_inventory ri
    JOIN product p ON p.id = ri.product_id
    JOIN supplier s ON s.id = p.supplier_id
    LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id
    LEFT JOIN usage_stats us ON us.product_id = ri.product_id
    WHERE ri.restaurant_id = $1
      AND ($2::uuid IS NULL OR ri.branch_id = $2)
      AND (
        ri.quantity <= COALESCE(ri.low_stock_threshold, 0)
        OR (
          COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 21)
        )
        OR us.days_since_last_order >= 14
      )
    ORDER BY
      CASE
        WHEN ri.quantity <= COALESCE(ri.low_stock_threshold, 0) THEN 1
        WHEN COALESCE(us.avg_daily_usage_30day, 0) > 0
          AND ri.quantity / us.avg_daily_usage_30day < (COALESCE(pis.lead_time_days, 7) + 14) THEN 2
        ELSE 3
      END,
      ri.quantity ASC
    LIMIT 30
    `,
    [restaurantId, branchId]
  )

  return rows.map((row) => {
    const belowThreshold = row.current_qty <= (row.low_stock_threshold || 0)
    const isFrequent = row.avg_daily_usage_30day >= 0.5 && row.days_since_last_order < 14
    let reasonCode = 'not_ordered_recently'
    let reasonLabel = `Last ordered ${row.days_since_last_order} days ago`

    if (belowThreshold) {
      reasonCode = 'low_stock'
      reasonLabel = REASON_LABELS.low_stock
    } else if (isFrequent) {
      reasonCode = 'frequent'
      reasonLabel = REASON_LABELS.frequent
    }

    let suggestedQty = computeSuggestedReorderQty({
      currentQty: row.current_qty,
      avgDailyUsage: row.avg_daily_usage_30day,
      leadTimeDays: row.lead_time_days,
      lastOrderQty: row.last_order_qty,
      moq: row.moq,
      orderMultiple: row.order_multiple,
      belowThreshold,
      unit: row.product_unit,
    })
    if (suggestedQty == null) {
      // Soft nudge (e.g. "not ordered recently") — suggest the last order size when known.
      const lastQty = Math.ceil(Number(row.last_order_qty) || 0)
      suggestedQty =
        lastQty > 0
          ? applySupplierPackRounding(
              lastQty,
              { moq: row.moq, orderMultiple: row.order_multiple },
              row.product_unit
            )
          : null
    }

    return {
      id: `stock-${row.product_id}`,
      productId: row.product_id,
      productName: row.product_name,
      productUnit: row.product_unit,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      reasonCode,
      reasonLabel,
      urgency: row.urgency_level,
      suggestedQty,
      currentQty: parseFloat(row.current_qty),
      // Additive fields for AI/context builders (ignored by older clients)
      leadTimeDays: Number(row.lead_time_days) || 7,
      moq: Number(row.moq) || 1,
      orderMultiple: Number(row.order_multiple) || 1,
      avgDailyUsage30: Number(row.avg_daily_usage_30day) || 0,
      lowStockThreshold: row.low_stock_threshold != null ? Number(row.low_stock_threshold) : null,
      scopeType: 'product',
      scopeId: String(row.product_id),
    }
  })
}

async function fetchCadenceSuggestions(restaurantId) {
  const reminders = await listRestaurantReminders(restaurantId)
  return reminders.map((r) => ({
    id: `cadence-${r.id}`,
    cadenceId: r.id,
    productId: null,
    productName: r.label,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    reasonCode: 'cadence',
    reasonLabel: `Usually ordered every ${r.dayName}`,
    urgency: 'MEDIUM',
    suggestedQty: null,
    scopeType: 'cadence',
    scopeId: String(r.id),
  }))
}

async function fetchExpirySuggestions(restaurantId) {
  const { lots } = await listExpiryLots(restaurantId, {})
  return lots
    .filter((lot) => lot.status === 'expiring_soon' || lot.status === 'expired')
    .slice(0, 15)
    .map((lot) => ({
      id: `expiry-${lot.id}`,
      productId: lot.productId,
      productName: lot.productName || lot.label,
      supplierId: lot.supplierId,
      supplierName: lot.supplierName,
      reasonCode: lot.status === 'expired' ? 'expired' : 'near_expiry',
      reasonLabel: lot.status === 'expired' ? REASON_LABELS.expired : REASON_LABELS.near_expiry,
      urgency: lot.status === 'expired' ? 'URGENT' : 'HIGH',
      suggestedQty: Math.max(1, Math.ceil(lot.quantity || 1)),
      expiryDate: lot.expiryDate,
      scopeType: 'product',
      scopeId: String(lot.productId || lot.id),
    }))
}

async function fetchQuickListSuggestions(restaurantId) {
  const { rows } = await query(
    `
    SELECT DISTINCT ON (qli.product_id)
      qli.product_id,
      qli.quantity,
      p.name AS product_name,
      p.unit AS product_unit,
      ql.supplier_id,
      s.name AS supplier_name,
      ql.name AS quick_list_name,
      ql.frequency
    FROM quick_list ql
    JOIN quick_list_item qli ON qli.quick_list_id = ql.id
    JOIN product p ON p.id = qli.product_id
    JOIN supplier s ON s.id = ql.supplier_id
    WHERE ql.restaurant_id = $1
      AND ql.is_scheduled = true
      AND ql.status = 'ACTIVE'
    ORDER BY qli.product_id, ql.updated_at DESC
    LIMIT 20
    `,
    [restaurantId]
  )

  return rows.map((row) => ({
    id: `quicklist-${row.product_id}`,
    productId: row.product_id,
    productName: row.product_name,
    productUnit: row.product_unit,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    reasonCode: 'quick_list',
    reasonLabel: `On recurring list "${row.quick_list_name}"`,
    urgency: 'MEDIUM',
    suggestedQty: Math.max(1, Math.ceil(parseFloat(row.quantity) || 1)),
    scopeType: 'product',
    scopeId: String(row.product_id),
  }))
}

function mergeAndDedupe(items) {
  const byKey = new Map()
  for (const item of items) {
    const key = `${item.productId || item.cadenceId || item.id}:${item.reasonCode}`
    const existing = byKey.get(key)
    if (!existing || (URGENCY_RANK[item.urgency] || 0) > (URGENCY_RANK[existing.urgency] || 0)) {
      byKey.set(key, item)
    }
  }
  return [...byKey.values()].sort(
    (a, b) => (URGENCY_RANK[b.urgency] || 0) - (URGENCY_RANK[a.urgency] || 0)
  )
}

function applyForecastToSuggestion(item, forecastByProduct) {
  if (!item.productId) return item
  const forecast = forecastByProduct.get(item.productId)
  if (!forecast || forecast.signals?.insufficientHistory) return item

  const merged = { ...item, forecast }
  if (forecast.forecastReorderQty != null && forecast.confidence >= 0.35) {
    merged.suggestedQty = Math.max(merged.suggestedQty ?? 1, Math.ceil(forecast.forecastReorderQty))
    if (forecast.urgency) {
      merged.urgency = forecast.urgency
    }
    merged.reasonLabel = forecast.explanation || merged.reasonLabel
    merged.reasonCode = 'forecast'
  }
  return merged
}

/**
 * Unified reorder assistance for a restaurant.
 * @param {string} restaurantId
 * @param {{ limit?: number, branchId?: string | null, smartReorderFeatureValue?: unknown }} opts
 */
export async function getReorderAssistance(restaurantId, opts = {}) {
  const { limit = 40, branchId = null, smartReorderFeatureValue } = opts
  const capabilities = resolveSmartReorderCapabilities(smartReorderFeatureValue)

  const suppressions = await getActiveSuppressions(restaurantId)

  const [stock, cadence, expiry, quickList] = await Promise.all([
    fetchLowStockSuggestions(restaurantId, { branchId }),
    fetchCadenceSuggestions(restaurantId),
    fetchExpirySuggestions(restaurantId),
    fetchQuickListSuggestions(restaurantId),
  ])

  let filtered = [...stock, ...cadence, ...expiry, ...quickList].filter(
    (item) => !isSuppressed(suppressions, item.scopeType, item.scopeId)
  )

  let forecasts = []
  if (capabilities.capabilities.forecast && smartReorderFeatureValue !== undefined) {
    try {
      await refreshIfStale(restaurantId, smartReorderFeatureValue)
      forecasts = await getCachedForecasts(restaurantId, { branchId })
      const forecastByProduct = new Map(
        forecasts
          .filter((f) => f.branchId == null || f.branchId === branchId)
          .map((f) => [f.productId, f])
      )
      filtered = filtered.map((item) => applyForecastToSuggestion(item, forecastByProduct))
    } catch {
      // Graceful fallback — keep heuristic suggestions when forecast tables unavailable
    }
  }

  const suggestions = mergeAndDedupe(filtered).slice(0, limit)

  const ai =
    smartReorderFeatureValue !== undefined
      ? await resolveReorderAiCapabilities(restaurantId, 'RESTAURANT', smartReorderFeatureValue)
      : {
          envEnabled: false,
          platformEnabled: false,
          canExplainLlm: false,
          canAskLlm: false,
        }

  return {
    suggestions,
    total: suggestions.length,
    smartReorder: {
      tier: capabilities.tier,
      capabilities: capabilities.capabilities,
    },
    ai,
    forecasts: capabilities.capabilities.forecast ? forecasts.slice(0, limit) : [],
  }
}

export async function suppressReorderSuggestion(
  restaurantId,
  { scopeType, scopeId, action, snoozeDays = 7 }
) {
  if (!['product', 'cadence', 'supplier_product'].includes(scopeType)) {
    throw new ValidationError('Invalid scopeType')
  }
  if (!['snooze', 'not_needed'].includes(action)) {
    throw new ValidationError('Invalid action')
  }
  if (!scopeId) {
    throw new ValidationError('scopeId is required')
  }

  const snoozeUntil =
    action === 'snooze'
      ? new Date(Date.now() + snoozeDays * 24 * 60 * 60 * 1000).toISOString()
      : null

  const { rows } = await query(
    `
    INSERT INTO reorder_suggestion_suppression (
      restaurant_id, scope_type, scope_id, action, snooze_until
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (restaurant_id, scope_type, scope_id) DO UPDATE SET
      action = EXCLUDED.action,
      snooze_until = EXCLUDED.snooze_until,
      updated_at = now()
    RETURNING *
    `,
    [restaurantId, scopeType, String(scopeId), action, snoozeUntil]
  )

  return rows[0]
}

async function findQuickListForApply(restaurantId, supplierId) {
  const { rows } = await query(
    `
    SELECT id, name
    FROM quick_list
    WHERE restaurant_id = $1
      AND ($2::uuid IS NULL OR supplier_id = $2)
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [restaurantId, supplierId || null]
  )
  return rows[0] || null
}

/**
 * Validate apply items against current suggestions; optionally add to an existing quick list.
 * Does not place orders.
 *
 * @param {string} restaurantId
 * @param {{ items: Array<{ productId: string, qty: number, supplierId?: string }>, branchId?: string | null, smartReorderFeatureValue?: unknown }} opts
 */
export async function applyReorderAssistance(restaurantId, opts = {}) {
  const { items, branchId = null, smartReorderFeatureValue } = opts
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('items is required')
  }

  const assistance = await getReorderAssistance(restaurantId, {
    branchId,
    smartReorderFeatureValue,
  })

  const suggestionByProduct = new Map()
  for (const suggestion of assistance.suggestions) {
    if (suggestion.productId) {
      suggestionByProduct.set(String(suggestion.productId), suggestion)
    }
  }

  const added = []
  for (const item of items) {
    const productId = String(item.productId)
    const suggestion = suggestionByProduct.get(productId)
    if (!suggestion) {
      throw new ValidationError(`Product ${productId} is not in current reorder suggestions`)
    }

    const supplierId = item.supplierId || suggestion.supplierId
    if (!supplierId) {
      throw new ValidationError(`supplierId is required for product ${productId}`)
    }

    const qty = Math.max(1, Math.ceil(item.qty ?? suggestion.suggestedQty ?? 1))
    const quickList = await findQuickListForApply(restaurantId, supplierId)

    if (quickList) {
      const { rows: products } = await query(
        `SELECT id FROM product WHERE id = $1 AND supplier_id = $2`,
        [productId, supplierId]
      )
      if (products.length === 0) {
        throw new ValidationError(`Product ${productId} does not belong to supplier ${supplierId}`)
      }

      await query(
        `
        INSERT INTO quick_list_item (quick_list_id, product_id, supplier_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (quick_list_id, product_id) DO UPDATE SET
          quantity = EXCLUDED.quantity,
          updated_at = now()
        `,
        [quickList.id, productId, supplierId, qty]
      )

      added.push({
        productId,
        quickListId: quickList.id,
        message: `Added ${qty} to ordering list "${quickList.name}" (suggested: ${suggestion.suggestedQty ?? qty})`,
      })
    } else {
      added.push({
        productId,
        message: `Suggested qty ${suggestion.suggestedQty ?? qty} — create an ordering list or add from supplier catalog`,
      })
    }
  }

  return { added }
}

function hashCachePart(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

function buildAiRecommendCacheKey(restaurantId, branchId, productIds, forecastVersion) {
  const branchKey = branchId || 'all'
  const idsHash = hashCachePart([...productIds].sort().join(','))
  const fv = hashCachePart(forecastVersion || 'none')
  return `${reorderAiRecommendCachePrefix(restaurantId)}${branchKey}:${idsHash}:${fv}`
}

function computeForecastVersion(forecasts, productIds) {
  const idSet = new Set(productIds.map(String))
  const parts = (forecasts || [])
    .filter((f) => idSet.has(String(f.productId)))
    .map(
      (f) =>
        `${f.productId}:${f.computedAt || ''}:${f.modelVersion || ''}:${f.forecastReorderQty ?? ''}`
    )
    .sort()
  return parts.join('|') || 'none'
}

/**
 * Select top N product suggestions eligible for AI recommend.
 * @param {object[]} suggestions
 * @param {{ productIds?: string[], limit?: number }} opts
 */
export function selectAiRecommendCandidates(suggestions, opts = {}) {
  const limit = Math.min(
    AI_RECOMMEND_MAX_LIMIT,
    Math.max(1, Number(opts.limit) || AI_RECOMMEND_DEFAULT_LIMIT)
  )
  const filterIds = opts.productIds?.length ? new Set(opts.productIds.map(String)) : null

  return (suggestions || [])
    .filter((s) => s.productId)
    .filter((s) => !filterIds || filterIds.has(String(s.productId)))
    .filter((s) => AI_RECOMMEND_URGENCIES.has(String(s.urgency || '').toUpperCase()))
    .slice(0, limit)
}

/**
 * Batch on-demand AI reorder recommendations (does not run inside GET assistance).
 *
 * @param {string} restaurantId
 * @param {{
 *   smartReorderFeatureValue: unknown,
 *   branchId?: string | null,
 *   productIds?: string[],
 *   limit?: number,
 *   userId?: string,
 * }} opts
 */
export async function getReorderAiRecommendations(restaurantId, opts = {}) {
  const branchId = opts.branchId ?? null
  const assistance = await getReorderAssistance(restaurantId, {
    smartReorderFeatureValue: opts.smartReorderFeatureValue,
    branchId,
    limit: 40,
  })

  const candidates = selectAiRecommendCandidates(assistance.suggestions, {
    productIds: opts.productIds,
    limit: opts.limit,
  })

  if (candidates.length === 0) {
    return {
      recommendations: [],
      usedLlm: false,
      cached: false,
      ai: assistance.ai,
    }
  }

  const productIds = candidates.map((c) => String(c.productId))
  const forecastVersion = computeForecastVersion(assistance.forecasts, productIds)
  const cacheKey = buildAiRecommendCacheKey(restaurantId, branchId, productIds, forecastVersion)

  const cached = await getCache(cacheKey)
  if (cached?.recommendations) {
    logger.info('reorder AI recommend cache hit', {
      restaurantId,
      productCount: cached.recommendations.length,
    })
    return {
      ...cached,
      cached: true,
      ai: assistance.ai,
    }
  }

  const canLlm = await canUseReorderAiExplain(
    restaurantId,
    'RESTAURANT',
    opts.smartReorderFeatureValue
  )

  const contexts = await buildReorderAiContexts(
    restaurantId,
    candidates,
    assistance.forecasts || []
  )

  let result
  if (!canLlm) {
    const { buildForecastFallbackRecommendation } = await import('../lib/reorder-ai-normalize.js')
    result = {
      recommendations: contexts.map((ctx) => {
        const rec = buildForecastFallbackRecommendation(
          {
            productId: ctx.productId,
            baseQuantity: ctx.baseSuggestedQuantity,
            defaultSupplierId: ctx.defaultSupplierId,
            supplierOptions: ctx.supplierOptions,
            unit: ctx.productUnit,
            moq: ctx.moq,
            orderMultiple: ctx.orderMultiple,
            leadTimeDays: ctx.leadTimeDays,
            urgency: ctx.urgency,
            confidence: ctx.forecast?.confidence,
            summary: ctx.forecast?.explanation || ctx.reasonLabel,
          },
          { fallbackReason: 'not_eligible_for_llm' }
        )
        return {
          ...rec,
          suggestionId: ctx.suggestionId,
          supplierName: ctx.supplierOptions?.[0]?.supplierName,
        }
      }),
      usedLlm: false,
    }
  } else {
    // Dynamic import avoids circular dependency with reorder-ai.service.js
    const { generateReorderRecommendations } = await import('./reorder-ai.service.js')
    result = await generateReorderRecommendations(contexts, {
      restaurantId,
      userId: opts.userId,
    })
  }

  const response = {
    recommendations: result.recommendations,
    usedLlm: Boolean(result.usedLlm),
    usageLimited: result.usageLimited,
    cached: false,
    ai: assistance.ai,
  }

  await setCache(cacheKey, response, AI_RECOMMEND_CACHE_TTL_SECONDS)
  return response
}

/**
 * Persist light feedback on a recommendation (does not suppress suggestions).
 *
 * @param {string} restaurantId
 * @param {{
 *   productId: string,
 *   source: string,
 *   actionTaken: string,
 *   recommendedQuantity?: number | null,
 *   finalQuantity?: number | null,
 *   selectedSupplierId?: string | null,
 *   feedbackReason?: string | null,
 *   userId?: string | null,
 * }} body
 */
export async function recordReorderRecommendationFeedback(restaurantId, body) {
  const productId = body.productId
  if (!productId) throw new ValidationError('productId is required')
  const source = String(body.source || '').trim()
  const actionTaken = String(body.actionTaken || '').trim()
  if (!source) throw new ValidationError('source is required')
  if (!actionTaken) throw new ValidationError('actionTaken is required')

  try {
    const { rows } = await query(
      `
      INSERT INTO reorder_recommendation_feedback (
        restaurant_id, product_id, source, action_taken,
        recommended_quantity, final_quantity, selected_supplier_id,
        feedback_reason, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, restaurant_id, product_id, source, action_taken, created_at
      `,
      [
        restaurantId,
        productId,
        source,
        actionTaken,
        body.recommendedQuantity ?? null,
        body.finalQuantity ?? null,
        body.selectedSupplierId ?? null,
        body.feedbackReason ?? null,
        body.userId ?? null,
      ]
    )
    return rows[0]
  } catch (error) {
    if (error.code === '42P01') {
      throw new ValidationError('Recommendation feedback is not available yet')
    }
    throw error
  }
}
