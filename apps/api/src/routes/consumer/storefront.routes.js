import express from 'express'
import { logger } from '../../lib/logger.js'
import { getPublicConsumerStorefront } from '../../services/consumer-menu.service.js'

function jsonOk(res, data) {
  res.json({ ok: true, data, error: null, requestId: res.req.requestId })
}

function jsonError(res, status, name, message) {
  res.status(status).json({
    ok: false,
    data: null,
    error: { name, message },
    requestId: res.req.requestId,
  })
}

/** Public: GET /api/public/consumer/:restaurantSlug/storefront */
export const consumerStorefrontPublicRoutes = express.Router({ mergeParams: true })

consumerStorefrontPublicRoutes.get('/', async (req, res) => {
  try {
    const storefront = await getPublicConsumerStorefront(req.params.restaurantSlug)
    if (!storefront) {
      return jsonError(res, 404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found')
    }
    jsonOk(res, storefront)
  } catch (error) {
    logger.error('Public consumer storefront fetch failed', { error: error.message })
    jsonError(res, 500, 'STOREFRONT_ERROR', 'Unable to load storefront')
  }
})
