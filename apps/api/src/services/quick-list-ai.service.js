import { query } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { getEffectiveFeaturesForTenant } from '../lib/feature-flags.js'
import { hasQuickListCapability } from '../lib/quick-list-tier.js'
import { computeSuggestedReorderQty } from '../lib/reorder-quantity.js'
import { applySupplierPackRounding } from '../lib/reorder-unit-normalize.js'
import { getCachedForecasts, refreshIfStale } from './reorder-forecast-cache.service.js'
import { getReorderAssistance } from './restaurant-reorder-assistance.service.js'

/**
 * Apply forecast-based quantity adjustments to quick-list line items (Platinum).
 * Returns adjusted items and an audit payload for quick_list_execution.ai_adjustments.
 *
 * @param {string} restaurantId
 * @param {object} quickList
 * @param {Array<object>} items — rows from quick_list_item join product
 * @param {{ quickListsFeatureValue?: unknown, smartReorderFeatureValue?: unknown }} opts
 */
export async function applySmartQuantitiesToItems(restaurantId, quickList, items, opts = {}) {
  let quickListsFeature = opts.quickListsFeatureValue
  let smartReorderFeature = opts.smartReorderFeatureValue
  if (quickListsFeature === undefined || smartReorderFeature === undefined) {
    const eff = await getEffectiveFeaturesForTenant(restaurantId, 'RESTAURANT')
    if (quickListsFeature === undefined) quickListsFeature = eff?.features?.quick_lists
    if (smartReorderFeature === undefined) smartReorderFeature = eff?.features?.smart_reorder
  }

  if (!hasQuickListCapability(quickListsFeature, 'aiQuantityAdjust')) {
    return { items, adjustments: null, skipped: 'capability_disabled' }
  }

  if (!quickList?.use_ai_quantities) {
    return { items, adjustments: null, skipped: 'flag_off' }
  }

  await refreshIfStale(restaurantId, smartReorderFeature)

  const productIds = items.map((i) => i.product_id)
  const forecasts = await getCachedForecasts(restaurantId, {
    branchId: quickList.branch_id || null,
    includeStale: true,
  })
  const forecastByProduct = new Map(
    forecasts.filter((f) => productIds.includes(f.productId)).map((f) => [f.productId, f])
  )

  const adjustments = []
  const adjustedItems = []

  for (const item of items) {
    const beforeQty = Number(item.quantity)
    let afterQty = beforeQty
    let source = 'static'

    const forecast = forecastByProduct.get(item.product_id)
    if (forecast?.forecastReorderQty != null && Number(forecast.forecastReorderQty) > 0) {
      afterQty = Number(forecast.forecastReorderQty)
      source = 'forecast_cache'
    } else {
      const { rows: invRows } = await query(
        `
        SELECT ri.quantity_on_hand, pis.reorder_point, pis.lead_time_days, pis.moq, pis.order_multiple,
               p.unit
        FROM restaurant_inventory ri
        JOIN product p ON p.id = ri.product_id
        LEFT JOIN product_inventory_settings pis ON pis.product_id = p.id AND pis.restaurant_id = $1
        WHERE ri.restaurant_id = $1 AND ri.product_id = $2
        LIMIT 1
        `,
        [restaurantId, item.product_id]
      )
      const inv = invRows[0]
      if (inv) {
        const onHand = Number(inv.quantity_on_hand) || 0
        const avgDaily = Number(forecast?.forecastDailyUsage) || 0
        const suggested = computeSuggestedReorderQty({
          currentQty: onHand,
          avgDailyUsage: avgDaily,
          leadTimeDays: inv.lead_time_days,
          moq: inv.moq,
          orderMultiple: inv.order_multiple,
          belowThreshold: onHand <= Number(inv.reorder_point || 0),
          unit: inv.unit,
        })
        if (suggested != null && suggested > 0) {
          afterQty = applySupplierPackRounding(
            suggested,
            { moq: inv.moq, orderMultiple: inv.order_multiple },
            inv.unit
          )
          source = 'heuristic'
        }
      }
    }

    if (afterQty !== beforeQty) {
      adjustments.push({
        productId: item.product_id,
        productName: item.product_name || null,
        beforeQty,
        afterQty,
        source,
        adjustedAt: new Date().toISOString(),
      })
    }

    adjustedItems.push({ ...item, quantity: afterQty })
  }

  return {
    items: adjustedItems,
    adjustments: adjustments.length
      ? {
          modelTier: forecastByProduct.values().next().value?.modelTier || 'gold',
          items: adjustments,
        }
      : null,
    skipped: null,
  }
}

/**
 * Suggest add/update items for a quick list from reorder assistance (Platinum).
 */
export async function suggestQuickListItems(restaurantId, quickListId) {
  const { rows: lists } = await query(
    `SELECT * FROM quick_list WHERE id = $1 AND restaurant_id = $2`,
    [quickListId, restaurantId]
  )
  if (!lists.length) throw new NotFoundError('Quick list not found')
  const quickList = lists[0]

  const eff = await getEffectiveFeaturesForTenant(restaurantId, 'RESTAURANT')
  const quickListsFeature = eff?.features?.quick_lists
  if (!hasQuickListCapability(quickListsFeature, 'aiSuggest')) {
    throw new ValidationError('Smart list suggestions require the Platinum plan')
  }

  const assistance = await getReorderAssistance(restaurantId, {
    branchId: quickList.branch_id || null,
    smartReorderFeatureValue: eff?.features?.smart_reorder,
    limit: 60,
  })

  const { rows: existing } = await query(
    `SELECT product_id, quantity FROM quick_list_item WHERE quick_list_id = $1`,
    [quickListId]
  )
  const existingByProduct = new Map(existing.map((r) => [String(r.product_id), Number(r.quantity)]))

  const supplierId = quickList.supplier_id ? String(quickList.supplier_id) : null

  const proposals = []
  for (const s of assistance.suggestions) {
    if (!s.productId || !s.suggestedQty) continue
    if (supplierId && s.supplierId && String(s.supplierId) !== supplierId) continue

    const productId = String(s.productId)
    const suggestedQty = Math.max(1, Number(s.suggestedQty) || 1)
    const currentQty = existingByProduct.get(productId)

    if (currentQty == null) {
      proposals.push({
        action: 'add',
        productId,
        supplierId: s.supplierId || supplierId,
        quantity: suggestedQty,
        reasonCode: s.reasonCode,
        reasonLabel: s.reasonLabel,
      })
    } else if (Math.abs(currentQty - suggestedQty) >= 0.01) {
      proposals.push({
        action: 'update',
        productId,
        supplierId: s.supplierId || supplierId,
        quantity: suggestedQty,
        previousQuantity: currentQty,
        reasonCode: s.reasonCode,
        reasonLabel: s.reasonLabel,
      })
    }
  }

  return {
    quickListId,
    proposals: proposals.slice(0, 30),
    assistanceAsOf: new Date().toISOString(),
  }
}

/**
 * Apply accepted proposals from ai-suggest to quick_list_item rows.
 */
export async function applyQuickListSuggestions(restaurantId, quickListId, proposals) {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    throw new ValidationError('proposals is required')
  }

  const eff = await getEffectiveFeaturesForTenant(restaurantId, 'RESTAURANT')
  if (!hasQuickListCapability(eff?.features?.quick_lists, 'aiSuggest')) {
    throw new ValidationError('Smart list suggestions require the Platinum plan')
  }

  const { rows: lists } = await query(
    `SELECT id FROM quick_list WHERE id = $1 AND restaurant_id = $2`,
    [quickListId, restaurantId]
  )
  if (!lists.length) throw new NotFoundError('Quick list not found')

  let applied = 0
  for (const p of proposals) {
    if (!p.productId || !p.supplierId || !p.quantity) continue
    if (p.action === 'add' || p.action === 'update') {
      await query(
        `
        INSERT INTO quick_list_item (quick_list_id, product_id, supplier_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (quick_list_id, product_id) DO UPDATE SET
          quantity = EXCLUDED.quantity,
          supplier_id = EXCLUDED.supplier_id,
          updated_at = now()
        `,
        [quickListId, p.productId, p.supplierId, p.quantity]
      )
      applied++
    }
  }

  return { applied }
}
