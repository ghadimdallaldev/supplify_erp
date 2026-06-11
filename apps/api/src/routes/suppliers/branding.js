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

// Upload supplier logo (Gold+ custom branding)
router.post(
  '/:id/logo',
  requireAuth,
  requireRole(['SUPPLIER', 'ADMIN']),
  requireFeature(
    'custom_branding',
    (req) => req.params.id,
    () => 'SUPPLIER'
  ),
  async (req, res) => {
    try {
      const { id } = req.params
      const { logoUrl } = req.body

      if (!logoUrl) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'logoUrl is required',
          },
          requestId: req.requestId,
        })
      }

      // Check permissions
      const { rows: suppliers } = await query('SELECT * FROM supplier WHERE id = $1', [id])

      if (suppliers.length === 0) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Supplier not found',
          },
          requestId: req.requestId,
        })
      }

      const supplier = suppliers[0]

      // Suppliers can only update their own logo
      if (req.userData.role === 'SUPPLIER' && supplier.contact_email !== req.userData.email) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied. You can only update your own logo',
          },
          requestId: req.requestId,
        })
      }

      // Update logo URL
      const { rows } = await query(
        `
      UPDATE supplier 
      SET logo_url = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `,
        [logoUrl, id]
      )

      logger.info('Supplier logo updated', {
        supplierId: id,
        logoUrl,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { supplier: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Update supplier logo error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to update supplier logo',
        },
        requestId: req.requestId,
      })
    }
  }
)

export default router
