import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { sendNotification } from './notification.service.js'

export const MUTABLE_ORDER_STATUSES = new Set([
  'PLACED',
  'PENDING_APPROVAL',
  'ACKNOWLEDGED',
  'PROCESSING',
])

export function canAmendOrderStatus(status) {
  return MUTABLE_ORDER_STATUSES.has(status)
}

export async function getOrderForAmendment(orderId) {
  const { rows } = await query(
    `
    SELECT co.*,
      (SELECT oi.supplier_id FROM order_item oi WHERE oi.order_id = co.id LIMIT 1) AS supplier_id
    FROM customer_order co
    WHERE co.id = $1
    `,
    [orderId]
  )
  if (!rows.length) throw new NotFoundError('Order not found')
  return rows[0]
}

export async function assertNoPendingAmendment(orderId, client = query) {
  const { rows } = await client.query(
    `SELECT id FROM order_amendments WHERE order_id = $1 AND status = 'pending' LIMIT 1`,
    [orderId]
  )
  if (rows.length) {
    throw new ValidationError('A pending amendment already exists for this order')
  }
}

export async function recalculateOrderTotal(orderId, client) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(line_total), 0)::numeric AS total FROM order_item WHERE order_id = $1`,
    [orderId]
  )
  const total = Number(rows[0]?.total || 0)
  await client.query(
    `UPDATE customer_order SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
    [total, orderId]
  )
  return total
}

/**
 * Apply line-item changes from an accepted amendment.
 */
export async function applyAmendmentItems(client, orderId, amendmentId) {
  const { rows: items } = await client.query(
    `SELECT * FROM order_amendment_items WHERE amendment_id = $1`,
    [amendmentId]
  )

  const { rows: amendments } = await client.query(
    `SELECT change_type FROM order_amendments WHERE id = $1`,
    [amendmentId]
  )
  const changeType = amendments[0]?.change_type

  for (const item of items) {
    if (changeType === 'quantity_change' && item.order_item_id && item.requested_quantity != null) {
      const qty = Number(item.requested_quantity)
      const unitPrice = Number(item.unit_price || 0)
      const lineTotal = qty * unitPrice
      await client.query(
        `
        UPDATE order_item
        SET quantity = $1, line_total = $2, unit_price = COALESCE(unit_price, $3)
        WHERE id = $4 AND order_id = $5
        `,
        [qty, lineTotal, unitPrice, item.order_item_id, orderId]
      )
    } else if (changeType === 'item_removal' && item.order_item_id) {
      await client.query(`DELETE FROM order_item WHERE id = $1 AND order_id = $2`, [
        item.order_item_id,
        orderId,
      ])
    } else if (
      changeType === 'item_substitution' &&
      item.order_item_id &&
      item.substitute_product_id
    ) {
      const qty = Number(item.requested_quantity ?? item.original_quantity ?? 1)
      const unitPrice = Number(item.unit_price || 0)
      const lineTotal = qty * unitPrice
      const { rows: products } = await client.query(
        `SELECT supplier_id FROM product WHERE id = $1`,
        [item.substitute_product_id]
      )
      if (!products.length) throw new ValidationError('Substitute product not found')
      await client.query(
        `
        UPDATE order_item
        SET product_id = $1, supplier_id = $2, quantity = $3, unit_price = $4, line_total = $5
        WHERE id = $6 AND order_id = $7
        `,
        [
          item.substitute_product_id,
          products[0].supplier_id,
          qty,
          unitPrice,
          lineTotal,
          item.order_item_id,
          orderId,
        ]
      )
    }
  }

  return recalculateOrderTotal(orderId, client)
}

export async function notifyAmendmentParty(order, amendment, action) {
  const supplierId = order.supplier_id
  const restaurantId = order.restaurant_id
  const isRestaurantRequest = amendment.requested_by_role === 'restaurant'

  const title =
    action === 'created'
      ? 'Order change request'
      : action === 'accepted'
        ? 'Order change accepted'
        : action === 'rejected'
          ? 'Order change rejected'
          : 'Order change cancelled'

  const message = amendment.description || 'An order amendment was updated.'

  if (isRestaurantRequest && supplierId) {
    const { rows: users } = await query(
      `SELECT u.id FROM app_user u JOIN supplier s ON s.contact_email = u.email WHERE s.id = $1`,
      [supplierId]
    )
    for (const u of users) {
      await sendNotification({
        userId: u.id,
        tenantId: supplierId,
        tenantType: 'SUPPLIER',
        category: 'orders',
        title,
        message,
        metadata: { orderId: order.id, amendmentId: amendment.id, action },
      })
    }
    return
  }

  if (!isRestaurantRequest && restaurantId) {
    const { rows: users } = await query(
      `
      SELECT u.id FROM app_user u
      JOIN user_role ur ON ur.user_id = u.id AND ur.tenant_type = 'RESTAURANT' AND ur.tenant_id = $1
      LIMIT 20
      `,
      [restaurantId]
    )
    for (const u of users) {
      await sendNotification({
        userId: u.id,
        tenantId: restaurantId,
        tenantType: 'RESTAURANT',
        category: 'orders',
        title,
        message,
        metadata: { orderId: order.id, amendmentId: amendment.id, action },
      })
    }
  }
}

export async function acceptAmendment(amendmentId, orderId, responderUserId, responseNotes) {
  return withTransaction(async (client) => {
    const { rows: amendments } = await client.query(
      `SELECT * FROM order_amendments WHERE id = $1 AND order_id = $2 FOR UPDATE`,
      [amendmentId, orderId]
    )
    if (!amendments.length) throw new NotFoundError('Amendment not found')
    const amendment = amendments[0]
    if (amendment.status !== 'pending') {
      throw new ValidationError('Amendment is not pending')
    }
    if (amendment.requested_by === responderUserId) {
      throw new ValidationError('You cannot accept your own amendment request')
    }

    const newTotal = await applyAmendmentItems(client, orderId, amendmentId)

    const { rows: updated } = await client.query(
      `
      UPDATE order_amendments
      SET status = 'accepted', responded_by = $1, response_notes = $2, responded_at = NOW(), updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [responderUserId, responseNotes || null, amendmentId]
    )

    return { amendment: updated[0], newTotal }
  })
}
