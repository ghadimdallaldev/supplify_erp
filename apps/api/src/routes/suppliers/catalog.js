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
  attachStoreDealFields,
  supplierCreateSchema,
  supplierUpdateSchema,
  supplierListSchema,
} from './suppliers.helpers.js'

const log = createModuleLogger('suppliers.routes')

const router = express.Router()

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

    sql += `,
        EXISTS (
          SELECT 1 FROM supplier_featured_placements fp
          WHERE fp.supplier_id = s.id
            AND fp.status = 'active'
            AND fp.starts_at <= NOW()
            AND fp.ends_at > NOW()
        ) as is_featured`

    sql += `
      FROM supplier s
      ${whereClause}
      ORDER BY (
        EXISTS (
          SELECT 1 FROM supplier_featured_placements fp
          WHERE fp.supplier_id = s.id
            AND fp.status = 'active'
            AND fp.starts_at <= NOW()
            AND fp.ends_at > NOW()
        )
      ) DESC, s.created_at DESC
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
    const suppliersWithDeals = await attachStoreDealFields(suppliersWithReviews, { restaurantId })

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
        suppliers: suppliersWithDeals,
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

export default router
