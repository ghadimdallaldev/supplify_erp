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

// Create supplier (admin only)
router.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const supplierData = supplierCreateSchema.parse(req.body)

    const { rows } = await query(
      `
      INSERT INTO supplier (name, slug, vat_no, contact_email, phone, address_json)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        supplierData.name,
        supplierData.slug,
        supplierData.vatNo,
        supplierData.contactEmail,
        supplierData.phone,
        supplierData.address ? JSON.stringify(supplierData.address) : null,
      ]
    )

    await createPendingActivationSubscription(query, rows[0].id, 'SUPPLIER', 'free')
    await ensureTenantSystemRoles(rows[0].id, 'SUPPLIER')

    logger.info('Supplier created', {
      supplierId: rows[0].id,
      name: rows[0].name,
      actor: req.userData.id,
    })

    res.status(201).json({
      ok: true,
      data: { supplier: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Invalid supplier data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Create supplier error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create supplier',
      },
      requestId: req.requestId,
    })
  }
})

export default router
