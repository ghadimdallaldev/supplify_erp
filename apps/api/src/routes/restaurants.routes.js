import express from 'express'
import { requireAuth, requireRole } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError } from '../middlewares/errorHandler.js'
import { createPendingActivationSubscription } from '../lib/billing/subscription-activation.js'
import { z } from 'zod'

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

// List restaurants (admin sees all, suppliers see only their customer restaurants)
router.get('/', requireAuth, async (req, res) => {
  try {
    const params = restaurantListSchema.parse(req.query)

    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    // Role-based filtering
    if (req.userData.role === 'SUPPLIER') {
      // Suppliers see only restaurants that have ordered from them
      const { rows: suppliers } = await query('SELECT id FROM supplier WHERE contact_email = $1', [
        req.userData.email,
      ])

      if (suppliers.length === 0) {
        // Return empty list if supplier record not found
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
        )
      `)
      queryParams.push(suppliers[0].id)
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
        (SELECT COALESCE(SUM(total_amount), 0) FROM customer_order WHERE restaurant_id = r.id AND status = 'COMPLETED') as total_spent,
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
    const { rows: restaurants } = await query('SELECT * FROM restaurant WHERE contact_email = $1', [
      req.userData.email,
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

    // Check access permissions
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

// Upload restaurant logo (Gold+ custom branding)
router.post(
  '/:id/logo',
  requireAuth,
  requireRole(['RESTAURANT', 'ADMIN']),
  requireFeature(
    'custom_branding',
    (req) => req.params.id,
    () => 'RESTAURANT'
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

      // Restaurants can only update their own logo
      if (req.userData.role === 'RESTAURANT' && restaurant.contact_email !== req.userData.email) {
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
      UPDATE restaurant 
      SET logo_url = $1, updated_at = now()
      WHERE id = $2
      RETURNING *
    `,
        [logoUrl, id]
      )

      logger.info('Restaurant logo updated', {
        restaurantId: id,
        logoUrl,
        actor: req.userData.id,
      })

      res.json({
        ok: true,
        data: { restaurant: rows[0] },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Update restaurant logo error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to update restaurant logo',
        },
        requestId: req.requestId,
      })
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

    // Build update query
    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField =
          key === 'tradeLicenseNo'
            ? 'trade_license_no'
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
