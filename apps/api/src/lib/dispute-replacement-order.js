import { ValidationError } from '../middlewares/errorHandler.js'
import { reserveStockForPlacedOrder } from '../services/supplier-order-stock.service.js'
import { isFeatureEnabled } from '../lib/subscription.js'

export const PLACEMENT_SOURCE_DISPUTE_REPLACEMENT = 'DISPUTE_REPLACEMENT'

const NO_REPLACEMENT_LINES_MESSAGE =
  'Cannot create replacement order because no disputed quantities were found.'

function toNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Compute replacement quantity for one dispute line.
 * @param {Record<string, unknown>} disputeItem
 */
export function computeReplacementQuantity(disputeItem) {
  const disputedQty = toNumber(disputeItem.disputed_quantity ?? disputeItem.disputedQuantity)
  if (disputedQty != null && disputedQty > 0) return disputedQty

  const ordered = toNumber(disputeItem.quantity_ordered ?? disputeItem.quantityOrdered)
  const received = toNumber(disputeItem.quantity_received ?? disputeItem.quantityReceived)
  if (ordered != null && received != null) {
    return Math.max(ordered - received, 0)
  }

  const quantity = toNumber(disputeItem.quantity)
  if (quantity != null && quantity > 0) return quantity

  return 0
}

/**
 * @param {Array<Record<string, unknown>>} disputeItems
 * @param {Map<string, Record<string, unknown>>} orderItemsById
 */
export function buildReplacementLineItems(disputeItems, orderItemsById) {
  const lines = []

  for (const disputeItem of disputeItems) {
    const replacementQty = computeReplacementQuantity(disputeItem)
    if (replacementQty <= 0) continue

    const orderItemId = String(disputeItem.order_item_id ?? disputeItem.orderItemId ?? '')
    const orderItem = orderItemId ? orderItemsById.get(orderItemId) : null

    if (!orderItem?.product_id) {
      continue
    }

    const originalUnitPrice = toNumber(orderItem.unit_price) ?? 0

    lines.push({
      productId: orderItem.product_id,
      supplierId: orderItem.supplier_id,
      quantity: replacementQty,
      originalUnitPrice,
      sourceOrderItemId: orderItem.id,
      productName: orderItem.product_name || disputeItem.product_name || disputeItem.productName,
      productSku: orderItem.product_sku,
      notes: disputeItem.issue_description || disputeItem.issueDescription || null,
    })
  }

  return lines
}

/**
 * Create a PLACED replacement order for disputed short quantities.
 * @returns {Promise<string>} replacement order id
 */
export async function createReplacementOrderFromDispute(
  client,
  { disputeRow, disputeItems, originalOrder }
) {
  const disputeId = disputeRow.id
  const originalOrderId = disputeRow.order_id
  const supplierId = disputeRow.supplier_id
  const restaurantId = disputeRow.restaurant_id

  if (disputeRow.replacement_order_id) {
    throw new ValidationError('A replacement order already exists for this dispute')
  }

  const orderItemIds = disputeItems
    .map((item) => item.order_item_id ?? item.orderItemId)
    .filter(Boolean)

  let orderItemsById = new Map()
  if (orderItemIds.length > 0) {
    const { rows: orderItems } = await client.query(
      `
      SELECT oi.*, p.name AS product_name, p.sku AS product_sku
      FROM order_item oi
      JOIN product p ON p.id = oi.product_id
      WHERE oi.order_id = $1
        AND oi.id = ANY($2::uuid[])
        AND oi.supplier_id = $3
      `,
      [originalOrderId, orderItemIds, supplierId]
    )
    orderItemsById = new Map(orderItems.map((row) => [String(row.id), row]))
  } else {
    const { rows: orderItems } = await client.query(
      `
      SELECT oi.*, p.name AS product_name, p.sku AS product_sku
      FROM order_item oi
      JOIN product p ON p.id = oi.product_id
      WHERE oi.order_id = $1 AND oi.supplier_id = $2
      `,
      [originalOrderId, supplierId]
    )
    orderItemsById = new Map(orderItems.map((row) => [String(row.id), row]))
  }

  const lines = buildReplacementLineItems(disputeItems, orderItemsById)
  if (!lines.length) {
    throw new ValidationError(NO_REPLACEMENT_LINES_MESSAGE)
  }

  const notes = `Replacement order created from dispute #${String(disputeId).slice(0, 8)} for original order #${String(originalOrderId).slice(0, 8)}`

  const {
    rows: [replacementOrder],
  } = await client.query(
    `
    INSERT INTO customer_order (
      restaurant_id,
      branch_id,
      currency,
      status,
      total_amount,
      placed_at,
      placement_source,
      source_order_id,
      source_dispute_id,
      notes
    ) VALUES (
      $1, $2, COALESCE($3, 'USD'), 'PLACED', 0, now(),
      $4, $5, $6, $7
    )
    RETURNING id
    `,
    [
      restaurantId,
      originalOrder?.branch_id ?? null,
      originalOrder?.currency ?? 'USD',
      PLACEMENT_SOURCE_DISPUTE_REPLACEMENT,
      originalOrderId,
      disputeId,
      notes,
    ]
  )

  const insertedItems = []
  for (const line of lines) {
    const {
      rows: [orderItem],
    } = await client.query(
      `
      INSERT INTO order_item (
        order_id,
        product_id,
        supplier_id,
        quantity,
        unit_price,
        line_total,
        notes,
        source_order_item_id,
        original_unit_price
      ) VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7)
      RETURNING *
      `,
      [
        replacementOrder.id,
        line.productId,
        line.supplierId,
        line.quantity,
        line.notes,
        line.sourceOrderItemId,
        line.originalUnitPrice,
      ]
    )
    insertedItems.push({ ...orderItem, sku: line.productSku })
  }

  const { rows: supplierRows } = await client.query(`SELECT * FROM supplier WHERE id = $1`, [
    supplierId,
  ])
  const multiActive = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')
  await reserveStockForPlacedOrder(client, {
    supplierId,
    supplier: supplierRows[0] || { id: supplierId },
    order: {
      id: replacementOrder.id,
      restaurant_id: restaurantId,
    },
    orderItems: insertedItems,
    multiWarehouseActive: multiActive,
    legacyLineItems: insertedItems.map((oi) => ({
      productId: oi.product_id,
      quantity: oi.quantity,
      sku: oi.sku,
      reserve: true,
    })),
    reserveLegacy: true,
  })

  await client.query(
    `
    UPDATE disputes
    SET replacement_order_id = $2, updated_at = NOW()
    WHERE id = $1
    `,
    [disputeId, replacementOrder.id]
  )

  return replacementOrder.id
}

export { NO_REPLACEMENT_LINES_MESSAGE }
