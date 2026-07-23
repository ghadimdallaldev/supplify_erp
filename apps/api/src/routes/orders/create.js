import express from 'express'
import PDFDocument from 'pdfkit'
import {
  requireAuth,
  requireRole,
  getRequestTenant,
  getRestaurantIdForRequest,
  getSupplierIdForRequest,
  resolveTenantContext,
  requirePermission,
} from '../../lib/rbac.js'
import { query, withTransaction } from '../../lib/db.js'
import { logger } from '../../lib/logger.js'
import { ValidationError, NotFoundError } from '../../middlewares/errorHandler.js'
import {
  DailyUsageLimitExceededError,
  resolveDailyMeterEnforcementFromSubscription,
  getTenantSubscription,
  getRecommendedPlanNames,
  buildLimitExceededPayload,
  isFeatureEnabled,
  resolveEffectivePlanFeatures,
} from '../../lib/subscription.js'
import { z } from 'zod'
import { notifyOrderStatusChange } from '../../services/notification.service.js'
import {
  applyBestPromotionToOrder,
  hasActiveSupplierOrderPromotionsBatch,
} from '../../services/promotions.service.js'
import {
  applyPromotionByIdToOrder,
  validateCouponForOrder,
} from '../../services/deal-promotions.service.js'
import { writeAuditLog } from '../../lib/audit.js'
import { orderAmendmentsRouter } from '../order-amendments.routes.js'
import { ordersDriverRoutes } from '../orders-driver.routes.js'
import { syncWarehouseFulfillmentOnOrderStatus } from '../../services/warehouseInventory.js'
import { hasPermission } from '../../lib/permissions.js'
import {
  updateDriverDeliveryStatus,
  getSupplierIdForOrder,
  orderHasProofOfDelivery,
} from '../../lib/driver-delivery.js'
import {
  resolveProductPricesBatch,
  getDefaultCatalogPricesBatch,
} from '../../services/resolve-product-price.service.js'
import { createRestaurantOrdersInTransaction } from '../../services/restaurant-order-create.service.js'
import { reserveStockForPlacedOrder } from '../../services/supplier-order-stock.service.js'
import { ordersRouterMutationGuard } from '../../lib/route-permissions.js'
import { releaseOrderFromPlannedRoutes } from '../../services/delivery-routes.service.js'
import { redeemLoyaltyAtCheckout } from '../../services/loyalty.service.js'

import {
  orderCreateSchema,
  supplierOrderCreateSchema,
  deliveryStatusSchema,
  orderUpdateSchema,
  orderListSchema,
  scheduleOrderStatusNotification,
  scheduleOrderPlacedNotification,
  elapsedMsSince,
} from './orders.helpers.js'

const router = express.Router()

router.post(
  '/',
  requireRole(['RESTAURANT']),
  requirePermission('ORDERS_CREATE'),
  async (req, res) => {
    try {
      const handlerStartedAt = performance.now()
      const orderCreateTimings = {}
      let phaseStart = performance.now()

      const orderData = orderCreateSchema.parse(req.body)

      const restaurantId = await getRestaurantIdForRequest(req)
      orderCreateTimings.restaurantLookupMs = elapsedMsSince(phaseStart)
      if (!restaurantId) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Restaurant workspace not found for user',
          },
          requestId: req.requestId,
        })
      }

      // Group items by supplier - split into separate orders per supplier
      const orderStatus = orderData.status || 'PLACED'

      // Batch-fetch products + catalog prices in parallel (avoids LATERAL + duplicate catalog query)
      phaseStart = performance.now()
      const productIds = [...new Set(orderData.items.map((item) => item.productId))]
      const [{ rows: products }, catalogByProductId] = await Promise.all([
        query(
          `
      SELECT id, supplier_id, sku, category_id, name
      FROM product
      WHERE id = ANY($1)
      `,
          [productIds]
        ),
        getDefaultCatalogPricesBatch(productIds),
      ])

      const productMap = new Map(products.map((p) => [p.id, p]))

      const resolveItems = orderData.items.map((item) => {
        const product = productMap.get(item.productId)
        return {
          productId: item.productId,
          supplierId: product?.supplier_id,
          quantity: item.quantity,
        }
      })
      const resolvedPrices = await resolveProductPricesBatch({
        restaurantId,
        items: resolveItems.filter((item) => item.supplierId),
        catalogByProductId,
        quoteLocks: orderData.quoteLocks,
      })
      const resolvedMap = new Map(resolvedPrices.map((r) => [r.productId, r]))
      orderCreateTimings.productPriceLookupMs = elapsedMsSince(phaseStart)

      if (orderData.quoteLocks?.length) {
        const lockByProductId = new Map(orderData.quoteLocks.map((lock) => [lock.productId, lock]))
        for (const item of orderData.items) {
          if (!lockByProductId.has(item.productId)) continue
          const resolved = resolvedMap.get(item.productId)
          if (resolved?.source !== 'QUOTE_PRICE') {
            const product = productMap.get(item.productId)
            throw new ValidationError(
              `Quoted price is no longer available for ${product?.sku || item.productId}. Remove the item and re-add it from your quote request.`
            )
          }
        }
      }

      // Validate and group items by supplier
      phaseStart = performance.now()
      const supplierGroups = new Map()
      for (const item of orderData.items) {
        const product = productMap.get(item.productId)
        if (!product) {
          throw new ValidationError(`Product ${item.productId} not found`)
        }
        const resolved = resolvedMap.get(item.productId)
        if (resolved?.unitPrice == null) {
          throw new ValidationError(`No valid price found for product ${product.sku}`)
        }
        if (!supplierGroups.has(product.supplier_id)) {
          supplierGroups.set(product.supplier_id, [])
        }
        supplierGroups.get(product.supplier_id).push({
          ...item,
          product,
          unitPrice: Number(resolved.unitPrice),
          pricingSource: resolved.source,
          contractPriceId: resolved.contractPriceId,
          defaultCatalogPrice: resolved.defaultPrice,
          quoteResponseItemId: resolved.quoteResponseItemId ?? null,
        })
      }
      orderCreateTimings.itemGroupingMs = elapsedMsSince(phaseStart)

      // Resolve daily limit + supplier preflight (reuse req.subscription when available)
      phaseStart = performance.now()
      let dailyMeterEnforcement = null
      let restaurantDealsEnabled = false
      const supplierPromoEligibility = new Map()
      const supplierMultiWarehouse = new Map()
      let supplierProfiles = new Map()

      if (orderStatus === 'PLACED') {
        const { resolveRequestSubscription } = await import('../../lib/request-subscription.js')
        const { resolveOrgBillingTenantId } = await import('../../lib/org-billing-tenant.js')
        const { resolveFeatureEnabled } = await import('../../lib/feature-flags.js')

        const subscription = await resolveRequestSubscription(req, {
          tenantId: restaurantId,
          tenantType: 'RESTAURANT',
        })
        const billingTenantId = await resolveOrgBillingTenantId(restaurantId, 'RESTAURANT')

        const [enforcement, dealsFeature] = await Promise.all([
          resolveDailyMeterEnforcementFromSubscription(
            subscription,
            restaurantId,
            'RESTAURANT',
            'orders_per_day'
          ),
          (async () => {
            const planFeatures = await resolveEffectivePlanFeatures(subscription)
            return resolveFeatureEnabled(
              billingTenantId,
              'RESTAURANT',
              'supplier_deals',
              planFeatures
            )
          })(),
        ])
        dailyMeterEnforcement = enforcement
        restaurantDealsEnabled = dealsFeature.enabled

        if (!dailyMeterEnforcement.subscription) {
          return res.status(403).json({
            ok: false,
            data: null,
            error: {
              name: 'FORBIDDEN',
              message: 'No active subscription for daily order limit',
            },
            requestId: req.requestId,
          })
        }

        const supplierIds = [...supplierGroups.keys()]
        if (supplierIds.length) {
          const { rows: supplierRows } = await query(
            `SELECT id, default_warehouse_id, fulfillment_mode, multi_warehouse_enabled, name
             FROM supplier WHERE id = ANY($1::uuid[])`,
            [supplierIds]
          )
          supplierProfiles = new Map(supplierRows.map((row) => [row.id, row]))

          const supplierSubscriptions = await Promise.all(
            supplierIds.map(async (supplierId) => [
              supplierId,
              await getTenantSubscription(supplierId, 'SUPPLIER'),
            ])
          )
          const supplierSubById = new Map(supplierSubscriptions)

          const supplierBillingIds = await Promise.all(
            supplierIds.map(async (supplierId) => [
              supplierId,
              await resolveOrgBillingTenantId(supplierId, 'SUPPLIER'),
            ])
          )
          const billingIdBySupplier = new Map(supplierBillingIds)

          const promoBySupplier =
            restaurantDealsEnabled && supplierIds.length
              ? await hasActiveSupplierOrderPromotionsBatch(query, supplierIds, restaurantId)
              : new Map()

          await Promise.all(
            supplierIds.map(async (supplierId) => {
              const supplierSub = supplierSubById.get(supplierId)
              const supplierBillingId = billingIdBySupplier.get(supplierId)
              supplierPromoEligibility.set(
                supplierId,
                restaurantDealsEnabled ? promoBySupplier.get(supplierId) === true : false
              )
              const multiWarehouseFeature = await resolveFeatureEnabled(
                supplierBillingId,
                'SUPPLIER',
                'multi_warehouse',
                supplierSub?.features
              )
              supplierMultiWarehouse.set(supplierId, multiWarehouseFeature.enabled)
            })
          )
        }
      }
      orderCreateTimings.dailyLimitCheckMs = elapsedMsSince(phaseStart)

      // Create separate order for each supplier
      const txPhaseTimings = { promotionMs: 0, warehouseMs: 0 }
      let transactionTiming = null

      phaseStart = performance.now()
      let result
      try {
        result = await withTransaction(async (client) => {
          const txResult = await createRestaurantOrdersInTransaction({
            client,
            restaurantId,
            orderStatus,
            supplierGroups,
            supplierProfiles,
            supplierPromoEligibility,
            supplierMultiWarehouse,
            dailyMeterEnforcement,
            orderData,
            promotionHandlers: {
              applyPromotions: async ({
                client: txClient,
                order,
                supplierId,
                restaurantId: restId,
                orderData: payload,
                totalAmount,
                promoLines,
              }) => {
                let appliedPromotion = null
                if (payload.promotionId) {
                  appliedPromotion = await applyPromotionByIdToOrder({
                    client: txClient,
                    promotionId: payload.promotionId,
                    orderId: order.id,
                    supplierId,
                    restaurantId: restId,
                    subtotal: totalAmount,
                    lineItems: promoLines,
                  })
                } else if (payload.couponCode) {
                  const couponMatch = await validateCouponForOrder({
                    couponCode: payload.couponCode,
                    supplierId,
                    restaurantId: restId,
                    subtotal: totalAmount,
                    lineItems: promoLines,
                  })
                  if (couponMatch) {
                    appliedPromotion = await applyPromotionByIdToOrder({
                      client: txClient,
                      promotionId: couponMatch.promotion.id,
                      orderId: order.id,
                      supplierId,
                      restaurantId: restId,
                      subtotal: totalAmount,
                      lineItems: promoLines,
                    })
                  }
                }

                if (!appliedPromotion) {
                  appliedPromotion = await applyBestPromotionToOrder({
                    client: txClient,
                    orderId: order.id,
                    supplierId,
                    restaurantId: restId,
                    subtotal: totalAmount,
                    lineItems: promoLines,
                    skipDealPreflight: true,
                  })
                }
                return appliedPromotion
              },
            },
            loyaltyHandlers: {
              redeem: async ({
                client: txClient,
                order,
                supplierId,
                restaurantId: restId,
                pointsToRedeem,
                orderSubtotal,
              }) =>
                redeemLoyaltyAtCheckout(txClient, {
                  supplierId,
                  restaurantId: restId,
                  orderId: order.id,
                  pointsToRedeem,
                  orderSubtotal,
                  createdBy: req.userData?.id,
                }),
            },
          })

          transactionTiming = txResult
          txPhaseTimings.promotionMs = txResult.timings.promotionMs
          txPhaseTimings.warehouseMs = txResult.timings.warehouseRoutingMs
          return txResult.orders
        })
      } catch (txError) {
        if (txError instanceof DailyUsageLimitExceededError) {
          const [subscription, recommendedPlans] = await Promise.all([
            getTenantSubscription(restaurantId, 'RESTAURANT'),
            getRecommendedPlanNames('RESTAURANT'),
          ])
          const limitCheck = { current: txError.current, limit: txError.limit }
          const err = buildLimitExceededPayload(
            limitCheck,
            'orders_per_day',
            subscription?.plan_name || subscription?.plan_display_name,
            recommendedPlans,
            undefined,
            'RESTAURANT'
          )
          err.details.requested = supplierGroups.size
          return res.status(403).json({
            ok: false,
            data: null,
            error: err,
            requestId: req.requestId,
          })
        }
        throw txError
      }
      orderCreateTimings.orderTransactionMs = elapsedMsSince(phaseStart)
      orderCreateTimings.promotionMs = txPhaseTimings.promotionMs
      orderCreateTimings.warehouseMs = txPhaseTimings.warehouseMs

      if (transactionTiming) {
        logger.info({
          event: 'order.create.transaction_timing',
          requestId: req.requestId,
          restaurantId,
          orderId: transactionTiming.orders.length === 1 ? transactionTiming.orders[0].id : null,
          orderIds: transactionTiming.orders.map((order) => order.id),
          lineCount: transactionTiming.lineCount,
          supplierCount: transactionTiming.supplierCount,
          totalTransactionMs: transactionTiming.totalTransactionMs,
          transactionQueryCount: transactionTiming.transactionQueryCount,
          usageMeterMs: transactionTiming.timings.usageMeterMs,
          orderHeaderInsertMs: transactionTiming.timings.orderHeaderInsertMs,
          orderItemsInsertMs: transactionTiming.timings.orderItemsInsertMs,
          stockLockAndReserveMs: transactionTiming.timings.stockLockAndReserveMs,
          warehouseRoutingMs: transactionTiming.timings.warehouseRoutingMs,
          orderTotalsUpdateMs: transactionTiming.timings.orderTotalsUpdateMs,
          promotionMs: transactionTiming.timings.promotionMs,
        })
      }

      // If only one order was created, return it directly. Otherwise, return array of orders
      const singleOrder = result.length === 1 ? result[0] : null

      phaseStart = performance.now()
      for (const order of result) {
        logger.info('Order created', {
          orderId: order.id,
          restaurantId: order.restaurant_id,
          supplierId: order.items[0]?.supplier_id,
          totalAmount: order.total_amount,
          itemCount: order.items.length,
          actor: req.userData.id,
        })

        if (order.status === 'PLACED') {
          await writeAuditLog(req, {
            action_type: 'order.created',
            tenant_type: 'RESTAURANT',
            tenant_id: order.restaurant_id,
            target_id: order.id,
            payload_json: {
              resource_type: 'order',
              total_amount: order.total_amount,
              promotion: order.appliedPromotion || null,
            },
          })
        }
      }
      orderCreateTimings.auditLogMs = elapsedMsSince(phaseStart)

      phaseStart = performance.now()
      let notificationsScheduled = 0
      for (const order of result) {
        if (order.status === 'PLACED' && order.items.length > 0) {
          const supplierId = order.items[0].supplier_id
          scheduleOrderPlacedNotification(order, supplierId)
          notificationsScheduled += 1
        }
      }
      orderCreateTimings.notificationScheduleMs = elapsedMsSince(phaseStart)
      orderCreateTimings.notificationsScheduled = notificationsScheduled

      orderCreateTimings.totalHandlerMs = elapsedMsSince(handlerStartedAt)
      if (req._perf?.stages) {
        const s = req._perf.stages
        orderCreateTimings.middlewareMs = Math.round(
          (s.auth ?? 0) +
            (s.tenant ?? 0) +
            (s.tenantContext ?? 0) +
            (s.billing ?? 0) +
            (s.feature ?? 0)
        )
      }

      logger.info({
        event: 'order.create.timing',
        requestId: req.requestId,
        restaurantId,
        orderCount: result.length,
        ...orderCreateTimings,
      })

      // Usage reserved atomically inside order transaction via incrementDailyUsageMeterInTransaction

      // Return single order if only one, otherwise return array
      res.status(201).json({
        ok: true,
        data: singleOrder ? { order: singleOrder } : { orders: result },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid order data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: error.message,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Create order error:', error)
      const exposeDetail = process.env.APP_ENV === 'dev' || process.env.NODE_ENV === 'development'
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: exposeDetail
            ? error.message || 'Failed to create order'
            : 'Failed to create order',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Create order manually by supplier (for phone orders, chat orders, etc.)
router.post(
  '/manual',
  requireRole(['SUPPLIER']),
  requirePermission('ORDERS_CREATE'),
  async (req, res) => {
    try {
      const orderData = supplierOrderCreateSchema.parse(req.body)

      const supplierId = await getSupplierIdForRequest(req)

      if (!supplierId) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Supplier record not found for user',
          },
          requestId: req.requestId,
        })
      }

      // Verify restaurant is an eligible customer (follows supplier or has ordered before)
      const { rows: eligibleRestaurants } = await query(
        `
        SELECT r.id
        FROM restaurant r
        WHERE r.id = $1
          AND r.id NOT IN (
            SELECT sb.restaurant_id FROM supplier_blocklist sb WHERE sb.supplier_id = $2
          )
          AND (
            EXISTS (
              SELECT 1
              FROM supplier_follow sf
              WHERE sf.supplier_id = $2 AND sf.restaurant_id = r.id
            )
            OR EXISTS (
              SELECT 1
              FROM customer_order o
              JOIN order_item oi ON oi.order_id = o.id
              WHERE o.restaurant_id = r.id AND oi.supplier_id = $2
            )
          )
      `,
        [orderData.restaurant_id, supplierId]
      )

      if (eligibleRestaurants.length === 0) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message:
              'This restaurant cannot receive manual orders. They must follow your supplier profile or have placed an order with you before.',
          },
          requestId: req.requestId,
        })
      }

      // Create order with transaction
      const result = await withTransaction(async (client) => {
        // Create order with status PLACED
        const {
          rows: [order],
        } = await client.query(
          `
        INSERT INTO customer_order (restaurant_id, currency, status, notes)
        VALUES ($1, 'USD', 'PLACED', $2)
        RETURNING *
      `,
          [orderData.restaurant_id, orderData.notes || null]
        )

        let totalAmount = 0
        const orderItems = []

        const manualResolveItems = orderData.items.map((item) => ({
          productId: item.productId,
          supplierId,
          quantity: item.quantity,
        }))
        const manualResolved = await resolveProductPricesBatch({
          restaurantId: orderData.restaurant_id,
          items: manualResolveItems,
        })
        const manualResolvedMap = new Map(manualResolved.map((r) => [r.productId, r]))

        // Process each item
        for (const item of orderData.items) {
          const { rows: products } = await client.query(
            `
          SELECT p.*, pr.amount as current_price, pr.currency
          FROM product p
          LEFT JOIN price pr ON pr.product_id = p.id 
            AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)
          WHERE p.id = $1 AND p.supplier_id = $2
        `,
            [item.productId, supplierId]
          )

          if (products.length === 0) {
            throw new ValidationError(
              `Product ${item.productId} not found or doesn't belong to supplier`
            )
          }

          const product = products[0]
          const resolved = manualResolvedMap.get(item.productId)

          if (resolved?.unitPrice == null) {
            throw new ValidationError(`No valid price found for product ${product.sku}`)
          }

          const unitPrice = Number(resolved.unitPrice)
          const lineTotal = unitPrice * item.quantity
          totalAmount += lineTotal

          const {
            rows: [orderItem],
          } = await client.query(
            `
          INSERT INTO order_item (
            order_id, product_id, supplier_id, quantity, unit_price, line_total, notes,
            pricing_source, contract_price_id, default_catalog_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
            [
              order.id,
              item.productId,
              supplierId,
              item.quantity,
              unitPrice,
              lineTotal,
              item.notes,
              resolved.source || 'DEFAULT_PRICE',
              resolved.contractPriceId || null,
              resolved.defaultPrice ?? null,
            ]
          )

          orderItems.push({ ...orderItem, sku: product.sku })
        }

        // Update order total
        await client.query(
          `
        UPDATE customer_order 
        SET total_amount = $1, placed_at = now()
        WHERE id = $2
      `,
          [totalAmount, order.id]
        )

        const { rows: supplierRows } = await client.query(`SELECT * FROM supplier WHERE id = $1`, [
          supplierId,
        ])
        const multiActive = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')
        const reserved = await reserveStockForPlacedOrder(client, {
          supplierId,
          supplier: supplierRows[0] || { id: supplierId },
          order: { ...order, restaurant_id: order.restaurant_id },
          orderItems,
          multiWarehouseActive: multiActive,
          legacyLineItems: orderItems.map((oi) => ({
            productId: oi.product_id,
            quantity: oi.quantity,
            sku: oi.sku,
            reserve: true,
          })),
          reserveLegacy: true,
        })

        return {
          ...order,
          total_amount: totalAmount,
          items: orderItems,
          warehouseFulfillment: reserved.fulfillment,
          stockMode: reserved.mode,
        }
      })

      logger.info('Manual order created by supplier', {
        orderId: result.id,
        restaurantId: result.restaurant_id,
        totalAmount: result.total_amount,
        itemCount: result.items.length,
        actor: req.userData.id,
      })

      res.status(201).json({
        ok: true,
        data: { order: result },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Invalid order data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Create manual order error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to create order',
        },
        requestId: req.requestId,
      })
    }
  }
)

export default router
