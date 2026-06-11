import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  getSupplierIdForRequest,
} from '../../lib/rbac.js'
import { requireFeature } from '../../lib/subscription.js'
import { logger } from '../../lib/logger.js'
import { ForbiddenError, ValidationError } from '../../middlewares/errorHandler.js'
import { updateTenantLogo } from '../../services/branding.service.js'

const router = express.Router()

router.post(
  '/:id/logo',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  requireFeature(
    'custom_branding',
    (req) => req.params.id,
    () => 'SUPPLIER'
  ),
  async (req, res, next) => {
    try {
      const { id } = req.params
      const { logoUrl } = req.body

      if (logoUrl == null) {
        throw new ValidationError('logoUrl is required')
      }

      if (req.userData.role === 'SUPPLIER') {
        const supplierId = await getSupplierIdForRequest(req)
        if (supplierId !== id) {
          throw new ForbiddenError('Access denied. You can only update your own logo')
        }
      }

      const supplier = await updateTenantLogo(id, 'SUPPLIER', logoUrl)

      logger.info('Supplier logo updated', {
        supplierId: id,
        logoUrl: supplier.logo_url,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { supplier },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
