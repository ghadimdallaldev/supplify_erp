import { query } from '../lib/db.js'
import { listSupplierSlowMovingInventory } from './supplier-slow-moving-intelligence.service.js'

const DEFAULT_DAYS = 90
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * Read-only deal-review candidates from existing slow-moving inventory, excluding
 * exact product targets already in an active or pending supplier deal.
 */
export async function listSupplierSuggestedDealCandidates(
  supplierId,
  { days = DEFAULT_DAYS, limit = DEFAULT_LIMIT } = {}
) {
  const parsedLimit = Number.parseInt(limit, 10)
  const resultLimit = Math.min(MAX_LIMIT, Math.max(1, parsedLimit || DEFAULT_LIMIT))
  const slowMoving = await listSupplierSlowMovingInventory(supplierId, {
    days,
    limit: MAX_LIMIT,
  })
  const productIds = slowMoving.products.map((product) => product.productId)
  if (!productIds.length) {
    return {
      windowDays: slowMoving.windowDays,
      coverage: {
        slowMovingProducts: 0,
        productsWithActiveOrPendingProductDeal: 0,
        candidates: 0,
      },
      candidates: [],
    }
  }

  const { rows } = await query(
    `
      SELECT DISTINCT pt.product_id
      FROM promotions p
      JOIN promotion_targets pt ON pt.promotion_id = p.id
      WHERE p.supplier_id = $1
        AND pt.product_id = ANY($2::uuid[])
        AND p.status IN ('active', 'scheduled', 'pending_approval', 'pending_admin_approval', 'approved_pending_payment')
    `,
    [supplierId, productIds]
  )
  const targetedProductIds = new Set(rows.map((row) => row.product_id))
  const candidates = slowMoving.products
    .filter((product) => !targetedProductIds.has(product.productId))
    .map((product) => ({
      productId: product.productId,
      productName: product.productName,
      sku: product.sku,
      availableQty: product.availableQty,
      soldQuantity: product.soldQuantity,
      orderCount: product.orderCount,
      stockCoverDays: Number(product.stockCoverDays.toFixed(2)),
    }))

  return {
    windowDays: slowMoving.windowDays,
    coverage: {
      slowMovingProducts: slowMoving.products.length,
      productsWithActiveOrPendingProductDeal: targetedProductIds.size,
      candidates: candidates.length,
    },
    candidates: candidates.slice(0, resultLimit),
  }
}
