import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  resolveTenantContext,
  requirePermission,
  requireRole,
} from '../../lib/rbac.js'
import { requireRestaurantId } from '../../lib/tenant-resolve.js'
import { logger } from '../../lib/logger.js'
import {
  createConsumerOrder,
  getOrderReceipt,
  listRestaurantConsumerOrders,
  trackConsumerOrder,
  updateConsumerOrderStatus,
} from '../../services/consumer-order.service.js'
import { resolveRestaurantBySlug } from '../../services/consumer-menu.service.js'
import { optionalAuthConsumer } from '../../middlewares/consumerAuth.js'
import { emitConsumerOrderNew } from '../../lib/socket.js'

function jsonOk(res, data) {
  res.json({ ok: true, data, error: null, requestId: res.req.requestId })
}

function jsonError(res, status, name, message, details) {
  res.status(status).json({
    ok: false,
    data: null,
    error: { name, message, ...(details ? { details } : {}) },
    requestId: res.req.requestId,
  })
}

const orderLineSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  modifierOptionIds: z.array(z.string().uuid()).optional(),
  notes: z.string().optional(),
})

const createOrderSchema = z.object({
  branchId: z.string().uuid(),
  fulfillmentType: z.enum(['DELIVERY', 'TAKEAWAY', 'DINE_IN']),
  lines: z.array(orderLineSchema).min(1),
  guestName: z.string().min(1),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  deliveryAddress: z.record(z.any()).optional(),
  deliveryZoneId: z.string().uuid().optional(),
  notes: z.string().optional(),
  scheduledFor: z.string().optional(),
  pointsToRedeem: z.number().int().positive().optional(),
})

const consumerOrderStatusEnum = z.enum([
  'RECEIVED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
])

const listQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  status: consumerOrderStatusEnum.optional(),
  limit: z.coerce.number().int().positive().optional(),
})

const statusUpdateSchema = z.object({
  status: consumerOrderStatusEnum,
  notes: z.string().optional(),
})

const trackOrderSchema = z
  .object({
    orderNumber: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: 'Email or phone is required',
  })

/** Public routes mounted at /api/public/consumer/:restaurantSlug/orders */
export const consumerOrdersPublicRoutes = express.Router({ mergeParams: true })

consumerOrdersPublicRoutes.post('/', optionalAuthConsumer, async (req, res) => {
  try {
    const body = createOrderSchema.parse(req.body)
    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }

    const result = await createConsumerOrder(restaurant.id, {
      ...body,
      consumerMemberId: req.consumerMember?.id ?? null,
      pointsToRedeem: body.pointsToRedeem,
    })
    emitConsumerOrderNew(restaurant.id, result.order)
    jsonOk(res, {
      order: result.order,
      lines: result.lines,
      receiptToken: result.order.receipt_token,
    })
  } catch (error) {
    if (error.name && error.name !== 'Error') {
      const status =
        error.name === 'MIN_ORDER_NOT_MET' ||
        error.name === 'FULFILLMENT_NOT_AVAILABLE' ||
        error.name === 'DELIVERY_ADDRESS_REQUIRED' ||
        error.name === 'MODIFIER_MIN_NOT_MET' ||
        error.name === 'MODIFIER_MAX_EXCEEDED' ||
        error.name === 'INVALID_MODIFIER' ||
        error.name === 'LOYALTY_REDEEM_INVALID' ||
        error.name === 'LOYALTY_AUTH_REQUIRED' ||
        error.name === 'ORDERING_PREORDER_REQUIRED' ||
        error.name === 'ORDERING_SCHEDULE_TOO_EARLY' ||
        error.name === 'ORDERING_WINDOW_CLOSED' ||
        error.name === 'SCHEDULE_INVALID'
          ? 400
          : error.name === 'BRANCH_NOT_FOUND' ||
              error.name === 'MENU_ITEM_UNAVAILABLE' ||
              error.name === 'MODIFIER_UNAVAILABLE'
            ? 404
            : 400
      return jsonError(res, status, error.name, error.message, error.details)
    }
    logger.error('Create consumer order failed', { error: error.message })
    jsonError(res, 500, 'CREATE_ORDER_ERROR', 'Unable to place order')
  }
})

consumerOrdersPublicRoutes.post('/track', async (req, res) => {
  try {
    const body = trackOrderSchema.parse(req.body)
    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }

    const result = await trackConsumerOrder(restaurant.id, body)
    if (!result) {
      return jsonError(res, 404, 'ORDER_NOT_FOUND', 'Order not found')
    }
    jsonOk(res, result)
  } catch (error) {
    if (error.name === 'TRACK_LOOKUP_INVALID') {
      return jsonError(res, 400, error.name, error.message)
    }
    if (error.name === 'ZodError') {
      return jsonError(res, 400, 'VALIDATION_ERROR', error.errors?.[0]?.message || 'Invalid input')
    }
    logger.error('Track consumer order failed', { error: error.message })
    jsonError(res, 500, 'TRACK_ORDER_ERROR', 'Unable to track order')
  }
})

consumerOrdersPublicRoutes.get('/:receiptToken/receipt', async (req, res) => {
  try {
    const receipt = await getOrderReceipt(req.params.receiptToken)
    if (!receipt) {
      return jsonError(res, 404, 'RECEIPT_NOT_FOUND', 'Receipt not found')
    }
    jsonOk(res, receipt)
  } catch (error) {
    logger.error('Consumer order receipt fetch failed', { error: error.message })
    jsonError(res, 500, 'RECEIPT_ERROR', 'Unable to load receipt')
  }
})

/** Admin routes at /api/consumer/orders */
export const consumerOrdersAdminRoutes = express.Router()

consumerOrdersAdminRoutes.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('ORDERS_VIEW'),
  requireRole(['RESTAURANT', 'ADMIN'])
)

consumerOrdersAdminRoutes.get('/', async (req, res) => {
  try {
    const params = listQuerySchema.parse(req.query)
    const restaurantId = await requireRestaurantId(req)
    const orders = await listRestaurantConsumerOrders(restaurantId, params)
    jsonOk(res, { orders })
  } catch (error) {
    logger.error('List consumer orders failed', { error: error.message })
    jsonError(res, 500, 'LIST_ORDERS_ERROR', 'Unable to load orders')
  }
})

consumerOrdersAdminRoutes.patch(
  '/:id/status',
  requirePermission('ORDERS_MANAGE'),
  async (req, res) => {
    try {
      const body = statusUpdateSchema.parse(req.body)
      const restaurantId = await requireRestaurantId(req)
      const order = await updateConsumerOrderStatus(
        req.params.id,
        restaurantId,
        body.status,
        req.userData?.id,
        body.notes
      )
      jsonOk(res, { order })
    } catch (error) {
      if (error.name === 'ORDER_NOT_FOUND') {
        return jsonError(res, 404, error.name, error.message)
      }
      if (error.name === 'INVALID_STATUS_TRANSITION') {
        return jsonError(res, 400, error.name, error.message)
      }
      logger.error('Update consumer order status failed', { error: error.message })
      jsonError(res, 400, 'UPDATE_ORDER_ERROR', error.message || 'Unable to update order')
    }
  }
)
