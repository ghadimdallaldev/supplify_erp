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
import { requireFeature, isFeatureEnabled, getEntitlements } from '../../lib/subscription.js'
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
  getTenantCustomDomain,
  upsertTenantCustomDomain,
  verifyTenantCustomDomain,
} from '../../services/custom-domain.service.js'
import { hasBrandingCapability } from '../../lib/branding-tier.js'
import {
  mapSupplierBusinessSettingsRow,
  serializeOperatingHoursForDb,
  supplierBusinessSettingsUpdateSchema,
} from '../../lib/supplier-business-settings.js'
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
  brandingUpdateSchema,
  multiWarehouseFeature,
} from './suppliers.helpers.js'

const router = express.Router()

// Fulfillment mode (multi-warehouse toggle) — MUST be before /:id
router.get(
  '/me/fulfillment',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  multiWarehouseFeature,
  requirePermission('SETTINGS_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      const { rows } = await query(
        `SELECT id, multi_warehouse_enabled, default_warehouse_id, fulfillment_mode FROM supplier WHERE id = $1`,
        [supplierId]
      )
      if (!rows.length) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Supplier not found' },
          requestId: req.requestId,
        })
      }
      res.json({
        ok: true,
        data: { fulfillment: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get fulfillment settings error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to get fulfillment settings' },
        requestId: req.requestId,
      })
    }
  }
)

router.patch(
  '/me/fulfillment',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  multiWarehouseFeature,
  requirePermission('SETTINGS_MANAGE'),
  async (req, res) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      const { multi_warehouse_enabled, fulfillment_mode, confirm_disable } = req.body

      const planAllows = await isFeatureEnabled(supplierId, 'SUPPLIER', 'multi_warehouse')
      if (!planAllows && multi_warehouse_enabled) {
        return res.status(403).json({
          ok: false,
          data: null,
          error: { name: 'FEATURE_DISABLED', message: 'Multi-warehouse is not on your plan' },
          requestId: req.requestId,
        })
      }

      if (fulfillment_mode === 'single' || multi_warehouse_enabled === false) {
        const { rows: activeMulti } = await query(
          `SELECT COUNT(*)::int AS cnt FROM order_warehouse_assignment owa
           JOIN order_item oi ON oi.order_id = owa.order_id
           WHERE oi.supplier_id = $1 AND owa.order_item_id IS NOT NULL
             AND owa.status IN ('pending', 'picking', 'packed')`,
          [supplierId]
        )
        if (activeMulti[0]?.cnt > 0 && !confirm_disable) {
          return res.status(409).json({
            ok: false,
            data: null,
            error: {
              name: 'ACTIVE_MULTI_ORDERS',
              message:
                'Active split orders in progress. Confirm to switch to single-warehouse mode.',
              details: { activeCount: activeMulti[0].cnt },
            },
            requestId: req.requestId,
          })
        }
      }

      const { rows } = await query(
        `UPDATE supplier SET
          multi_warehouse_enabled = COALESCE($1, multi_warehouse_enabled),
          fulfillment_mode = COALESCE($2, fulfillment_mode),
          updated_at = now()
         WHERE id = $3
         RETURNING id, multi_warehouse_enabled, default_warehouse_id, fulfillment_mode`,
        [multi_warehouse_enabled, fulfillment_mode, supplierId]
      )

      res.json({
        ok: true,
        data: { fulfillment: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Update fulfillment settings error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update fulfillment settings' },
        requestId: req.requestId,
      })
    }
  }
)

// Get current supplier (for settings page) - MUST be before /:id route
router.get(
  '/me',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_VIEW'),
  async (req, res) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
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

      const { rows: suppliers } = await query('SELECT * FROM supplier WHERE id = $1', [supplierId])

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

      res.json({
        ok: true,
        data: { supplier: suppliers[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get supplier error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get supplier',
        },
        requestId: req.requestId,
      })
    }
  }
)

router.get(
  '/me/branding',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_VIEW'),
  requireFeature(
    'custom_branding',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')
      const branding = await getTenantBranding(supplierId, 'SUPPLIER')
      res.json({ ok: true, data: { branding }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/me/branding',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_EDIT'),
  requireFeature(
    'custom_branding',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')
      const body = brandingUpdateSchema.parse(req.body)
      const branding = await updateTenantBranding(supplierId, 'SUPPLIER', body)
      invalidateTenantProfileCache(supplierId, 'SUPPLIER')
      res.json({ ok: true, data: { branding }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

const customDomainSchema = z.object({
  hostname: z.string().min(3).max(253),
})

router.get(
  '/me/custom-domain',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_VIEW'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')
      const row = await getTenantCustomDomain(supplierId, 'SUPPLIER')
      const entitlements = await getEntitlements(supplierId, 'SUPPLIER')
      const allowed = hasBrandingCapability(entitlements?.features?.custom_branding, 'customDomain')
      res.json({
        ok: true,
        data: {
          allowed,
          customDomain: row
            ? {
                hostname: row.hostname,
                verifiedAt: row.verified_at,
                sslStatus: row.ssl_status,
                enabled: row.enabled,
              }
            : null,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.put(
  '/me/custom-domain',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_EDIT'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')
      const body = customDomainSchema.parse(req.body ?? {})
      const saved = await upsertTenantCustomDomain(supplierId, 'SUPPLIER', body.hostname)
      res.json({
        ok: true,
        data: {
          customDomain: {
            hostname: saved.hostname,
            verifiedAt: saved.verified_at,
            sslStatus: saved.ssl_status,
            enabled: saved.enabled,
            verificationInstructions: saved.verificationInstructions,
          },
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/me/custom-domain/verify',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_EDIT'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')
      const verified = await verifyTenantCustomDomain(supplierId, 'SUPPLIER')
      res.json({
        ok: true,
        data: {
          customDomain: {
            hostname: verified.hostname,
            verifiedAt: verified.verified_at,
            sslStatus: verified.ssl_status,
            enabled: verified.enabled,
          },
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/me/business',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_VIEW'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')

      const { rows } = await query(
        `SELECT business_hours_json, minimum_order_amount, payment_terms, return_policy, terms_and_conditions
         FROM supplier WHERE id = $1`,
        [supplierId]
      )
      if (!rows.length) throw new NotFoundError('Supplier not found')

      res.json({
        ok: true,
        data: { business: mapSupplierBusinessSettingsRow(rows[0]) },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.patch(
  '/me/business',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_EDIT'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')

      const body = supplierBusinessSettingsUpdateSchema.parse(req.body)
      const fields = []
      const values = []
      let paramIndex = 1

      if (body.operatingHours !== undefined) {
        fields.push(`business_hours_json = $${paramIndex++}`)
        values.push(JSON.stringify(serializeOperatingHoursForDb(body.operatingHours)))
      }
      if (body.minimumOrderAmount !== undefined) {
        fields.push(`minimum_order_amount = $${paramIndex++}`)
        values.push(body.minimumOrderAmount)
      }
      if (body.paymentTerms !== undefined) {
        fields.push(`payment_terms = $${paramIndex++}`)
        values.push(body.paymentTerms)
      }
      if (body.returnPolicy !== undefined) {
        fields.push(`return_policy = $${paramIndex++}`)
        values.push(body.returnPolicy)
      }
      if (body.termsAndConditions !== undefined) {
        fields.push(`terms_and_conditions = $${paramIndex++}`)
        values.push(body.termsAndConditions)
      }

      values.push(supplierId)
      const { rows } = await query(
        `UPDATE supplier
         SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${paramIndex}
         RETURNING business_hours_json, minimum_order_amount, payment_terms, return_policy, terms_and_conditions`,
        values
      )
      if (!rows.length) throw new NotFoundError('Supplier not found')

      await invalidateTenantProfileCache(supplierId, 'SUPPLIER')

      res.json({
        ok: true,
        data: { business: mapSupplierBusinessSettingsRow(rows[0]) },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/featured-placement/packages',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER', 'ADMIN']),
  async (req, res, next) => {
    try {
      const packages = await listFeaturedPackages()
      res.json({ ok: true, data: { packages }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/featured-placement/mine',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_VIEW'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')
      const placements = await listPlacementsForSupplier(supplierId)
      res.json({ ok: true, data: { placements }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post(
  '/featured-placement/purchase',
  requireAuth,
  resolveTenantContext,
  requireRole(['SUPPLIER']),
  requirePermission('SETTINGS_EDIT'),
  async (req, res, next) => {
    try {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) throw new NotFoundError('Supplier not found')
      const pricingKey = req.body?.pricingKey
      if (!pricingKey) throw new ValidationError('pricingKey is required')
      const placement = await purchaseAndActivateFeaturedPlacement({
        supplierId,
        pricingKey,
        createdBy: req.userData.id,
        waivePayment: process.env.NODE_ENV !== 'production',
      })
      res.status(201).json({ ok: true, data: { placement }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/featured-placement/admin/active',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res, next) => {
    try {
      const placements = await listAllActivePlacementsForAdmin()
      res.json({ ok: true, data: { placements }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Get supplier statistics for restaurant
router.get(
  '/:id/statistics',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT']),
  requirePermission('CATALOG_VIEW'),
  async (req, res) => {
    try {
      const { id: supplierId } = req.params

      const restaurantId = await getRestaurantIdForRequest(req)

      if (!restaurantId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message: 'Restaurant not found',
          },
          requestId: req.requestId,
        })
      }

      // Calculate statistics from orders
      // Count distinct orders that have items from this supplier
      const { rows: orderStats } = await query(
        `
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(oi.line_total), 0) as total_spent
      FROM customer_order o
      INNER JOIN order_item oi ON oi.order_id = o.id
      WHERE o.restaurant_id = $1 
        AND oi.supplier_id = $2
    `,
        [restaurantId, supplierId]
      )

      const totalOrders = parseInt(orderStats[0]?.total_orders || 0)
      const totalSpent = parseFloat(orderStats[0]?.total_spent || 0)
      const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

      res.json({
        ok: true,
        data: {
          totalOrders,
          totalSpent,
          averageOrderValue,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get supplier statistics error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get supplier statistics',
        },
        requestId: req.requestId,
      })
    }
  }
)

// Get supplier by ID
router.get(
  '/:id',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    if (req.userData?.role === 'RESTAURANT') {
      return requirePermission('CATALOG_VIEW')(req, res, () => handleGetSupplierById(req, res))
    }
    return handleGetSupplierById(req, res)
  }
)

async function handleGetSupplierById(req, res) {
  try {
    const { id } = req.params

    // Get restaurant ID for follow status if user is a restaurant
    let restaurantId = null
    if (req.userData && req.userData.role === 'RESTAURANT') {
      restaurantId = await getRestaurantIdForRequest(req)
    }

    // Build query with product_count and avg_price
    let sql = `
      SELECT 
        s.*,
        COALESCE(
          (SELECT COUNT(DISTINCT p.id) FROM product p WHERE p.supplier_id = s.id), 
          0
        ) as product_count,
        COALESCE(
          (SELECT AVG(pr.amount) FROM product p 
           JOIN price pr ON pr.product_id = p.id 
           WHERE p.supplier_id = s.id 
             AND (pr.valid_to IS NULL OR now() BETWEEN pr.valid_from AND pr.valid_to)), 
          0
        ) as avg_price
    `

    // Add follow status if restaurant
    let rows
    if (restaurantId) {
      sql += `,
        EXISTS (
          SELECT 1 FROM supplier_follow sf
          WHERE sf.supplier_id = s.id 
            AND sf.restaurant_id = $2
        ) as is_followed,
        EXISTS (
          SELECT 1 FROM supplier_blocklist sb
          WHERE sb.supplier_id = s.id
            AND sb.restaurant_id = $2
        ) as is_blocked
      `
      const result = await query(sql + ' FROM supplier s WHERE s.id = $1', [id, restaurantId])
      rows = result.rows
    } else {
      sql += `, false as is_followed, false as is_blocked`
      const result = await query(sql + ' FROM supplier s WHERE s.id = $1', [id])
      rows = result.rows
    }

    if (rows.length === 0) {
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

    const supplier = rows[0]
    const summary = await getSupplierRatingSummary(supplier.id)
    const recent_reviews = await getRecentReviewsForSupplier(supplier.id, 5)
    const enriched = {
      ...supplier,
      avg_overall: Number(summary.avg_overall) || 0,
      review_count: summary.review_count ?? 0,
      recent_reviews,
    }

    // Check access permissions
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

    res.json({
      ok: true,
      data: { supplier: enriched },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get supplier error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get supplier',
      },
      requestId: req.requestId,
    })
  }
}

export default router
