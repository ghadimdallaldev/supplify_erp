import express from 'express'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getRestaurantIdForRequest,
  requirePermission,
} from '../lib/rbac.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'
import {
  listConnectionRequestsForRestaurant,
  respondToConnectionRequest,
} from '../services/supplier-connection-request.service.js'
import {
  listRestaurantSponsorshipOffers,
  getRestaurantSponsorshipOffer,
  acceptSponsorship,
  declineSponsorship,
} from '../services/supplier-sponsorship.service.js'

const router = express.Router()

router.use(requireAuth, resolveTenantContext, requireRole(['RESTAURANT']))

async function resolveRestaurantId(req) {
  const id = await getRestaurantIdForRequest(req)
  if (!id) throw Object.assign(new Error('Restaurant not found'), { name: 'NOT_FOUND' })
  return id
}

router.get('/connection-requests', requirePermission(P.SETTINGS_VIEW), async (req, res, next) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const requests = await listConnectionRequestsForRestaurant(restaurantId)
    res.json({ ok: true, data: { requests }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/connection-requests/:id/accept',
  requirePermission(P.SETTINGS_MANAGE),
  async (req, res, next) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const data = await respondToConnectionRequest(req.params.id, restaurantId, true, { req })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/connection-requests/:id/decline',
  requirePermission(P.SETTINGS_MANAGE),
  async (req, res, next) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const data = await respondToConnectionRequest(req.params.id, restaurantId, false, { req })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get('/sponsorship-offers', requirePermission(P.SETTINGS_VIEW), async (req, res, next) => {
  try {
    const restaurantId = await resolveRestaurantId(req)
    const data = await listRestaurantSponsorshipOffers(restaurantId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get(
  '/sponsorship-offers/:id',
  requirePermission(P.SETTINGS_VIEW),
  async (req, res, next) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const data = await getRestaurantSponsorshipOffer(restaurantId, req.params.id)
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const acceptSchema = z.object({
  planId: z.string().uuid(),
})

router.post(
  '/sponsorship-offers/:id/accept',
  requirePermission(P.SETTINGS_MANAGE),
  async (req, res, next) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const body = acceptSchema.parse(req.body)
      const data = await acceptSponsorship(restaurantId, req.params.id, {
        planId: body.planId,
        acceptedByUserId: req.userData?.id || null,
        req,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/sponsorship-offers/:id/select-plan',
  requirePermission(P.SETTINGS_MANAGE),
  async (req, res, next) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const body = acceptSchema.parse(req.body)
      const data = await acceptSponsorship(restaurantId, req.params.id, {
        planId: body.planId,
        acceptedByUserId: req.userData?.id || null,
        req,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/sponsorship-offers/:id/decline',
  requirePermission(P.SETTINGS_MANAGE),
  async (req, res, next) => {
    try {
      const restaurantId = await resolveRestaurantId(req)
      const data = await declineSponsorship(restaurantId, req.params.id, {
        reason: req.body?.reason || 'declined_by_restaurant',
        req,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

export { router as restaurantConnectionRequestRoutes }
