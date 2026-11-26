import express from 'express'
import {
  requireAuth,
  requireRole,
  optionalAuth,
  resolveTenantContext,
  requirePermission,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
  getRequestTenant,
} from '../../lib/rbac.js'
import { requireFeature, isFeatureEnabled } from '../../lib/subscription.js'
import { query } from '../../lib/db.js'
import { createModuleLogger, logEvent, logQueryDebug, logger } from '../../lib/logger.js'
import { patchRequestLogTenant } from '../../lib/request-log-context.js'
import { invalidateTenantProfileCache } from '../../lib/tenant-profile-cache.js'
import { ValidationError, NotFoundError } from '../../middlewares/errorHandler.js'
import { createPendingActivationSubscription } from '../../lib/billing/subscription-activation.js'
import { ensureTenantSystemRoles } from '../../lib/tenant-roles.js'
import { restaurantSupplierMutationGuard } from '../../lib/route-permissions.js'
import { presentPublicSupplier } from '../../lib/tenant-profile-redaction.js'
import { z } from 'zod'
import { buildWhitelistedUpdate } from '../../lib/safe-update.js'
import {
  getSupplierRatingSummary,
  getRecentReviewsForSupplier,
  getSupplierRatingSummariesBatch,
  getRecentReviewsForSuppliersBatch,
} from '../../services/reviews.service.js'
import {
  listFeaturedPackages,
  purchaseAndActivateFeaturedPlacement,
  listPlacementsForSupplier,
  listAllActivePlacementsForAdmin,
} from '../../services/featured-supplier-placement.service.js'

import {
  attachReviewFields,
  supplierCreateSchema,
  supplierUpdateSchema,
  supplierListSchema,
} from './suppliers.helpers.js'
import { listCommonProductBestPrices } from '../../services/supplier-price-comparison.service.js'
import { tenantFeatureGate } from '../../lib/tenant-feature-gate.js'
import {
  blockSupplier,
  followSupplier,
  unblockSupplier,
  unfollowSupplier,
} from '../../services/relationship-writes.service.js'

const router = express.Router()

router.get(
  '/price-comparison',
  requireAuth,
  resolveTenantContext,
  tenantFeatureGate('price_comparison'),
  requireRole(['RESTAURANT']),
  requirePermission('CATALOG_VIEW'),
  async (req, res, next) => {
    try {
      const tenant = await getRequestTenant(req)
      if (!tenant || tenant.tenantType !== 'RESTAURANT') {
        throw new ValidationError('Restaurant not found')
      }
      const comparisons = await listCommonProductBestPrices(tenant.tenantId, {
        search: req.query.search,
        limit: req.query.limit,
      })
      res.json({ ok: true, data: { comparisons }, error: null, requestId: req.requestId })
    } catch (error) {
      next(error)
    }
  }
)

// Get followed suppliers (restaurant only)
router.get(
  '/followed',
  requireAuth,
  resolveTenantContext,
  tenantFeatureGate('supplier_following'),
  requireRole(['RESTAURANT']),
  requirePermission('CATALOG_VIEW'),
  async (req, res) => {
    try {
      const tenant = await getRequestTenant(req)
      if (!tenant || tenant.tenantType !== 'RESTAURANT') {
        throw new ValidationError('Restaurant not found')
      }
      const restaurantId = tenant.tenantId

      const { rows } = await query(
        `
      SELECT DISTINCT ON (sf.supplier_org_id)
        s.*,
        so.id AS supplier_organization_id,
        so.name AS organization_name,
        sf.created_at as followed_at
      FROM supplier_follow sf
      JOIN supplier_organizations so ON so.id = sf.supplier_org_id
      JOIN supplier s ON s.organization_id = sf.supplier_org_id AND s.is_branch_active = TRUE
      WHERE sf.restaurant_id = $1
      ORDER BY sf.supplier_org_id, s.is_main_branch DESC, s.created_at ASC
    `,
        [restaurantId]
      )

      res.json({
        ok: true,
        data: { suppliers: rows.map((row) => presentPublicSupplier(row)) },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get followed suppliers error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get followed suppliers',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Follow / unfollow / block / unblock (restaurant only). Relationships are per supplier
// organisation; every write goes through relationship-writes.service (locks, cap, hooks).
async function requireRestaurantTenant(req) {
  const tenant = await getRequestTenant(req)
  if (!tenant || tenant.tenantType !== 'RESTAURANT') {
    throw new ValidationError('Restaurant not found')
  }
  return tenant.tenantId
}

/** Any active branch of the supplier (by branch id, organisation id or slug). Private
 * catalogs are followable ("Follow to see the catalog"), so no public-catalog filter. */
async function resolveRelationshipTarget(idOrSlug) {
  const { rows } = await query(
    `SELECT s.id
     FROM supplier s
     JOIN supplier_organizations so ON so.id = s.organization_id
     WHERE (s.id::text = $1 OR so.id::text = $1 OR s.slug = $1 OR so.slug = $1)
       AND s.is_branch_active = TRUE
     ORDER BY s.is_main_branch DESC, s.created_at ASC
     LIMIT 1`,
    [idOrSlug]
  )
  if (!rows[0]) throw new NotFoundError('Supplier not found')
  return rows[0].id
}

function relationshipWriteRoute(method, path, handler) {
  router[method](
    path,
    requireAuth,
    resolveTenantContext,
    tenantFeatureGate('supplier_following'),
    requireRole(['RESTAURANT']),
    restaurantSupplierMutationGuard,
    async (req, res, next) => {
      try {
        const restaurantId = await requireRestaurantTenant(req)
        const supplierId = await resolveRelationshipTarget(req.params.id)
        const data = await handler({ req, restaurantId, supplierId })
        res.json({ ok: true, data, error: null, requestId: req.requestId })
      } catch (error) {
        next(error)
      }
    }
  )
}

relationshipWriteRoute('post', '/:id/follow', async ({ restaurantId, supplierId }) => {
  const result = await followSupplier({ restaurantId, supplierId, source: 'manual' })
  return {
    message: 'Supplier followed successfully',
    followed: true,
    alreadyFollowing: result.alreadyFollowing,
    supplierOrganizationId: result.supplierOrgId,
  }
})

relationshipWriteRoute('delete', '/:id/follow', async ({ restaurantId, supplierId }) => {
  const result = await unfollowSupplier({ restaurantId, supplierId })
  return {
    message: 'Supplier unfollowed successfully',
    followed: false,
    supplierOrganizationId: result.supplierOrgId,
  }
})

relationshipWriteRoute('post', '/:id/block', async ({ req, restaurantId, supplierId }) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : null
  const result = await blockSupplier({ restaurantId, supplierId, reason })
  return {
    message: 'Supplier blocked successfully',
    blocked: true,
    supplierOrganizationId: result.supplierOrgId,
  }
})

relationshipWriteRoute('delete', '/:id/block', async ({ restaurantId, supplierId }) => {
  const result = await unblockSupplier({ restaurantId, supplierId })
  return {
    message: 'Supplier unblocked successfully',
    blocked: false,
    supplierOrganizationId: result.supplierOrgId,
  }
})

export { router as suppliersRoutes }

export default router
