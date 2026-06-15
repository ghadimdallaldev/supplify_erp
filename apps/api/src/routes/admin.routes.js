import express from 'express'
import { requireAuth, requireRole, getRequestTenant } from '../lib/rbac.js'
import { getEffectiveTenant } from '../lib/impersonation.js'
import { query } from '../lib/db.js'
import { deliveredOrderStatusInSql } from '../lib/order-statuses.js'
import { logger } from '../lib/logger.js'
import { z } from 'zod'

const router = express.Router()

// Validation schemas
const auditListSchema = z.object({
  actor: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('50'),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('0'),
})

// Get audit logs (admin only)
router.get('/audit', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const params = auditListSchema.parse(req.query)

    const whereConditions = []
    const queryParams = []
    let paramIndex = 1

    // Actor filter
    if (params.actor) {
      whereConditions.push(`actor_sub = $${paramIndex}`)
      queryParams.push(params.actor)
      paramIndex++
    }

    // Action filter
    if (params.action) {
      whereConditions.push(`action = $${paramIndex}`)
      queryParams.push(params.action)
      paramIndex++
    }

    // Resource filter
    if (params.resource) {
      whereConditions.push(`resource = $${paramIndex}`)
      queryParams.push(params.resource)
      paramIndex++
    }

    // Date range filter
    if (params.startDate) {
      whereConditions.push(`created_at >= $${paramIndex}`)
      queryParams.push(params.startDate)
      paramIndex++
    }

    if (params.endDate) {
      whereConditions.push(`created_at <= $${paramIndex}`)
      queryParams.push(params.endDate)
      paramIndex++
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const sql = `
      SELECT * FROM admin_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `

    queryParams.push(params.limit, params.offset)

    const { rows } = await query(sql, queryParams)

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM admin_audit_log ${whereClause}`
    const countParams = queryParams.slice(0, -2)
    const { rows: countRows } = await query(countSql, countParams)

    res.json({
      ok: true,
      data: {
        logs: rows,
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

    logger.error('Get audit logs error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get audit logs',
      },
      requestId: req.requestId,
    })
  }
})

// Get dashboard statistics (role-aware; respects impersonation)
router.get(
  '/dashboard',
  requireAuth,
  requireRole(['ADMIN', 'SUPPLIER', 'RESTAURANT']),
  async (req, res) => {
    const userRole = req.userData.role
    try {
      let stats = {}
      const tenant = await getRequestTenant(req)

      if (tenant?.tenantType === 'SUPPLIER') {
        const supplierId = tenant.tenantId
        const [
          { rows: totalProducts },
          { rows: totalOrders },
          { rows: pendingOrders },
          { rows: completedOrders },
          { rows: totalRevenue },
          { rows: totalRestaurants },
        ] = await Promise.all([
          query('SELECT COUNT(*) as count FROM product WHERE supplier_id = $1', [supplierId]),
          query('SELECT COUNT(DISTINCT order_id) as count FROM order_item WHERE supplier_id = $1', [
            supplierId,
          ]),
          query(
            `
          SELECT COUNT(DISTINCT oi.order_id) as count 
          FROM order_item oi 
          JOIN customer_order o ON o.id = oi.order_id 
          WHERE oi.supplier_id = $1 AND o.status IN ('PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')
        `,
            [supplierId]
          ),
          query(
            `
          SELECT COUNT(DISTINCT oi.order_id) as count 
          FROM order_item oi 
          JOIN customer_order o ON o.id = oi.order_id 
          WHERE oi.supplier_id = $1 AND ${deliveredOrderStatusInSql('o.status')}
        `,
            [supplierId]
          ),
          query(
            `
          SELECT COALESCE(SUM(oi.line_total), 0) as total 
          FROM order_item oi 
          JOIN customer_order o ON o.id = oi.order_id 
          WHERE oi.supplier_id = $1 AND ${deliveredOrderStatusInSql('o.status')}
        `,
            [supplierId]
          ),
          query(
            `
          SELECT COUNT(DISTINCT o.restaurant_id) as count
          FROM order_item oi
          JOIN customer_order o ON o.id = oi.order_id
          WHERE oi.supplier_id = $1
        `,
            [supplierId]
          ),
        ])
        stats = {
          totalProducts: parseInt(totalProducts[0].count),
          totalOrders: parseInt(totalOrders[0].count),
          pendingOrders: parseInt(pendingOrders[0].count),
          completedOrders: parseInt(completedOrders[0].count),
          totalRevenue: parseFloat(totalRevenue[0].total),
          totalRestaurants: parseInt(totalRestaurants[0].count),
        }
      } else if (tenant?.tenantType === 'RESTAURANT') {
        const restaurantId = tenant.tenantId
        const [
          { rows: totalProducts },
          { rows: totalOrders },
          { rows: pendingOrders },
          { rows: completedOrders },
          { rows: totalSpent },
        ] = await Promise.all([
          query('SELECT COUNT(*) as count FROM product'),
          query('SELECT COUNT(*) as count FROM customer_order WHERE restaurant_id = $1', [
            restaurantId,
          ]),
          query(
            "SELECT COUNT(*) as count FROM customer_order WHERE restaurant_id = $1 AND status IN ('PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')",
            [restaurantId]
          ),
          query(
            `SELECT COUNT(*) as count FROM customer_order WHERE restaurant_id = $1 AND ${deliveredOrderStatusInSql()}`,
            [restaurantId]
          ),
          query(
            `SELECT COALESCE(SUM(total_amount), 0) as total FROM customer_order WHERE restaurant_id = $1 AND ${deliveredOrderStatusInSql()}`,
            [restaurantId]
          ),
        ])
        stats = {
          totalProducts: parseInt(totalProducts[0].count),
          totalOrders: parseInt(totalOrders[0].count),
          pendingOrders: parseInt(pendingOrders[0].count),
          completedOrders: parseInt(completedOrders[0].count),
          totalSpent: parseFloat(totalSpent[0].total),
          totalRevenue: parseFloat(totalSpent[0].total),
        }
      } else if (userRole === 'ADMIN') {
        // Admin with no impersonation: platform-wide stats
        const [
          { rows: totalSuppliers },
          { rows: totalRestaurants },
          { rows: totalProducts },
          { rows: totalOrders },
          { rows: pendingOrders },
          { rows: completedOrders },
          { rows: totalRevenue },
        ] = await Promise.all([
          query('SELECT COUNT(*) as count FROM supplier'),
          query('SELECT COUNT(*) as count FROM restaurant'),
          query('SELECT COUNT(*) as count FROM product'),
          query('SELECT COUNT(*) as count FROM customer_order'),
          query(
            "SELECT COUNT(*) as count FROM customer_order WHERE status IN ('PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED')"
          ),
          query(
            `SELECT COUNT(*) as count FROM customer_order WHERE ${deliveredOrderStatusInSql()}`
          ),
          query(
            `SELECT COALESCE(SUM(total_amount), 0) as total FROM customer_order WHERE ${deliveredOrderStatusInSql()}`
          ),
        ])
        stats = {
          totalSuppliers: parseInt(totalSuppliers[0].count),
          totalRestaurants: parseInt(totalRestaurants[0].count),
          totalProducts: parseInt(totalProducts[0].count),
          totalOrders: parseInt(totalOrders[0].count),
          pendingOrders: parseInt(pendingOrders[0].count),
          completedOrders: parseInt(completedOrders[0].count),
          totalRevenue: parseFloat(totalRevenue[0].total),
        }
      }

      logger.debug({
        message: 'Dashboard response',
        statsKeys: Object.keys(stats),
        userRole,
        impersonating: !!getEffectiveTenant(req),
      })

      res.json({
        ok: true,
        data: { stats },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error({
        message: 'Get dashboard stats error',
        error: error.message,
        stack: error.stack,
        userRole,
      })
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get dashboard statistics',
          details: error.message,
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as adminRoutes }
