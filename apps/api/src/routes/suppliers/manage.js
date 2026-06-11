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

// Update supplier
router.patch(
  '/:id',
  requireAuth,
  resolveTenantContext,
  requirePermission('SETTINGS_EDIT'),
  async (req, res) => {
    try {
      const { id } = req.params
      const updateData = supplierUpdateSchema.parse(req.body)

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

      if (req.userData.role === 'SUPPLIER' && supplier.contact_email !== req.userData.email) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: {
            name: 'FORBIDDEN',
            message: 'Access denied',
          },
          requestId: req.requestId,
        })
      }

      const {
        fields: updateFields,
        values: updateValues,
        nextIndex: paramIndex,
      } = buildWhitelistedUpdate(
        updateData,
        {
          name: 'name',
          slug: 'slug',
          vatNo: 'vat_no',
          contactEmail: 'contact_email',
          phone: 'phone',
          address: 'address_json',
          publicCatalogEnabled: 'public_catalog_enabled',
        },
        {
          valueTransform: (dbField, value) =>
            dbField === 'address_json' ? JSON.stringify(value) : value,
        }
      )

      if (updateFields.length === 0) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'No fields to update',
          },
          requestId: req.requestId,
        })
      }

      updateFields.push(`updated_at = now()`)
      updateValues.push(id)

      const { rows } = await query(
        `
      UPDATE supplier 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `,
        updateValues
      )

      logger.info('Supplier updated', {
        supplierId: rows[0].id,
        actor: req.userData.id,
      })

      await invalidateTenantProfileCache(id, 'SUPPLIER')

      res.json({
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
            message: 'Invalid update data',
            details: error.errors,
          },
          requestId: req.requestId,
        })
      }

      logger.error('Update supplier error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to update supplier',
        },
        requestId: req.requestId,
      })
    }
  }
)

export default router
