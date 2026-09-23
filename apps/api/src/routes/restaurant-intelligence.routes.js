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
import { requireFeature } from '../lib/subscription.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import {
  getProductPriceHistory,
  listPriceChangeAlerts,
  listCheaperBuyOptions,
} from '../services/restaurant-price-intelligence.service.js'
import {
  listFoodCostWarnings,
  listWeakMarginMenuItems,
} from '../services/restaurant-margin-intelligence.service.js'
import { getWasteIntelligence } from '../services/restaurant-waste-intelligence.service.js'

const router = express.Router()

// Permissions are applied per route, not router-wide: purchase-price surfaces
// need CATALOG_VIEW, while portion cost and margin need the narrower
// RECIPES_VIEW_COSTS, which Purchaser and Viewer deliberately lack.
router.use(requireAuth, resolveTenantContext, requireRole(['RESTAURANT', 'ADMIN']))

const canSeePurchasePrices = requirePermission('CATALOG_VIEW')
const canSeeRecipeCosts = requirePermission('RECIPES_VIEW_COSTS')
const canViewInventory = requirePermission('INVENTORY_VIEW')
const wasteTrackingFeature = requireFeature(
  'waste_tracking',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
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
  canSeePurchasePrices,
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
router.get(
  '/price-changes',
  canSeePurchasePrices,
  requireIntelligenceTier('advanced'),
  async (req, res, next) => {
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
  }
)

router.get(
  '/cheaper-buys',
  canSeePurchasePrices,
  requireIntelligenceTier('advanced'),
  async (req, res, next) => {
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
  }
)

// Food-cost and menu-margin warnings expose portion cost, so they require
// RECIPES_VIEW_COSTS rather than CATALOG_VIEW.
router.get(
  '/food-cost-warnings',
  canSeeRecipeCosts,
  requireIntelligenceTier('advanced'),
  async (req, res, next) => {
    try {
      const restaurantId = await restaurantScope(req)
      const data = await listFoodCostWarnings(restaurantId, {
        limit: req.query.limit,
        minOveragePct: req.query.minOveragePct,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/menu-profitability',
  canSeeRecipeCosts,
  requireIntelligenceTier('advanced'),
  async (req, res, next) => {
    try {
      const restaurantId = await restaurantScope(req)
      const data = await listWeakMarginMenuItems(restaurantId, {
        limit: req.query.limit,
        maxMarginPct: req.query.maxMarginPct,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Waste tracking remains its own domain feature. Intelligence adds comparison
// and repeat-pattern signals on top, but never lets an entitled caller bypass
// the waste or inventory permissions that protect the source records.
router.get(
  '/waste-intelligence',
  wasteTrackingFeature,
  canViewInventory,
  requireIntelligenceTier('advanced'),
  async (req, res, next) => {
    try {
      const restaurantId = await restaurantScope(req)
      const data = await getWasteIntelligence(restaurantId, {
        days: req.query.days,
        limit: req.query.limit,
      })
      res.json({ ok: true, data, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

export { router as restaurantIntelligenceRoutes }
