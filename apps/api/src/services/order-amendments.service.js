import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { notifyTenantUsers } from './notification.service.js'
import { releaseStockForOrder, reserveStockForPlacedOrder } from './supplier-order-stock.service.js'
import { isFeatureEnabled } from '../lib/subscription.js'
import { resolveProductPrice } from './resolve-product-price.service.js'

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

/**
 * Recompute order total from line items, preserving already-applied promotion discounts.
 * Server remains authority; amendments must not wipe checkout deals.
 */
export async function recalculateOrderTotal(orderId, client) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(line_total), 0)::numeric AS total FROM order_item WHERE order_id = $1`,
    [orderId]
  )
  const subtotal = Number(rows[0]?.total || 0)

  const { rows: discountRows } = await client.query(
    `
    SELECT COALESCE(SUM(discount_applied), 0)::numeric AS discount
    FROM promotion_usages
    WHERE order_id = $1
    `,
    [orderId]
  )
  const discount = Number(discountRows[0]?.discount || 0)
  const total = Math.max(0, subtotal - discount)

  await client.query(
    `UPDATE customer_order SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
    [total, orderId]
  )
  return total
}

/**
 * Apply line-item changes from an accepted amendment.
 */
async function resolveAmendmentUnitPrice(
  client,
  { restaurantId, supplierId, productId, quantity, date }
) {
  const resolved = await resolveProductPrice(
    { restaurantId, supplierId, productId, quantity, date },
    client.query.bind(client)
  )
  if (resolved?.unitPrice == null) return null
  return {
    unitPrice: Number(resolved.unitPrice),
    pricingSource: resolved.source || 'DEFAULT_PRICE',
    contractPriceId: resolved.contractPriceId || null,
    currency: resolved.currency || 'USD',
  }
}

function sameOrderCurrency(orderCurrency, priceCurrency) {
  return (
    String(orderCurrency || 'USD')
      .trim()
      .toUpperCase() ===
    String(priceCurrency || 'USD')
      .trim()
      .toUpperCase()
  )
}

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

  const { rows: orderRows } = await client.query(
    `SELECT restaurant_id, requested_delivery_date, currency FROM customer_order WHERE id = $1`,
    [orderId]
  )
  const restaurantId = orderRows[0]?.restaurant_id
  const pricingDate = orderRows[0]?.requested_delivery_date || null
  const orderCurrency = orderRows[0]?.currency || 'USD'

  for (const item of items) {
    if (changeType === 'quantity_change' && item.order_item_id && item.requested_quantity != null) {
      const qty = Number(item.requested_quantity)
      let unitPrice = Number(item.unit_price || 0)

      if (restaurantId) {
        const { rows: orderItems } = await client.query(
          `SELECT product_id, supplier_id, pricing_source FROM order_item WHERE id = $1 AND order_id = $2`,
          [item.order_item_id, orderId]
        )
        if (orderItems.length && orderItems[0].pricing_source !== 'QUOTE_PRICE') {
          const resolvedPrice = await resolveAmendmentUnitPrice(client, {
            restaurantId,
            supplierId: orderItems[0].supplier_id,
            productId: orderItems[0].product_id,
            quantity: qty,
            date: pricingDate,
          })
          if (resolvedPrice != null && sameOrderCurrency(orderCurrency, resolvedPrice.currency)) {
            unitPrice = resolvedPrice.unitPrice
            await client.query(
              `
              UPDATE order_item
              SET quantity = $1, line_total = $2, unit_price = $3,
                  pricing_source = $4, contract_price_id = $5
              WHERE id = $6 AND order_id = $7
              `,
              [
                qty,
                qty * unitPrice,
                unitPrice,
                resolvedPrice.pricingSource,
                resolvedPrice.contractPriceId,
                item.order_item_id,
                orderId,
              ]
            )
            continue
          }
        }
      }

      const lineTotal = qty * unitPrice
      await client.query(
        `
        UPDATE order_item
        SET quantity = $1, line_total = $2, unit_price = $3
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
      const { rows: products } = await client.query(
        `SELECT supplier_id FROM product WHERE id = $1`,
        [item.substitute_product_id]
      )
      if (!products.length) throw new ValidationError('Substitute product not found')

      let unitPrice = Number(item.unit_price || 0)
      if (restaurantId) {
        const resolvedPrice = await resolveAmendmentUnitPrice(client, {
          restaurantId,
          supplierId: products[0].supplier_id,
          productId: item.substitute_product_id,
          quantity: qty,
          date: pricingDate,
        })
        if (resolvedPrice != null && !sameOrderCurrency(orderCurrency, resolvedPrice.currency)) {
          throw new ValidationError('Substitute price currency does not match this order')
        }
        if (resolvedPrice != null) {
          unitPrice = resolvedPrice.unitPrice
          const lineTotal = qty * unitPrice
          await client.query(
            `
            UPDATE order_item
            SET product_id = $1, supplier_id = $2, quantity = $3, unit_price = $4, line_total = $5,
                pricing_source = $6, contract_price_id = $7
            WHERE id = $8 AND order_id = $9
            `,
            [
              item.substitute_product_id,
              products[0].supplier_id,
              qty,
              unitPrice,
              lineTotal,
              resolvedPrice.pricingSource,
              resolvedPrice.contractPriceId,
              item.order_item_id,
              orderId,
            ]
          )
          continue
        }
      }

      const lineTotal = qty * unitPrice
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

async function rereserveOrderStock(client, orderId) {
  const { rows: orderRows } = await client.query(`SELECT * FROM customer_order WHERE id = $1`, [
    orderId,
  ])
  const order = orderRows[0]
  if (!order) return

  const { rows: orderItems } = await client.query(
    `
    SELECT oi.*, p.sku
    FROM order_item oi
    JOIN product p ON p.id = oi.product_id
    WHERE oi.order_id = $1
    `,
    [orderId]
  )
  if (!orderItems.length) return

  const supplierId = orderItems[0].supplier_id
  if (!supplierId) return

  const { rows: supplierRows } = await client.query(`SELECT * FROM supplier WHERE id = $1`, [
    supplierId,
  ])
  const multiActive = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')

  await reserveStockForPlacedOrder(client, {
    supplierId,
    supplier: supplierRows[0] || { id: supplierId },
    order: { ...order, restaurant_id: order.restaurant_id },
    orderItems,
    multiWarehouseActive: multiActive,
    legacyLineItems: orderItems.map((oi) => ({
      productId: oi.product_id,
      quantity: oi.quantity,
      sku: oi.sku,
    })),
  })
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

  const payload = {
    notificationType: 'ORDER',
    notificationCategory: 'order_amendment',
    title,
    message,
    referenceId: order.id,
    referenceType: 'ORDER',
    metadata: { orderId: order.id, amendmentId: amendment.id, action },
  }

  if (isRestaurantRequest && supplierId) {
    await notifyTenantUsers({
      tenantId: supplierId,
      tenantType: 'SUPPLIER',
      ...payload,
    })
    return
  }

  if (!isRestaurantRequest && restaurantId) {
    await notifyTenantUsers({
      tenantId: restaurantId,
      tenantType: 'RESTAURANT',
      ...payload,
    })
  }
}

export async function acceptAmendment(amendmentId, orderId, responderUserId, responseNotes) {
  return withTransaction(async (client) => {
    const { rows: orders } = await client.query(
      `SELECT status FROM customer_order WHERE id = $1 FOR UPDATE`,
      [orderId]
    )
    if (!orders.length) throw new NotFoundError('Order not found')
    if (!canAmendOrderStatus(orders[0].status)) {
      throw new ValidationError('Order cannot be amended after processing')
    }

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

    // Release pre-amendment reservations, apply line changes, then reserve for new quantities.
    // The release marks the previous warehouse leg failed. That was not a delivery
    // failure, so supersede it or a later delivery can never complete the order.
    await releaseStockForOrder(client, orderId)
    const newTotal = await applyAmendmentItems(client, orderId, amendmentId)
    await rereserveOrderStock(client, orderId)
    await client.query(
      `UPDATE order_warehouse_assignment
       SET status = 'superseded', superseded_at = now()
       WHERE order_id = $1 AND status = 'failed'`,
      [orderId]
    )

    const { rows: updated } = await client.query(
      `
      UPDATE order_amendments
      SET status = 'accepted', responded_by = $1, response_notes = $2, responded_at = NOW(), updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [responderUserId, responseNotes || null, amendmentId]
    )

    await client.query(
      `UPDATE order_fulfillment_issue
       SET status = 'accepted', updated_at = now()
       WHERE amendment_id = $1
         AND status IN ('shortage_reported', 'substitution_suggested', 'waiting_restaurant_approval')`,
      [amendmentId]
    )

    return { amendment: updated[0], newTotal }
  })
}
