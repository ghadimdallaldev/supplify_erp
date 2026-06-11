import express from 'express'
import { z } from 'zod'
import { logger } from '../../lib/logger.js'
import { ValidationError } from '../../middlewares/errorHandler.js'
import { optionalAuthConsumer } from '../../middlewares/consumerAuth.js'
import { resolveRestaurantBySlug } from '../../services/consumer-menu.service.js'
import { getConsumerLoyaltyPreview } from '../../services/loyalty.service.js'

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

const previewQuerySchema = z.object({
  subtotal: z.coerce.number().nonnegative(),
  fulfillmentType: z.enum(['DELIVERY', 'TAKEAWAY', 'DINE_IN']).optional(),
  pointsToRedeem: z.coerce.number().int().positive().optional(),
})

/** Public routes mounted at /api/public/consumer/:restaurantSlug/loyalty */
export const consumerLoyaltyPublicRoutes = express.Router({ mergeParams: true })

consumerLoyaltyPublicRoutes.get('/preview', optionalAuthConsumer, async (req, res) => {
  try {
    const params = previewQuerySchema.parse(req.query)
    const restaurant = await resolveRestaurantBySlug(req.params.restaurantSlug)
    if (!restaurant) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }

    const preview = await getConsumerLoyaltyPreview({
      restaurantId: restaurant.id,
      memberId: req.consumerMember?.id ?? null,
      orderSubtotal: params.subtotal,
      fulfillmentType: params.fulfillmentType,
      pointsToRedeem: params.pointsToRedeem,
    })

    jsonOk(res, { preview })
  } catch (error) {
    if (error.name === 'ZodError') {
      return jsonError(res, 400, 'VALIDATION_ERROR', error.errors?.[0]?.message || 'Invalid input')
    }
    if (error instanceof ValidationError) {
      return jsonError(res, 400, 'VALIDATION_ERROR', error.message)
    }
    logger.error('Consumer loyalty preview failed', { error: error.message })
    jsonError(res, 500, 'LOYALTY_PREVIEW_ERROR', 'Unable to load rewards preview')
  }
})
