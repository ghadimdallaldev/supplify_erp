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
      await upsertIngredientCostsFromReceiving(restaurantId, items)
      const seen = new Set()
      for (const item of items) {
        if (!item.productId || seen.has(item.productId)) continue
        seen.add(item.productId)
        const unitPrice = Number(item.unitPrice)
        if (Number.isFinite(unitPrice)) {
          const { rows: cached } = await query(
            `
            SELECT unit_price FROM restaurant_ingredient_costs
            WHERE restaurant_id = $1 AND product_id = $2
              AND cost_source = 'LAST_RECEIVED'
            ORDER BY effective_at DESC LIMIT 1
            `,
            [restaurantId, item.productId]
          )
          const oldPrice = cached[0]?.unit_price != null ? Number(cached[0].unit_price) : null
          if (oldPrice == null || Math.abs(oldPrice - unitPrice) > 0.0001) {
            await recordSupplierPriceEvent({
              restaurantId,
              productId: item.productId,
              supplierId: item.supplierId || null,
              oldPrice,
              newPrice: unitPrice,
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
export function hookRecipeCostingAfterInvoice(restaurantId, lines = []) {
  void (async () => {
    try {
      if (!restaurantId || !lines.length) return
      for (const line of lines) {
        if (!line.productId) continue
        await upsertIngredientCostCache({
          restaurantId,
          productId: line.productId,
          supplierId: line.supplierId || null,
          branchId: null,
          unitPrice: Number(line.unitPrice),
          unit: line.unit || 'unit',
          currency: 'USD',
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
 */
export function hookRecipeCostingAfterCatalogPriceChange(productId, newPrice, source = 'CATALOG') {
  void (async () => {
    try {
      const { propagateCatalogPriceChange } = await import('./recipe-price-impact.service.js')
      await propagateCatalogPriceChange(productId, newPrice, source)
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
