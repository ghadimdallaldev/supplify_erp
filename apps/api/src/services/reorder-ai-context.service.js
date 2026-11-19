import { loadIncomingSupply } from './reorder-supply.service.js'

export async function fetchIncomingStockByProduct(restaurantId, productIds) {
  const supply = await loadIncomingSupply(restaurantId, productIds)
  return new Map(
    productIds.map((id) => [
      String(id),
      supply.known ? supply.products.get(String(id))?.confirmed || 0 : null,
    ])
  )
}

/**
 * Build compact per-product AI context from assistance suggestion + forecast.
 * Only includes fields that already exist — no invented suppliers/events.
 *
 * @param {object} suggestion - Assistance suggestion item
 * @param {object | null | undefined} forecast - Cached forecast row
 * @param {{ incomingStock?: number | null }} [extras]
 */
export function buildReorderAiContextForProduct(suggestion, forecast = null, extras = {}) {
  const productId = String(suggestion.productId)
  const leadTimeDays = suggestion.leadTimeDays ?? forecast?.signals?.leadTimeDays ?? 7
  const moq = suggestion.moq ?? forecast?.signals?.moq ?? 1
  const orderMultiple = suggestion.orderMultiple ?? forecast?.signals?.orderMultiple ?? 1

  const supplierOptions = []
  if (suggestion.supplierId) {
    supplierOptions.push({
      supplierId: String(suggestion.supplierId),
      supplierName: suggestion.supplierName || undefined,
      moq: Number(moq) || 1,
      orderMultiple: Number(orderMultiple) || 1,
      leadTimeDays: Number(leadTimeDays) || 7,
    })
  }

  const baseQuantity = Object.hasOwn(suggestion, 'action')
    ? (suggestion.suggestedQty ?? null)
    : (forecast?.forecastReorderQty ?? suggestion.suggestedQty ?? null)

  const insufficientHistory = Boolean(forecast?.signals?.insufficientHistory)
  const weakConfidence =
    forecast != null &&
    (forecast.confidence == null || Number(forecast.confidence) < 0.35) &&
    baseQuantity == null

  const context = {
    productId,
    suggestionId: suggestion.id,
    productName: suggestion.productName,
    productUnit: suggestion.productUnit || 'unit',
    urgency: suggestion.urgency || forecast?.urgency || 'MEDIUM',
    reasonCode: suggestion.reasonCode,
    reasonLabel: suggestion.reasonLabel,
    currentQty: suggestion.currentQty != null ? Number(suggestion.currentQty) : undefined,
    lowStockThreshold:
      suggestion.lowStockThreshold != null ? Number(suggestion.lowStockThreshold) : undefined,
    avgDailyUsage30:
      suggestion.avgDailyUsage30 != null
        ? Number(suggestion.avgDailyUsage30)
        : forecast?.signals?.avg30 != null
          ? Number(forecast.signals.avg30)
          : undefined,
    leadTimeDays: Number(leadTimeDays) || 7,
    moq: Number(moq) || 1,
    orderMultiple: Number(orderMultiple) || 1,
    baseSuggestedQuantity: baseQuantity,
    action: suggestion.action,
    warnings: suggestion.warnings || [],
    defaultSupplierId: suggestion.supplierId ? String(suggestion.supplierId) : null,
    supplierOptions,
    forecast: forecast
      ? {
          forecastDailyUsage: forecast.forecastDailyUsage ?? null,
          forecastReorderQty: forecast.forecastReorderQty ?? null,
          reorderByDate: forecast.reorderByDate ?? null,
          confidence: forecast.confidence ?? null,
          urgency: forecast.urgency ?? null,
          explanation: forecast.explanation ?? null,
          signals: {
            insufficientHistory,
            dayCount: forecast.signals?.dayCount,
            usage30: forecast.signals?.usage30,
            usage90: forecast.signals?.usage90,
            avg30: forecast.signals?.avg30,
            avg90: forecast.signals?.avg90,
          },
        }
      : null,
    incomingStock:
      (suggestion.incomingQty ?? extras.incomingStock) != null &&
      Number.isFinite(Number(suggestion.incomingQty ?? extras.incomingStock))
        ? Number(suggestion.incomingQty ?? extras.incomingStock)
        : undefined,
    eligibility: {
      insufficientHistory,
      weakConfidence,
      skipLlm:
        insufficientHistory ||
        weakConfidence ||
        baseQuantity == null ||
        suggestion.action === 'wait' ||
        suggestion.action === 'manual_review',
      skipReason:
        suggestion.action === 'wait'
          ? 'supply_covers_need'
          : suggestion.action === 'manual_review'
            ? 'manual_review'
            : insufficientHistory
              ? 'insufficient_history'
              : weakConfidence
                ? 'weak_confidence'
                : baseQuantity == null
                  ? 'no_baseline_quantity'
                  : null,
    },
  }

  return context
}

/**
 * Build contexts for a batch of product-bearing suggestions.
 *
 * @param {string} restaurantId
 * @param {object[]} suggestions
 * @param {object[]} forecasts
 * @returns {Promise<object[]>}
 */
export async function buildReorderAiContexts(restaurantId, suggestions, forecasts = []) {
  const productSuggestions = (suggestions || []).filter((s) => s.productId)
  const forecastByProduct = new Map((forecasts || []).map((f) => [String(f.productId), f]))
  const productIds = productSuggestions.map((s) => String(s.productId))
  const incoming = productSuggestions.every((s) => Object.hasOwn(s, 'incomingQty'))
    ? new Map()
    : await fetchIncomingStockByProduct(restaurantId, productIds)

  return productSuggestions.map((s) => {
    const pid = String(s.productId)
    return buildReorderAiContextForProduct(s, forecastByProduct.get(pid), {
      incomingStock: incoming.get(pid),
    })
  })
}

/**
 * Compact payload for the LLM — strip eligibility internals and keep tokens small.
 * @param {object[]} contexts
 */
export function toLlmContextPayload(contexts) {
  return contexts.map((c) => {
    const item = {
      productId: c.productId,
      productName: c.productName,
      unit: c.productUnit,
      urgency: c.urgency,
      reasonCode: c.reasonCode,
      reasonLabel: c.reasonLabel,
      currentQty: c.currentQty,
      lowStockThreshold: c.lowStockThreshold,
      avgDailyUsage30: c.avgDailyUsage30,
      leadTimeDays: c.leadTimeDays,
      moq: c.moq,
      orderMultiple: c.orderMultiple,
      baseSuggestedQuantity: c.baseSuggestedQuantity,
      supplierOptions: c.supplierOptions.map((s) => ({
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        moq: s.moq,
        orderMultiple: s.orderMultiple,
        leadTimeDays: s.leadTimeDays,
      })),
      forecast: c.forecast
        ? {
            forecastReorderQty: c.forecast.forecastReorderQty,
            reorderByDate: c.forecast.reorderByDate,
            confidence: c.forecast.confidence,
            explanation: c.forecast.explanation,
            insufficientHistory: c.forecast.signals?.insufficientHistory,
          }
        : null,
    }
    if (c.incomingStock != null) {
      item.incomingStock = c.incomingStock
    }
    return item
  })
}
