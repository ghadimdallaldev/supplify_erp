import { performance } from 'node:perf_hooks'
import { incrementDailyUsageMeterInTransaction } from '../lib/subscription.js'
import { insertOrderItemsBatch } from './order-create.service.js'
import { assertAndDeductSupplierStockBatch } from './supplier-inventory.service.js'
import { assignWarehousesToOrder } from './warehouseRouting.js'

function elapsedMsSince(start) {
  return Math.round(performance.now() - start)
}

/**
 * Create restaurant checkout orders inside an existing DB transaction with sub-phase timings.
 */
export async function createRestaurantOrdersInTransaction({
  client,
  restaurantId,
  orderStatus,
  supplierGroups,
  supplierProfiles,
  supplierPromoEligibility,
  supplierMultiWarehouse,
  dailyMeterEnforcement,
  orderData,
  promotionHandlers,
}) {
  const txStartedAt = performance.now()
  const timings = {
    usageMeterMs: 0,
    orderHeaderInsertMs: 0,
    stockLockAndReserveMs: 0,
    orderItemsInsertMs: 0,
    orderTotalsUpdateMs: 0,
    promotionMs: 0,
    warehouseRoutingMs: 0,
  }
  let transactionQueryCount = 0
  const q = (...args) => {
    transactionQueryCount += 1
    return client.query(...args)
  }

  if (orderStatus === 'PLACED') {
    const usageStart = performance.now()
    await incrementDailyUsageMeterInTransaction(
      { query: q },
      restaurantId,
      'RESTAURANT',
      'orders_per_day',
      supplierGroups.size,
      dailyMeterEnforcement.resolved
    )
    timings.usageMeterMs = elapsedMsSince(usageStart)
  }

  const createdOrders = []
  let lineCount = 0

  for (const [supplierId, items] of supplierGroups.entries()) {
    lineCount += items.length
    const supplier = supplierProfiles.get(supplierId) ?? { id: supplierId }

    let phaseStart = performance.now()
    const {
      rows: [order],
    } = await q(
      `
          INSERT INTO customer_order (restaurant_id, currency, status)
          VALUES ($1, 'USD', $2)
          RETURNING *
        `,
      [restaurantId, orderStatus]
    )
    timings.orderHeaderInsertMs += elapsedMsSince(phaseStart)

    phaseStart = performance.now()
    await assertAndDeductSupplierStockBatch(
      { query: q },
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        sku: item.product.sku,
      }))
    )
    timings.stockLockAndReserveMs += elapsedMsSince(phaseStart)

    phaseStart = performance.now()
    const orderItems = await insertOrderItemsBatch({ query: q }, order.id, supplierId, items)
    timings.orderItemsInsertMs += elapsedMsSince(phaseStart)

    let totalAmount = orderItems.reduce((sum, row) => sum + Number(row.line_total), 0)

    phaseStart = performance.now()
    if (orderStatus === 'PLACED') {
      await q(
        `
            UPDATE customer_order 
            SET total_amount = $1, placed_at = now()
            WHERE id = $2
          `,
        [totalAmount, order.id]
      )
    } else {
      await q(
        `
            UPDATE customer_order 
            SET total_amount = $1
            WHERE id = $2
          `,
        [totalAmount, order.id]
      )
    }
    timings.orderTotalsUpdateMs += elapsedMsSince(phaseStart)

    let appliedPromotion = null
    const supplierHasPromos = supplierPromoEligibility.get(supplierId) === true
    const shouldApplyPromotions =
      orderStatus === 'PLACED' &&
      (orderData.promotionId || orderData.couponCode || supplierHasPromos)

    if (shouldApplyPromotions && promotionHandlers) {
      const promoLines = items.map((item) => ({
        productId: item.productId,
        categoryId: item.product.category_id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.unitPrice * item.quantity,
      }))

      phaseStart = performance.now()
      appliedPromotion = await promotionHandlers.applyPromotions({
        client: { query: q },
        order,
        supplierId,
        restaurantId,
        orderData,
        totalAmount,
        promoLines,
        supplierHasPromos,
      })
      if (appliedPromotion) {
        totalAmount = appliedPromotion.totalAfterDiscount
      }
      timings.promotionMs += elapsedMsSince(phaseStart)
    }

    let finalOrder = {
      ...order,
      total_amount: totalAmount,
      items: orderItems,
      status: orderStatus,
      appliedPromotion,
    }

    if (supplierProfiles.has(supplierId)) {
      const multiActive = supplierMultiWarehouse.get(supplierId) === true
      phaseStart = performance.now()
      const fulfillment = await assignWarehousesToOrder(
        { query: q },
        {
          order: { ...order, restaurant_id: restaurantId },
          orderItems,
          supplier,
          multiWarehouseActive: multiActive,
        }
      )
      timings.warehouseRoutingMs += elapsedMsSince(phaseStart)
      finalOrder = { ...finalOrder, warehouseFulfillment: fulfillment }
    }

    createdOrders.push(finalOrder)
  }

  return {
    orders: createdOrders,
    timings,
    lineCount,
    supplierCount: supplierGroups.size,
    totalTransactionMs: elapsedMsSince(txStartedAt),
    transactionQueryCount,
  }
}
