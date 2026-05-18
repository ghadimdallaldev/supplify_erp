import express from 'express'
import { requireAuth, requireRole, optionalAuth } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { createPendingActivationSubscription } from '../lib/billing/subscription-activation.js'
import { z } from 'zod'

const router = express.Router()

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

    logger.info('Supplier list request', {
      hasUserData: !!req.userData,
      role: req.userData?.role,
      email: req.userData?.email,
      query: req.query,
    })

    if (req.userData?.role === 'RESTAURANT') {
      try {
        // Get restaurant ID from database using email
        const { rows: restaurants } = await query(
          'SELECT id FROM restaurant WHERE contact_email = $1',
          [req.userData.email]
        )

        logger.info('Restaurant lookup result', {
          found: restaurants.length,
          restaurantId: restaurants[0]?.id,
        })

        if (restaurants.length > 0) {
          restaurantId = restaurants[0].id

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
        logger.warn('Failed to get restaurant ID for supplier filtering', {
          error: error.message,
          email: req.userData?.email,
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

    logger.info('Supplier query built', {
      whereClause,
      sql: sql.substring(0, 200) + '...',
      queryParams: queryParams.slice(0, -2), // Hide limit/offset
    })

    const { rows } = await query(sql, queryParams)
    logger.debug('Supplier list result', { count: rows.length })

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

    res.json({
      ok: true,
      data: {
        suppliers: rows,
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

    logger.error({
      message: 'List suppliers error',
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

// Get current supplier (for settings page) - MUST be before /:id route
router.get('/me', requireAuth, requireRole(['SUPPLIER']), async (req, res) => {
  try {
    const { rows: suppliers } = await query('SELECT * FROM supplier WHERE contact_email = $1', [
      req.userData.email,
    ])

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
})

// Get supplier statistics for restaurant
router.get('/:id/statistics', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id: supplierId } = req.params

    // Get restaurant ID
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    )

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

    const restaurantId = restaurants[0].id

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
})

// Get supplier by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    // Get restaurant ID for follow status if user is a restaurant
    let restaurantId = null
    if (req.userData && req.userData.role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      )
      if (restaurants.length > 0) {
        restaurantId = restaurants[0].id
      }
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
      data: { supplier },
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
})

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
router.patch('/:id', requireAuth, async (req, res) => {
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

    // Build update query
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField =
          key === 'vatNo'
            ? 'vat_no'
            : key === 'contactEmail'
              ? 'contact_email'
              : key === 'address'
                ? 'address_json'
                : key

        updateFields.push(`${dbField} = $${paramIndex}`)
        updateValues.push(dbField === 'address_json' ? JSON.stringify(value) : value)
        paramIndex++
      }
    })

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
})

// Get followed suppliers (restaurant only)
router.get('/followed', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    // Get restaurant ID from email
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    )

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found')
    }

    const restaurantId = restaurants[0].id

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
})

// Follow/Unfollow supplier (restaurant only)
router.post('/:id/follow', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params
    // Get restaurant ID from email
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    )

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found')
    }

    const restaurantId = restaurants[0].id

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
            requiredPlan: limitCheck.limit === 2 ? 'Bronze' : 'Gold',
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
})

router.delete('/:id/follow', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params

    // Get restaurant ID from email
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    )

    if (restaurants.length === 0) {
      throw new ValidationError('Restaurant not found')
    }

    const restaurantId = restaurants[0].id

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
})

// Block/Unblock supplier (restaurant only)
router.post('/:id/block', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params
    const restaurantId = req.userData.id
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
})

router.delete('/:id/block', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    const { id } = req.params
    const restaurantId = req.userData.id

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
})

export { router as suppliersRoutes }
