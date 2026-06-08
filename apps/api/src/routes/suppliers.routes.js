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
} from '../lib/rbac.js'
import { requireFeature, isFeatureEnabled } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { createModuleLogger, logEvent, logQueryDebug, logger } from '../lib/logger.js'
import { patchRequestLogTenant } from '../lib/request-log-context.js'
import { invalidateTenantProfileCache } from '../lib/tenant-profile-cache.js'

const log = createModuleLogger('suppliers.routes')
import { ValidationError } from '../middlewares/errorHandler.js'
import { createPendingActivationSubscription } from '../lib/billing/subscription-activation.js'
import { ensureTenantSystemRoles } from '../lib/tenant-roles.js'
import { restaurantSupplierMutationGuard } from '../lib/route-permissions.js'
import { z } from 'zod'
import { buildWhitelistedUpdate } from '../lib/safe-update.js'
import {
  getSupplierRatingSummary,
  getRecentReviewsForSupplier,
  getSupplierRatingSummariesBatch,
  getRecentReviewsForSuppliersBatch,
} from '../services/reviews.service.js'

const router = express.Router()

async function attachReviewFields(suppliers) {
  if (!suppliers.length) return suppliers
  const ids = suppliers.map((s) => s.id)
  const [summaries, reviewsBySupplier] = await Promise.all([
    getSupplierRatingSummariesBatch(ids),
    getRecentReviewsForSuppliersBatch(ids, 3),
  ])
  return suppliers.map((s) => {
    const summary = summaries.get(s.id) || {
      avg_overall: 0,
      review_count: 0,
    }
    return {
      ...s,
      avg_overall: Number(summary.avg_overall) || 0,
      review_count: summary.review_count ?? 0,
      recent_reviews: reviewsBySupplier.get(s.id) || [],
    }
  })
}

// Validation schemas
const supplierCreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  vatNo: z.string().max(50).optional(),
  contactEmail: z.string().email(),
  phone: z.string().max(20).optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
})

const supplierUpdateSchema = supplierCreateSchema.partial()

const supplierListSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('20'),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('0'),
})

// List suppliers - publicly available with filters for restaurants
// Use optionalAuth to get restaurant ID for follow status without requiring auth
router.get('/', optionalAuth, async (req, res) => {
  try {
    const params = supplierListSchema.parse(req.query)

    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    // Text search
    if (params.q) {
      whereConditions.push(`LOWER(s.name) LIKE $${paramIndex}`)
      queryParams.push(`%${params.q.toLowerCase()}%`)
      paramIndex++
    }

    // City filter
    if (params.city) {
      whereConditions.push(`s.address_json->>'city' = $${paramIndex}`)
      queryParams.push(params.city)
      paramIndex++
    }

    // Handle restaurant-specific filtering
    let restaurantId = null

    const listFilters = {
      q: params.q ?? null,
      city: params.city ?? null,
      limit: params.limit,
      offset: params.offset,
    }

    if (req.userData?.role === 'RESTAURANT') {
      try {
        restaurantId = await getRestaurantIdForRequest(req)

        if (restaurantId) {
          patchRequestLogTenant(req, restaurantId, 'RESTAURANT')

          // Exclude blocklisted suppliers
          whereConditions.push(`
            NOT EXISTS (
              SELECT 1 FROM supplier_blocklist sb
              WHERE sb.supplier_id = s.id AND sb.restaurant_id = $${paramIndex}
            )
          `)
          queryParams.push(restaurantId)
          paramIndex++
        }
      } catch (error) {
        logEvent(log, 'warn', 'supplier.list.restaurant_lookup_failed', {
          error: error.message,
          role: req.userData?.role,
        })
        // Continue without restaurant-specific filtering
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Build the SELECT with proper type handling
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

    // Add follow status check for restaurants
    if (restaurantId) {
      sql += `,
        EXISTS (
          SELECT 1 FROM supplier_follow sf
          WHERE sf.supplier_id = s.id 
            AND sf.restaurant_id = $${paramIndex}
        ) as is_followed`
      queryParams.push(restaurantId)
      paramIndex++
    } else {
      sql += `, false as is_followed`
    }

    sql += `
      FROM supplier s
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    queryParams.push(params.limit, params.offset)

    logQueryDebug(log, 'supplier.list.query', sql, {
      paramCount: queryParams.length,
      filterCount: whereConditions.length,
      hasRestaurantScope: Boolean(restaurantId),
    })

    const { rows } = await query(sql, queryParams)

    const suppliersWithReviews = await attachReviewFields(rows)

    // Get total count
    // Build count params separately - exclude is_followed param and limit/offset
    // The count query uses the same whereClause but doesn't need is_followed
    const countParams = []
    let countParamIndex = 1

    // Rebuild count params from whereClause conditions only
    // Text search
    if (params.q) {
      countParams.push(`%${params.q.toLowerCase()}%`)
    }
    // City filter
    if (params.city) {
      countParams.push(params.city)
    }
    // Restaurant blocklist filter
    if (restaurantId) {
      countParams.push(restaurantId)
    }

    const countSql = `SELECT COUNT(*) as total FROM supplier s ${whereClause}`
    const { rows: countRows } = await query(countSql, countParams)

    logEvent(log, 'info', 'supplier.list', {
      ...listFilters,
      authenticated: Boolean(req.userData),
      role: req.userData?.role ?? null,
      restaurantScoped: Boolean(restaurantId),
      returned: rows.length,
      total: parseInt(countRows[0].total, 10),
    })

    res.json({
      ok: true,
      data: {
        suppliers: suppliersWithReviews,
        pagination: {
          total: parseInt(countRows[0].total),
          limit: params.limit,
          offset: params.offset,
        },
      },
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
          message: 'Invalid query parameters',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logEvent(log, 'error', 'supplier.list.failed', {
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list suppliers',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

const multiWarehouseFeature = requireFeature(
  'multi_warehouse',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

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
        ) as is_followed
      `
      const result = await query(sql + ' FROM supplier s WHERE s.id = $1', [id, restaurantId])
      rows = result.rows
    } else {
      sql += `, false as is_followed`
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
      const { checkLimit } = await import('../lib/subscription.js')
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
