import { query, withTransaction } from '../lib/db.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import {
  assertNoPendingAmendment,
  getOrderForAmendment,
  notifyAmendmentParty,
} from './order-amendments.service.js'

export async function listProductSubstitutes(supplierId, productId) {
  await assertProductOwnership(supplierId, productId)
  const { rows } = await query(
    `
    SELECT
      ps.id,
      ps.product_id,
      ps.substitute_product_id,
      ps.priority,
      ps.notes,
      p.name AS substitute_name,
      p.sku AS substitute_sku,
      (
        SELECT amount FROM price pr
        WHERE pr.product_id = ps.substitute_product_id
        ORDER BY pr.valid_from DESC LIMIT 1
      ) AS substitute_price,
      (
        SELECT amount FROM price pr
        WHERE pr.product_id = ps.product_id
        ORDER BY pr.valid_from DESC LIMIT 1
      ) AS original_price
    FROM product_substitute ps
    JOIN product p ON p.id = ps.substitute_product_id
    WHERE ps.supplier_id = $1 AND ps.product_id = $2
    ORDER BY ps.priority ASC, ps.created_at ASC
    `,
    [supplierId, productId]
  )
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    substituteProductId: r.substitute_product_id,
    substituteName: r.substitute_name,
    substituteSku: r.substitute_sku,
    priority: r.priority,
    notes: r.notes,
    priceDifference: (parseFloat(r.substitute_price) || 0) - (parseFloat(r.original_price) || 0),
  }))
}

export async function createProductSubstitute(
  supplierId,
  productId,
  { substituteProductId, priority, notes }
) {
  await assertProductOwnership(supplierId, productId)
  await assertProductOwnership(supplierId, substituteProductId)

  const { rows } = await query(
    `
    INSERT INTO product_substitute (supplier_id, product_id, substitute_product_id, priority, notes)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [supplierId, productId, substituteProductId, priority ?? 1, notes ?? null]
  )
  return rows[0]
}

export async function deleteProductSubstitute(supplierId, productId, substituteId) {
  await assertProductOwnership(supplierId, productId)
  const { rowCount } = await query(
    `DELETE FROM product_substitute WHERE id = $1 AND supplier_id = $2 AND product_id = $3`,
    [substituteId, supplierId, productId]
  )
  if (!rowCount) throw new NotFoundError('Substitute mapping not found')
}

async function assertProductOwnership(supplierId, productId) {
  const { rows } = await query(`SELECT id FROM product WHERE id = $1 AND supplier_id = $2`, [
    productId,
    supplierId,
  ])
  if (!rows.length) throw new NotFoundError('Product not found')
}

export async function getSubstitutesForOrderItem(supplierId, productId) {
  return listProductSubstitutes(supplierId, productId)
}

export async function proposeOrderSubstitution({
  orderId,
  supplierId,
  orderItemId,
  substituteProductId,
  requestedByUserId,
  description,
}) {
  const order = await getOrderForAmendment(orderId)
  if (order.supplier_id !== supplierId) {
    throw new ValidationError('Access denied')
  }

  const { rows: items } = await query(
    `SELECT id, product_id FROM order_item WHERE id = $1 AND order_id = $2 AND supplier_id = $3`,
    [orderItemId, orderId, supplierId]
  )
  if (!items.length) throw new NotFoundError('Order item not found')

  const item = items[0]
  const subs = await listProductSubstitutes(supplierId, item.product_id)
  const allowed = subs.some((s) => s.substituteProductId === substituteProductId)
  if (!allowed) {
    throw new ValidationError('Substitute is not configured for this product')
  }

  const amendment = await withTransaction(async (client) => {
    await assertNoPendingAmendment(orderId, client)
    const { rows } = await client.query(
      `
      INSERT INTO order_amendments (
        order_id, requested_by_role, requested_by, change_type, description
      ) VALUES ($1, 'supplier', $2, 'item_substitution', $3)
      RETURNING *
      `,
      [orderId, requestedByUserId, description || 'Supplier proposed product substitute']
    )
    const created = rows[0]
    await client.query(
      `
      INSERT INTO order_amendment_items (
        amendment_id, order_item_id, original_product_id, substitute_product_id, notes
      ) VALUES ($1, $2, $3, $4, $5)
      `,
      [created.id, orderItemId, item.product_id, substituteProductId, description || null]
    )
    return created
  })

  await notifyAmendmentParty(order, amendment, 'created')

  return { amendmentId: amendment.id, status: 'pending', autoSent: false }
}
