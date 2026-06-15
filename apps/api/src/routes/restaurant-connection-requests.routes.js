import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import {
  listConnectionRequestsForRestaurant,
  respondToConnectionRequest,
} from '../services/supplier-connection-request.service.js'

const router = express.Router()

router.use(requireAuth, resolveTenantContext, requireRole(['RESTAURANT']))

async function resolveRestaurantId(req) {
  const id = await getRestaurantIdForRequest(req)
  if (!id) throw Object.assign(new Error('Restaurant not found'), { name: 'NOT_FOUND' })
  return id
}

router.get('/connection-requests', async (req, res, next) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const requests = await listConnectionRequestsForRestaurant(restaurantId)
    res.json({ ok: true, data: { requests }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/connection-requests/:id/accept', async (req, res, next) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await respondToConnectionRequest(req.params.id, restaurantId, true, { req })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/connection-requests/:id/decline', async (req, res, next) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await respondToConnectionRequest(req.params.id, restaurantId, false, { req })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export { router as restaurantConnectionRequestRoutes }
