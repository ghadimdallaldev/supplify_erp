import express from 'express'
import {
  requireAuth,
  requireRole,
  resolveTenantContext,
  requirePermission,
  getSupplierIdForRequest,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError, ForbiddenError } from '../middlewares/errorHandler.js'
import { createPendingActivationSubscription } from '../lib/billing/subscription-activation.js'
import { ensureTenantSystemRoles } from '../lib/tenant-roles.js'
import { z } from 'zod'
import { buildWhitelistedUpdate } from '../lib/safe-update.js'
import { deliveredOrderStatusInSql } from '../lib/order-statuses.js'
import { invalidateTenantProfileCache } from '../lib/tenant-profile-cache.js'
import {
  getTenantBranding,
  updateTenantBranding,
  updateTenantLogo,
} from '../services/branding.service.js'
import { brandingUpdateSchema } from './suppliers/suppliers.helpers.js'

const router = express.Router()

// Validation schemas
const restaurantCreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  tradeLicenseNo: z.string().max(50).optional(),
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

const restaurantUpdateSchema = restaurantCreateSchema.partial()

const restaurantListSchema = z.object({
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

// List restaurants (admin sees all; suppliers see customers who ordered or follow them)
router.get('/', requireAuth, async (req, res) => {
  try {
    const params = restaurantListSchema.parse(req.query)

    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    // Role-based filtering
    if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)

      if (!supplierId) {
        return res.json({
          ok: true,
          data: {
            restaurants: [],
            pagination: {
              total: 0,
              limit: params.limit,
              offset: params.offset,
            },
          },
          error: null,
          requestId: req.requestId,
        })
      }

      whereConditions.push(`
        id IN (
          SELECT DISTINCT o.restaurant_id
          FROM customer_order o
          JOIN order_item oi ON oi.order_id = o.id
          WHERE oi.supplier_id = $${paramIndex}
          UNION
          SELECT sf.restaurant_id
          FROM supplier_follow sf
          WHERE sf.supplier_id = $${paramIndex}
        )
        AND id NOT IN (
          SELECT sb.restaurant_id
          FROM supplier_blocklist sb
          WHERE sb.supplier_id = $${paramIndex}
        )
      `)
      queryParams.push(supplierId)
      paramIndex++
    } else if (req.userData.role !== 'ADMIN') {
      // Other roles (RESTAURANT) have no access
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
    // Admin sees all (no additional filter)

    // Text search
    if (params.q) {
      whereConditions.push(`LOWER(name) LIKE $${paramIndex}`)
      queryParams.push(`%${params.q.toLowerCase()}%`)
      paramIndex++
    }

    // City filter
    if (params.city) {
      whereConditions.push(`address_json->>'city' = $${paramIndex}`)
      queryParams.push(params.city)
      paramIndex++
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const sql = `
      SELECT 
        r.*,
        (SELECT COUNT(*) FROM customer_order WHERE restaurant_id = r.id) as total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM customer_order WHERE restaurant_id = r.id AND ${deliveredOrderStatusInSql()}) as total_spent,
        (
          SELECT json_build_object(
            'id', o.id,
            'status', o.status,
            'total_amount', o.total_amount,
            'placed_at', o.placed_at,
            'created_at', o.created_at
          )
          FROM customer_order o
          WHERE o.restaurant_id = r.id
          ORDER BY COALESCE(o.placed_at, o.created_at) DESC
          LIMIT 1
        ) as latest_order
      FROM restaurant r
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    queryParams.push(params.limit, params.offset)

    const { rows } = await query(sql, queryParams)

    // Parse latest_order JSON and format the response
    const restaurantsWithLatestOrder = rows.map((row) => ({
      ...row,
      totalOrders: parseInt(row.total_orders || 0),
      totalSpent: parseFloat(row.total_spent || 0),
      latestOrder: row.latest_order
        ? {
            ...row.latest_order,
            total_amount: parseFloat(row.latest_order.total_amount || 0),
          }
        : null,
    }))

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM restaurant ${whereClause}`
    const countParams = queryParams.slice(0, -2)
    const { rows: countRows } = await query(countSql, countParams)

    res.json({
      ok: true,
      data: {
        restaurants: restaurantsWithLatestOrder,
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

    logger.error('List restaurants error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to list restaurants',
      },
      requestId: req.requestId,
    })
  }
})

// Get current restaurant (for settings page) — must be before /:id so "me" is not treated as an id
router.get('/me', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { getRestaurantIdForRequest } = await import('../lib/rbac.js')
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Restaurant workspace not found for user',
        },
        requestId: req.requestId,
      })
    }
    const { rows: restaurants } = await query('SELECT * FROM restaurant WHERE id = $1', [
      restaurantId,
    ])

    if (restaurants.length === 0) {
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

    res.json({
      ok: true,
      data: { restaurant: restaurants[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get restaurant error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get restaurant',
      },
      requestId: req.requestId,
    })
  }
})

router.get(
  '/me/branding',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT']),
  requirePermission('SETTINGS_VIEW'),
  requireFeature(
    'custom_branding',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new NotFoundError('Restaurant not found')
      const branding = await getTenantBranding(restaurantId, 'RESTAURANT')
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
  requireRole(['RESTAURANT']),
  requirePermission('SETTINGS_EDIT'),
  requireFeature(
    'custom_branding',
    (req) => req.tenantContext?.tenantId,
    (req) => req.tenantContext?.tenantType
  ),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) throw new NotFoundError('Restaurant not found')
      const body = brandingUpdateSchema.parse(req.body)
      const branding = await updateTenantBranding(restaurantId, 'RESTAURANT', body)
      invalidateTenantProfileCache(restaurantId, 'RESTAURANT')
      res.json({ ok: true, data: { branding }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

// Delivery destination coordinates (ETA readiness)
router.get('/me/delivery-locations', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { getRestaurantIdForRequest } = await import('../lib/rbac.js')
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Restaurant workspace not found for user' },
        requestId: req.requestId,
      })
    }
    const { listRestaurantDeliveryLocations } = await import(
      '../services/restaurant-delivery-location.service.js'
    )
    const data = await listRestaurantDeliveryLocations(restaurantId)
    res.json({ ok: true, data, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('GET /api/restaurants/me/delivery-locations error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load delivery locations' },
      requestId: req.requestId,
    })
  }
})

router.patch(
  '/me/delivery-location',
  requireAuth,
  requireRole(['RESTAURANT']),
  async (req, res) => {
    try {
      const { getRestaurantIdForRequest } = await import('../lib/rbac.js')
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Restaurant workspace not found for user' },
          requestId: req.requestId,
        })
      }
      const { updateRestaurantDeliveryLocation } = await import(
        '../services/restaurant-delivery-location.service.js'
      )
      const location = await updateRestaurantDeliveryLocation(restaurantId, req.body)
      res.json({ ok: true, data: { location }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
          requestId: req.requestId,
        })
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('PATCH /api/restaurants/me/delivery-location error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update delivery location' },
        requestId: req.requestId,
      })
    }
  }
)

router.patch(
  '/branches/:branchId/delivery-location',
  requireAuth,
  requireRole(['RESTAURANT']),
  async (req, res) => {
    try {
      const { getRestaurantIdForRequest } = await import('../lib/rbac.js')
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Restaurant workspace not found for user' },
          requestId: req.requestId,
        })
      }
      const { updateBranchDeliveryLocation } = await import(
        '../services/restaurant-delivery-location.service.js'
      )
      const location = await updateBranchDeliveryLocation(
        restaurantId,
        req.params.branchId,
        req.body
      )
      res.json({ ok: true, data: { location }, error: null, requestId: req.requestId })
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: error.message },
          requestId: req.requestId,
        })
      }
      if (error instanceof NotFoundError) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: error.message },
          requestId: req.requestId,
        })
      }
      logger.error('PATCH /api/restaurants/branches/:branchId/delivery-location error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update branch delivery location' },
        requestId: req.requestId,
      })
    }
  }
)

// Get restaurant by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { rows } = await query('SELECT * FROM restaurant WHERE id = $1', [id])

    if (rows.length === 0) {
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

    const restaurant = rows[0]

    if (req.userData.role === 'ADMIN') {
      // Admin may read any restaurant
    } else if (req.userData.role === 'RESTAURANT') {
      const restaurantId = await getRestaurantIdForRequest(req)
      if (!restaurantId || restaurantId !== id) {
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
    } else if (req.userData.role === 'SUPPLIER') {
      const supplierId = await getSupplierIdForRequest(req)
      if (!supplierId) {
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
      const { rows: linked } = await query(
        `
        SELECT 1
        FROM supplier_follow sf
        WHERE sf.supplier_id = $1
          AND sf.restaurant_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM supplier_blocklist sb
            WHERE sb.supplier_id = $1 AND sb.restaurant_id = $2
          )
        UNION
        SELECT 1
        FROM customer_order o
        JOIN order_item oi ON oi.order_id = o.id
        WHERE o.restaurant_id = $2
          AND oi.supplier_id = $1
        LIMIT 1
      `,
        [supplierId, id]
      )
      if (!linked.length) {
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
    } else {
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
      data: { restaurant },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get restaurant error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get restaurant',
      },
      requestId: req.requestId,
    })
  }
})

// Create restaurant (admin only)
router.post('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const restaurantData = restaurantCreateSchema.parse(req.body)

    const { rows } = await query(
      `
      INSERT INTO restaurant (name, slug, trade_license_no, contact_email, phone, address_json)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        restaurantData.name,
        restaurantData.slug,
        restaurantData.tradeLicenseNo,
        restaurantData.contactEmail,
        restaurantData.phone,
        restaurantData.address ? JSON.stringify(restaurantData.address) : null,
      ]
    )

    await createPendingActivationSubscription(query, rows[0].id, 'RESTAURANT', 'free')
    await ensureTenantSystemRoles(rows[0].id, 'RESTAURANT')

    logger.info('Restaurant created', {
      restaurantId: rows[0].id,
      name: rows[0].name,
      actor: req.userData.id,
    })

    res.status(201).json({
      ok: true,
      data: { restaurant: rows[0] },
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
          message: 'Invalid restaurant data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error('Create restaurant error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to create restaurant',
      },
      requestId: req.requestId,
    })
  }
})

// Upload restaurant logo when custom branding is available
router.post(
  '/:id/logo',
  requireAuth,
  resolveTenantContext,
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'custom_branding',
    (req) => req.params.id,
    () => 'RESTAURANT'
  ),
  async (req, res, next) => {
    try {
      const { id } = req.params
      const { logoUrl } = req.body

      if (logoUrl == null) {
        throw new ValidationError('logoUrl is required')
      }

      if (req.userData.role === 'RESTAURANT') {
        const restaurantId = await getRestaurantIdForRequest(req)
        if (restaurantId !== id) {
          throw new ForbiddenError('Access denied. You can only update your own logo')
        }
      }

      const restaurant = await updateTenantLogo(id, 'RESTAURANT', logoUrl)

      logger.info('Restaurant logo updated', {
        restaurantId: id,
        logoUrl: restaurant.logo_url,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { restaurant },
        error: null,
        requestId: req.requestId,
      })
    } catch (err) {
      next(err)
    }
  }
)

// Update restaurant
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const updateData = restaurantUpdateSchema.parse(req.body)

    // Check permissions
    const { rows: restaurants } = await query('SELECT * FROM restaurant WHERE id = $1', [id])

    if (restaurants.length === 0) {
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

    const restaurant = restaurants[0]

    if (req.userData.role === 'RESTAURANT' && restaurant.contact_email !== req.userData.email) {
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
        tradeLicenseNo: 'trade_license_no',
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
      UPDATE restaurant 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `,
      updateValues
    )

    logger.info('Restaurant updated', {
      restaurantId: rows[0].id,
      actor: req.userData.id,
    })

    await invalidateTenantProfileCache(id, 'RESTAURANT')

    res.json({
      ok: true,
      data: { restaurant: rows[0] },
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

    logger.error('Update restaurant error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update restaurant',
      },
      requestId: req.requestId,
    })
  }
})

export { router as restaurantsRoutes }
