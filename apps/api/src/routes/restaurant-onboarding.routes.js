import express from 'express'
import {
  requireAuth,
  requireRole,
  getRequestTenant,
  getRestaurantIdForRequest,
} from '../lib/rbac.js'
import { query, withTransaction } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js'
import { checkLimit } from '../lib/subscription.js'
import { z } from 'zod'

const router = express.Router()

// Validation schemas
const updateProfileSchema = z.object({
  businessType: z.string().optional(),
  registrationNumber: z.string().optional(),
  taxId: z.string().optional(),
  vatNumber: z.string().optional(),
  operatingHours: z.record(z.any()).optional(),
  deliveryInstructions: z.string().optional(),
})

const addTeamMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(['owner', 'manager', 'purchasing', 'finance', 'kitchen']),
  isPrimary: z.boolean().optional(),
})

// Get restaurant profile
router.get('/profile', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const { rows } = await query(
      `
      SELECT 
        r.*,
        COUNT(DISTINCT b.id) as branch_count
      FROM restaurant r
      LEFT JOIN branch b ON b.restaurant_id = r.id
      WHERE r.contact_email = $1
      GROUP BY r.id
    `,
      [req.userData.email]
    )

    if (rows.length === 0) {
      throw new NotFoundError('Restaurant not found')
    }

    res.json({
      ok: true,
      data: { profile: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get profile error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get profile',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Update restaurant profile
router.patch('/profile', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const data = updateProfileSchema.parse(req.body)

    const updateFields = []
    const updateValues = []
    let paramIndex = 1

    const fieldMapping = {
      businessType: 'business_type',
      registrationNumber: 'registration_number',
      taxId: 'tax_id',
      vatNumber: 'vat_number',
      operatingHours: 'operating_hours',
      deliveryInstructions: 'delivery_instructions',
    }

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const dbField = fieldMapping[key]
        if (dbField) {
          updateFields.push(`${dbField} = $${paramIndex}`)
          updateValues.push(value)
          paramIndex++
        }
      }
    }

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
    updateValues.push(req.userData.email)

    const { rows } = await query(
      `
      UPDATE restaurant 
      SET ${updateFields.join(', ')}
      WHERE contact_email = $${paramIndex}
      RETURNING *
    `,
      updateValues
    )

    logger.info('Profile updated', {
      email: req.userData.email,
      fields: Object.keys(data),
    })

    res.json({
      ok: true,
      data: { profile: rows[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Update profile error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to update profile',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Get team members
router.get('/team', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new NotFoundError('Restaurant not found')
    }

    const { rows } = await query(
      `
      SELECT 
        rt.*,
        b.name as branch_name
      FROM restaurant_team rt
      LEFT JOIN branch b ON b.id = rt.branch_id
      WHERE rt.restaurant_id = $1
      ORDER BY rt.is_primary DESC, rt.created_at
    `,
      [restaurantId]
    )

    res.json({
      ok: true,
      data: { team: rows },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Get team error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get team',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Add team member
router.post('/team', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const data = addTeamMemberSchema.parse(req.body)

    const requestTenant = await getRequestTenant(req)
    let restaurantId
    if (requestTenant?.tenantType === 'RESTAURANT') {
      restaurantId = requestTenant.tenantId
    } else {
      const { rows: restaurants } = await query(
        'SELECT id FROM restaurant WHERE contact_email = $1',
        [req.userData.email]
      )
      if (restaurants.length === 0) throw new NotFoundError('Restaurant not found')
      restaurantId = restaurants[0].id
    }

    // Enforce plan user limit (1 primary + team members)
    const userLimit = await checkLimit(restaurantId, 'RESTAURANT', 'users')
    if (!userLimit.isUnlimited && userLimit.limit != null && userLimit.current >= userLimit.limit) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'USER_LIMIT_REACHED',
          message: `You have reached your plan limit of ${userLimit.limit} user(s). Upgrade your plan to add more team members.`,
          limit: userLimit.limit,
          current: userLimit.current,
        },
        requestId: req.requestId,
      })
    }

    const { rows } = await query(
      `
      INSERT INTO restaurant_team (restaurant_id, name, email, phone, role, is_primary)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [restaurantId, data.name, data.email, data.phone || null, data.role, data.isPrimary || false]
    )

    logger.info('Team member added', {
      restaurantId,
      email: data.email,
    })

    res.status(201).json({
      ok: true,
      data: { member: rows[0] },
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
          message: 'Invalid team member data',
          details: error.errors,
        },
        requestId: req.requestId,
      })
    }

    logger.error({
      message: 'Add team member error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to add team member',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

// Remove team member
router.delete('/team/:id', requireAuth, requireRole(['RESTAURANT', 'ADMIN']), async (req, res) => {
  try {
    const restaurantId = await getRestaurantIdForRequest(req)
    if (!restaurantId) {
      throw new NotFoundError('Restaurant not found')
    }

    const { rowCount } = await query(
      `DELETE FROM restaurant_team WHERE id = $1 AND restaurant_id = $2`,
      [req.params.id, restaurantId]
    )

    if (rowCount === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Team member not found' },
        requestId: req.requestId,
      })
    }

    res.json({
      ok: true,
      data: { deleted: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error({
      message: 'Delete team member error',
      error: error.message,
      stack: error.stack,
    })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to delete team member',
        details: error.message,
      },
      requestId: req.requestId,
    })
  }
})

export { router as restaurantOnboardingRoutes }
