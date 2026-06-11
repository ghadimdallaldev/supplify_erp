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
import { z } from 'zod'
import { buildWhitelistedUpdate } from '../../lib/safe-update.js'
import {
  getSupplierRatingSummary,
  getRecentReviewsForSupplier,
  getSupplierRatingSummariesBatch,
  getRecentReviewsForSuppliersBatch,
} from '../../services/reviews.service.js'
import { getTenantBranding, updateTenantBranding } from '../../services/branding.service.js'
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

const router = express.Router()

// Get followed suppliers (restaurant only)
router.get(
  '/followed',
  requireAuth,
  resolveTenantContext,
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
      SELECT 
        s.*,
        sf.created_at as followed_at
      FROM supplier s
      JOIN supplier_follow sf ON sf.supplier_id = s.id
      WHERE sf.restaurant_id = $1
      ORDER BY sf.created_at DESC
    `,
        [restaurantId]
      )

      res.json({
        ok: true,
        data: { suppliers: rows },
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

// Follow/Unfollow supplier (restaurant only)
router.post(
  '/:id/follow',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT']),
  restaurantSupplierMutationGuard,
  async (req, res) => {
    try {
      const { id } = req.params
      const tenant = await getRequestTenant(req)
      if (!tenant || tenant.tenantType !== 'RESTAURANT') {
        throw new ValidationError('Restaurant not found')
      }
      const restaurantId = tenant.tenantId

      // Check if already followed
      const { rows: existing } = await query(
        'SELECT * FROM supplier_follow WHERE supplier_id = $1 AND restaurant_id = $2',
        [id, restaurantId]
      )

      if (existing.length > 0) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Supplier is already being followed',
          },
          requestId: req.requestId,
        })
      }

      // Check plan limit for suppliers_per_restaurant
      const { checkLimit } = await import('../../lib/subscription.js')
      const limitCheck = await checkLimit(restaurantId, 'RESTAURANT', 'suppliers_per_restaurant')

      // Get current follow count
      const { rows: followCount } = await query(
        'SELECT COUNT(*) as count FROM supplier_follow WHERE restaurant_id = $1',
        [restaurantId]
      )

      const currentFollowCount = parseInt(followCount[0]?.count || 0)

      // Check if within limit (or unlimited)
      if (
        !limitCheck.isUnlimited &&
        limitCheck.limit !== null &&
        currentFollowCount >= limitCheck.limit
      ) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'SUPPLIER_FOLLOW_LIMIT_REACHED',
            message: `You have reached your plan limit for followed suppliers (${limitCheck.limit}). Upgrade your plan to follow more suppliers.`,
            details: {
              current: currentFollowCount,
              limit: limitCheck.limit,
              requiredPlan: limitCheck.limit === 2 ? 'Silver' : 'Gold',
            },
          },
          requestId: req.requestId,
        })
      }

      await query('INSERT INTO supplier_follow (supplier_id, restaurant_id) VALUES ($1, $2)', [
        id,
        restaurantId,
      ])

      logger.info('Supplier followed', {
        supplierId: id,
        restaurantId,
        followCount: currentFollowCount + 1,
      })

      res.json({
        ok: true,
        data: { message: 'Supplier followed successfully' },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Follow supplier error:', error)

      // ValidationError is already handled by the error handler middleware
      if (error instanceof ValidationError) {
        throw error
      }

      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to follow supplier',
        },
        requestId: req.requestId,
      })
    }
  }
)

router.delete(
  '/:id/follow',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT']),
  restaurantSupplierMutationGuard,
  async (req, res) => {
    try {
      const { id } = req.params
      const tenant = await getRequestTenant(req)
      if (!tenant || tenant.tenantType !== 'RESTAURANT') {
        throw new ValidationError('Restaurant not found')
      }
      const restaurantId = tenant.tenantId

      await query('DELETE FROM supplier_follow WHERE supplier_id = $1 AND restaurant_id = $2', [
        id,
        restaurantId,
      ])

      logger.info('Supplier unfollowed', { supplierId: id, restaurantId })

      res.json({
        ok: true,
        data: { message: 'Supplier unfollowed successfully' },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Unfollow supplier error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to unfollow supplier',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Block/Unblock supplier (restaurant only)
router.post(
  '/:id/block',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT']),
  restaurantSupplierMutationGuard,
  async (req, res) => {
    try {
      const { id } = req.params
      const tenant = await getRequestTenant(req)
      if (!tenant || tenant.tenantType !== 'RESTAURANT') {
        throw new ValidationError('Restaurant not found')
      }
      const restaurantId = tenant.tenantId
      const { reason } = req.body

      // Check if already blocked
      const { rows: existing } = await query(
        'SELECT * FROM supplier_blocklist WHERE supplier_id = $1 AND restaurant_id = $2',
        [id, restaurantId]
      )

      if (existing.length > 0) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Supplier is already blocked',
          },
          requestId: req.requestId,
        })
      }

      await query(
        'INSERT INTO supplier_blocklist (supplier_id, restaurant_id, reason) VALUES ($1, $2, $3)',
        [id, restaurantId, reason || null]
      )

      logger.info('Supplier blocked', { supplierId: id, restaurantId, reason })

      res.json({
        ok: true,
        data: { message: 'Supplier blocked successfully' },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Block supplier error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to block supplier',
        },
        requestId: req.requestId,
      })
    }
  }
)

router.delete(
  '/:id/block',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT']),
  restaurantSupplierMutationGuard,
  async (req, res) => {
    try {
      const { id } = req.params
      const tenant = await getRequestTenant(req)
      if (!tenant || tenant.tenantType !== 'RESTAURANT') {
        throw new ValidationError('Restaurant not found')
      }
      const restaurantId = tenant.tenantId

      await query('DELETE FROM supplier_blocklist WHERE supplier_id = $1 AND restaurant_id = $2', [
        id,
        restaurantId,
      ])

      logger.info('Supplier unblocked', { supplierId: id, restaurantId })

      res.json({
        ok: true,
        data: { message: 'Supplier unblocked successfully' },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Unblock supplier error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to unblock supplier',
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as suppliersRoutes }

export default router
