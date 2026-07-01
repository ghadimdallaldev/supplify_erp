import { query } from '../lib/db.js'
import { resolveProductPrice } from './resolve-product-price.service.js'

const NULL_UUID = '00000000-0000-0000-0000-000000000000'

const SOURCE_RANK = {
  INVOICE: 5,
  LAST_RECEIVED: 4,
  CONTRACT: 3,
  CATALOG: 2,
  MANUAL: 1,
}

/**
 * @param {object} row
 */
function mapCostRow(row) {
  return {
    unitPrice: Number(row.unit_price),
    unit: row.unit,
    currency: row.currency || 'USD',
    costSource: row.cost_source,
    sourceRefType: row.source_ref_type,
    sourceRefId: row.source_ref_id,
    effectiveAt: row.effective_at,
    supplierId: row.supplier_id,
    branchId: row.branch_id,
  }
}

/**
 * Latest invoice line price for restaurant + product.
 */
async function fetchInvoicePrice(
  { restaurantId, productId, supplierId, branchId },
  dbQuery = query
) {
  const params = [restaurantId, productId]
  let sql = `
    SELECT ili.unit_price, ili.quantity, p.unit, i.currency, i.id AS invoice_id, i.supplier_id, i.branch_id, i.invoice_date
    FROM invoice_line_item ili
    JOIN invoice i ON i.id = ili.invoice_id
    LEFT JOIN product p ON p.id = ili.product_id
    WHERE i.restaurant_id = $1 AND ili.product_id = $2
  `
  if (supplierId) {
    params.push(supplierId)
    sql += ` AND i.supplier_id = $${params.length}`
  }
  if (branchId) {
    params.push(branchId)
    sql += ` AND (i.branch_id = $${params.length} OR i.branch_id IS NULL)`
  }
  sql += ` ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT 1`
  const { rows } = await dbQuery(sql, params)
  if (!rows.length || rows[0].unit_price == null) return null
  const r = rows[0]
  return {
    unitPrice: Number(r.unit_price),
    unit: r.unit || 'unit',
    currency: r.currency || 'USD',
    costSource: 'INVOICE',
    sourceRefType: 'invoice',
    sourceRefId: r.invoice_id,
    effectiveAt: r.invoice_date,
    supplierId: r.supplier_id,
    branchId: r.branch_id,
  }
}

/**
 * Latest accepted receiving line price.
 */
async function fetchLastReceivedPrice(
  { restaurantId, productId, supplierId, branchId },
  dbQuery = query
) {
  const params = [restaurantId, productId]
  let sql = `
    SELECT
      COALESCE(rli.actual_unit_price, rli.expected_unit_price) AS unit_price,
      rli.unit,
      rr.supplier_id,
      rr.id AS receiving_report_id,
      rr.created_at AS effective_at,
      co.currency
    FROM receiving_line_item rli
    JOIN receiving_report rr ON rr.id = rli.receiving_report_id
    JOIN customer_order co ON co.id = rr.order_id
    WHERE rr.restaurant_id = $1
      AND rli.product_id = $2
      AND rli.quality_status = 'ACCEPTED'
      AND COALESCE(rli.received_quantity, 0) > 0
  `
  if (supplierId) {
    params.push(supplierId)
    sql += ` AND rr.supplier_id = $${params.length}`
  }
  if (branchId) {
    params.push(branchId)
    sql += ` AND (co.branch_id = $${params.length} OR co.branch_id IS NULL)`
  }
  sql += ` ORDER BY rr.created_at DESC LIMIT 1`
  const { rows } = await dbQuery(sql, params)
  if (!rows.length || rows[0].unit_price == null) return null
  const r = rows[0]
  return {
    unitPrice: Number(r.unit_price),
    unit: r.unit || 'unit',
    currency: r.currency || 'USD',
    costSource: 'LAST_RECEIVED',
    sourceRefType: 'receiving_report',
    sourceRefId: r.receiving_report_id,
    effectiveAt: r.effective_at,
    supplierId: r.supplier_id,
    branchId: branchId || null,
  }
}

/**
 * Resolve ingredient unit price from purchasing data.
 * @param {{
 *   restaurantId: string,
 *   productId: string,
 *   supplierId?: string | null,
 *   branchId?: string | null,
 *   preferredSource?: string,
 *   manualUnitPrice?: number | null,
 * }} params
 * @param {Function} [dbQuery]
 */
export async function resolveIngredientCost(params, dbQuery = query) {
  const {
    restaurantId,
    productId,
    supplierId = null,
    branchId = null,
    preferredSource = 'AUTO',
    manualUnitPrice = null,
  } = params

  if (preferredSource === 'MANUAL' && manualUnitPrice != null) {
    return {
      unitPrice: Number(manualUnitPrice),
      unit: 'unit',
      currency: 'USD',
      costSource: 'MANUAL',
      sourceRefType: null,
      sourceRefId: null,
      effectiveAt: new Date().toISOString(),
      supplierId,
      branchId,
    }
  }

  const candidates = []
  if (preferredSource === 'AUTO' || preferredSource === 'INVOICE') {
    const inv = await fetchInvoicePrice({ restaurantId, productId, supplierId, branchId }, dbQuery)
    if (inv) candidates.push(inv)
  }
  if (preferredSource === 'AUTO' || preferredSource === 'LAST_RECEIVED') {
    const recv = await fetchLastReceivedPrice(
      { restaurantId, productId, supplierId, branchId },
      dbQuery
    )
    if (recv) candidates.push(recv)
  }
  if (
    preferredSource === 'AUTO' ||
    preferredSource === 'CONTRACT' ||
    preferredSource === 'CATALOG'
  ) {
    const { rows: products } = await dbQuery(
      `SELECT supplier_id, unit, currency FROM product WHERE id = $1`,
      [productId]
    )
    if (products.length) {
      const p = products[0]
      const sid = supplierId || p.supplier_id
      const resolved = await resolveProductPrice(
        {
          restaurantId,
          supplierId: sid,
          productId,
          quantity: 1,
        },
        dbQuery
      )
      if (resolved?.unitPrice != null) {
        const src = resolved.source === 'CONTRACT_PRICE' ? 'CONTRACT' : 'CATALOG'
        if (preferredSource === 'AUTO' || preferredSource === src) {
          candidates.push({
            unitPrice: Number(resolved.unitPrice),
            unit: p.unit || 'unit',
            currency: resolved.currency || p.currency || 'USD',
            costSource: src,
            sourceRefType: src === 'CONTRACT' ? 'restaurant_pricing' : 'price',
            sourceRefId: resolved.contractPriceId || null,
            effectiveAt: new Date().toISOString(),
            supplierId: sid,
            branchId,
          })
        }
      }
    }
  }
  if (manualUnitPrice != null && (preferredSource === 'AUTO' || preferredSource === 'MANUAL')) {
    candidates.push({
      unitPrice: Number(manualUnitPrice),
      unit: 'unit',
      currency: 'USD',
      costSource: 'MANUAL',
      sourceRefType: null,
      sourceRefId: null,
      effectiveAt: new Date().toISOString(),
      supplierId,
      branchId,
    })
  }

  if (!candidates.length) return null

  if (preferredSource !== 'AUTO') {
    return candidates[0]
  }

  candidates.sort((a, b) => (SOURCE_RANK[b.costSource] || 0) - (SOURCE_RANK[a.costSource] || 0))
  return candidates[0]
}

/**
 * Upsert cached ingredient cost.
 */
export async function upsertIngredientCostCache(entry, dbQuery = query) {
  const {
    restaurantId,
    productId,
    supplierId = null,
    branchId = null,
    unitPrice,
    unit,
    currency,
    costSource,
    sourceRefType,
    sourceRefId,
    effectiveAt,
  } = entry
  await dbQuery(
    `
    DELETE FROM restaurant_ingredient_costs
    WHERE restaurant_id = $1
      AND product_id = $2
      AND COALESCE(supplier_id, $4::uuid) = COALESCE($3::uuid, $4::uuid)
      AND COALESCE(branch_id, $4::uuid) = COALESCE($5::uuid, $4::uuid)
    `,
    [restaurantId, productId, supplierId, NULL_UUID, branchId]
  )
  await dbQuery(
    `
    INSERT INTO restaurant_ingredient_costs (
      restaurant_id, product_id, supplier_id, branch_id,
      unit_price, unit, currency, cost_source,
      source_ref_type, source_ref_id, effective_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, now()))
    `,
    [
      restaurantId,
      productId,
      supplierId,
      branchId,
      unitPrice,
      unit || 'unit',
      currency || 'USD',
      costSource,
      sourceRefType,
      sourceRefId,
      effectiveAt,
    ]
  )
}

/**
 * Batch resolve and cache costs for products.
 * @param {string} restaurantId
 * @param {Array<{ productId: string, supplierId?: string, branchId?: string, unitPrice?: number, unit?: string, costSource?: string }>} items
 * @param {Function} [dbQuery]
 */
export async function upsertIngredientCostsFromReceiving(restaurantId, items, dbQuery = query) {
  for (const item of items) {
    if (!item.productId) continue
    const unitPrice = Number(item.unitPrice ?? item.actual_unit_price ?? item.expected_unit_price)
    if (!Number.isFinite(unitPrice)) continue
    await upsertIngredientCostCache(
      {
        restaurantId,
        productId: item.productId,
        supplierId: item.supplierId || item.supplier_id || null,
        branchId: item.branchId || null,
        unitPrice,
        unit: item.unit || 'unit',
        currency: item.currency || 'USD',
        costSource: 'LAST_RECEIVED',
        sourceRefType: 'receiving_line_item',
        sourceRefId: item.lineItemId || item.id || null,
        effectiveAt: new Date().toISOString(),
      },
      dbQuery
    )
  }
}

/**
 * @param {string} restaurantId
 * @param {string} productId
 * @param {string | null} supplierId
 * @param {string | null} branchId
 * @param {Function} [dbQuery]
 */
export async function getCachedIngredientCost(
  restaurantId,
  productId,
  supplierId,
  branchId,
  dbQuery = query
) {
  const { rows } = await dbQuery(
    `
    SELECT * FROM restaurant_ingredient_costs
    WHERE restaurant_id = $1 AND product_id = $2
      AND COALESCE(supplier_id, $4::uuid) = COALESCE($3::uuid, $4::uuid)
      AND COALESCE(branch_id, $4::uuid) = COALESCE($5::uuid, $4::uuid)
    LIMIT 1
    `,
    [restaurantId, productId, supplierId, NULL_UUID, branchId]
  )
  return rows[0] ? mapCostRow(rows[0]) : null
}
