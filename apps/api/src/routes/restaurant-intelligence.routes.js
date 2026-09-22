/**
 * Restaurant operational intelligence (deterministic, read-only).
 *
 * Layering, in order, on every route:
 *   requireAuth -> resolveTenantContext -> requireRole -> requirePermission
 *   -> requireIntelligenceTier
 *
 * The tier guard is the *last* check on purpose: entitlement is not
 * authorization. A tenant on Scale still cannot read purchase prices without
 * CATALOG_VIEW, and the tier never widens tenant scope.
 */
import express from 'express'

import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { requireIntelligenceTier } from '../lib/intelligence-tier.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  getProductPriceHistory,
  listPriceChangeAlerts,
  listCheaperBuyOptions,
} from '../services/restaurant-price-intelligence.service.js'

const router = express.Router()

router.use(
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  requirePermission('CATALOG_VIEW')
)

/** Never trust a client-supplied restaurant id; derive it from the session. */
async function restaurantScope(req) {
  const restaurantId = await getRestaurantIdForRequest(req)
  if (!restaurantId) throw new ValidationError('Restaurant not found')
  return restaurantId
}

// Price history is included from Growth upward.
router.get(
  '/price-history/:productId',
  requireIntelligenceTier('basic'),
  async (req, res, next) => {
    try {
      const restaurantId = await restaurantScope(req)
      const data = await getProductPriceHistory(restaurantId, req.params.productId, {
        days: req.query.days,
        limit: req.query.limit,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Price-change and cheaper-buy alerts are Intelligence tier and above.
router.get('/price-changes', requireIntelligenceTier('advanced'), async (req, res, next) => {
  try {
    const restaurantId = await restaurantScope(req)
    const data = await listPriceChangeAlerts(restaurantId, {
      days: req.query.days,
      minChangePct: req.query.minChangePct,
      direction: req.query.direction,
      limit: req.query.limit,
    })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/cheaper-buys', requireIntelligenceTier('advanced'), async (req, res, next) => {
  try {
    const restaurantId = await restaurantScope(req)
    const data = await listCheaperBuyOptions(restaurantId, {
      days: req.query.days,
      minChangePct: req.query.minChangePct,
      limit: req.query.limit,
    })
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export { router as restaurantIntelligenceRoutes }
