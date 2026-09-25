import { logger } from '../lib/logger.js'
import {
  upsertIngredientCostsFromReceiving,
  upsertIngredientCostCache,
} from './ingredient-cost-resolver.service.js'
import { markRecipeRecalcDirty } from './recipe-recalc-queue.service.js'
import { recordSupplierPriceEvent } from './recipe-price-impact.service.js'
import { query } from '../lib/db.js'

/**
 * Fire-and-forget hook after receiving — never throws to caller.
 * @param {string} restaurantId
 * @param {Array<{ productId: string, supplierId?: string, unitPrice?: number, unit?: string, lineItemId?: string }>} items
 */
export function hookRecipeCostingAfterReceiving(restaurantId, items = []) {
  void (async () => {
    try {
      if (!restaurantId || !items.length) return
      const previousPriceByProduct = new Map()
      for (const item of items) {
        if (!item.productId || previousPriceByProduct.has(item.productId)) continue
        const unitPrice = Number(item.unitPrice)
        if (!Number.isFinite(unitPrice)) continue
        const { rows: cached } = await query(
          `SELECT unit_price, currency FROM restaurant_ingredient_costs
           WHERE restaurant_id = $1 AND product_id = $2
             AND cost_source = 'LAST_RECEIVED'
           ORDER BY effective_at DESC LIMIT 1`,
          [restaurantId, item.productId]
        )
        previousPriceByProduct.set(item.productId, {
          price: cached[0]?.unit_price != null ? Number(cached[0].unit_price) : null,
          currency: cached[0]?.currency || null,
        })
      }
      await upsertIngredientCostsFromReceiving(restaurantId, items)
      const seen = new Set()
      for (const item of items) {
        if (!item.productId || seen.has(item.productId)) continue
        seen.add(item.productId)
        const unitPrice = Number(item.unitPrice)
        if (Number.isFinite(unitPrice)) {
          const previous = previousPriceByProduct.get(item.productId) || {}
          const oldPrice = previous.price ?? null
          const nextCurrency = item.currency || null
          const sameCurrency =
            previous.currency == null ||
            nextCurrency == null ||
            String(previous.currency).toUpperCase() === String(nextCurrency).toUpperCase()
          if (!sameCurrency || oldPrice == null || Math.abs(oldPrice - unitPrice) > 0.0001) {
            await recordSupplierPriceEvent({
              restaurantId,
              productId: item.productId,
              supplierId: item.supplierId || null,
              oldPrice,
              oldCurrency: previous.currency,
              newPrice: unitPrice,
              currency: nextCurrency,
              source: 'RECEIVING',
            })
          }
        }
        await markRecipeRecalcDirty(restaurantId, {
          productId: item.productId,
          reason: 'receiving_completed',
        })
      }
    } catch (error) {
      logger.warn({
        event: 'recipe_costing.receiving_hook_failed',
        restaurantId,
        error: error.message,
      })
    }
  })()
}

/**
 * @param {string} restaurantId
 * @param {Array<{ productId: string, supplierId?: string, unitPrice: number, unit?: string, lineItemId?: string }>} lines
 */
export function hookRecipeCostingAfterInvoice(restaurantId, lines = [], options = {}) {
  const currency = options.currency || 'USD'
  const recordPriceEvent = options.recordPriceEvent === true
  void (async () => {
    try {
      if (!restaurantId || !lines.length) return
      for (const line of lines) {
        if (!line.productId) continue
        const unitPrice = Number(line.unitPrice)
        if (!Number.isFinite(unitPrice)) continue
        if (recordPriceEvent) {
          const { rows: prior } = await query(
            `SELECT new_price, currency FROM supplier_price_events
             WHERE restaurant_id = $1 AND product_id = $2
             ORDER BY detected_at DESC LIMIT 1`,
            [restaurantId, line.productId]
          )
          const oldPrice = prior[0]?.new_price != null ? Number(prior[0].new_price) : null
          const sameCurrency =
            prior[0]?.currency == null ||
            !currency ||
            String(prior[0].currency).toUpperCase() === String(currency).toUpperCase()
          if (!sameCurrency || oldPrice == null || Math.abs(oldPrice - unitPrice) > 0.0001) {
            await recordSupplierPriceEvent({
              restaurantId,
              productId: line.productId,
              supplierId: line.supplierId || null,
              productName: line.productName || null,
              oldPrice,
              oldCurrency: prior[0]?.currency || null,
              newPrice: unitPrice,
              currency,
              source: 'INVOICE',
            })
          }
        }
        await upsertIngredientCostCache({
          restaurantId,
          productId: line.productId,
          supplierId: line.supplierId || null,
          branchId: null,
          unitPrice,
          unit: line.unit || 'unit',
          currency,
          costSource: 'INVOICE',
          sourceRefType: 'invoice_line_item',
          sourceRefId: line.lineItemId || null,
          effectiveAt: new Date().toISOString(),
        })
        await markRecipeRecalcDirty(restaurantId, {
          productId: line.productId,
          reason: 'invoice_created',
        })
      }
    } catch (error) {
      logger.warn({
        event: 'recipe_costing.invoice_hook_failed',
        restaurantId,
        error: error.message,
      })
    }
  })()
}

/**
 * @param {string} productId
 * @param {number} newPrice
 * @param {'CATALOG' | 'CONTRACT'} source
 * @param {string | null} [restaurantId] When set with CONTRACT source, scope impact to this restaurant only
 */
export function hookRecipeCostingAfterCatalogPriceChange(
  productId,
  newPrice,
  source = 'CATALOG',
  restaurantId = null
) {
  void (async () => {
    try {
      const { propagateCatalogPriceChange } = await import('./recipe-price-impact.service.js')
      await propagateCatalogPriceChange(productId, newPrice, source, restaurantId)
    } catch (error) {
      logger.warn({
        event: 'recipe_costing.catalog_hook_failed',
        productId,
        error: error.message,
      })
    }
  })()
}

/**
 * @param {string} restaurantId
 * @param {string | null} invoiceId
 */
export function hookRecipeCostingAfterCreditNote(restaurantId, invoiceId) {
  void (async () => {
    try {
      if (!restaurantId || !invoiceId) return
      const { rows } = await query(
        `
        SELECT DISTINCT ri.recipe_id
        FROM recipe_ingredients ri
        JOIN invoice_line_item ili ON ili.product_id = ri.product_id
        JOIN recipes r ON r.id = ri.recipe_id
        WHERE ili.invoice_id = $1 AND r.restaurant_id = $2 AND r.is_active = true
        `,
        [invoiceId, restaurantId]
      )
      for (const row of rows) {
        await query(
          `
          INSERT INTO recipe_alerts (recipe_id, alert_type, severity, message, metadata)
          VALUES ($1, 'CREDIT_NOTE_ADJUSTMENT', 'info', $2, $3::jsonb)
          `,
          [
            row.recipe_id,
            'A credit note was applied — review ingredient costs for accuracy',
            JSON.stringify({ invoiceId }),
          ]
        )
        await markRecipeRecalcDirty(restaurantId, {
          recipeId: row.recipe_id,
          reason: 'credit_note',
        })
      }
    } catch (error) {
      logger.warn({
        event: 'recipe_costing.credit_note_hook_failed',
        restaurantId,
        error: error.message,
      })
    }
  })()
}
