import express from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, resolveTenantContext, requirePermission } from '../lib/rbac.js'
import { requireFeature } from '../lib/subscription.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import {
  getBudgetPeriodUsage,
  approveOrderRequest,
  rejectOrderRequest,
  resolveApproverUserId,
} from '../services/approvals.service.js'

const router = express.Router()

const featureGate = requireFeature(
  'approvals_budgets',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType
)

router.use(requireAuth, resolveTenantContext, requireRole(['RESTAURANT', 'ADMIN']), featureGate)

async function getRestaurantId(req) {
  if (req.tenantContext?.tenantType === 'RESTAURANT' && req.tenantContext?.tenantId) {
    return req.tenantContext.tenantId
  }
  const { rows } = await query('SELECT id FROM restaurant WHERE contact_email = $1', [
    req.userData.email,
  ])
  if (!rows.length) throw new ValidationError('Restaurant not found')
  return rows[0].id
}

const budgetCreateSchema = z.object({
  name: z.string().min(1).max(255),
  periodType: z.enum(['monthly', 'quarterly', 'annual', 'custom']),
  startDate: z.string(),
  endDate: z.string(),
  totalBudget: z.number().positive(),
  currency: z.string().max(10).optional(),
  branchId: z.string().uuid().optional().nullable(),
  allocations: z
    .array(
      z.object({
        category: z.string().min(1),
        allocatedAmount: z.number().nonnegative(),
      })
    )
    .optional(),
})

const budgetUpdateSchema = budgetCreateSchema.partial()

const ruleSchema = z.object({
  name: z.string().min(1).max(255),
  thresholdAmount: z.number().nonnegative().optional().nullable(),
  requiresRole: z.string().max(100).optional().nullable(),
  approverUserId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
})

// --- Budget periods ---

router.get('/budgets', requirePermission('ORDERS_VIEW'), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantId(req)
    const { branchId, year } = req.query
    const params = [restaurantId]
    let sql = `
      SELECT bp.*,
        (SELECT COALESCE(json_agg(json_build_object(
          'id', ba.id, 'category', ba.category, 'allocatedAmount', ba.allocated_amount
        )), '[]'::json)
        FROM budget_allocations ba WHERE ba.budget_period_id = bp.id) AS allocations
      FROM budget_periods bp
      WHERE bp.restaurant_id = $1 AND bp.is_active = TRUE
    `
    if (branchId) {
      params.push(branchId)
      sql += ` AND bp.branch_id = $${params.length}`
    }
    if (year) {
      params.push(Number(year))
      sql += ` AND EXTRACT(YEAR FROM bp.start_date) = $${params.length}`
    }
    sql += ' ORDER BY bp.start_date DESC'

    const { rows } = await query(sql, params)
    res.json({ ok: true, data: { periods: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/budgets', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const body = budgetCreateSchema.parse(req.body)
    const restaurantId = await getRestaurantId(req)

    const {
      rows: [period],
    } = await query(
      `
        INSERT INTO budget_periods (
          restaurant_id, branch_id, name, period_type, start_date, end_date,
          total_budget, currency, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
      [
        restaurantId,
        body.branchId || null,
        body.name,
        body.periodType,
        body.startDate,
        body.endDate,
        body.totalBudget,
        body.currency || 'USD',
        req.userData.id,
      ]
    )

    if (body.allocations?.length) {
      for (const a of body.allocations) {
        await query(
          `INSERT INTO budget_allocations (budget_period_id, category, allocated_amount) VALUES ($1, $2, $3)`,
          [period.id, a.category, a.allocatedAmount]
        )
      }
    }

    res.status(201).json({ ok: true, data: { period }, error: null, requestId: req.requestId })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid budget data', details: err.errors },
        requestId: req.requestId,
      })
    }
    next(err)
  }
})

router.patch('/budgets/:id', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const body = budgetUpdateSchema.parse(req.body)
    const restaurantId = await getRestaurantId(req)
    const { id } = req.params

    const { rows: existing } = await query(
      `SELECT id FROM budget_periods WHERE id = $1 AND restaurant_id = $2 AND is_active = TRUE`,
      [id, restaurantId]
    )
    if (!existing.length) throw new NotFoundError('Budget period not found')

    const fields = []
    const values = []
    let idx = 1
    const map = {
      name: 'name',
      periodType: 'period_type',
      startDate: 'start_date',
      endDate: 'end_date',
      totalBudget: 'total_budget',
      currency: 'currency',
      branchId: 'branch_id',
    }
    for (const [key, col] of Object.entries(map)) {
      if (body[key] !== undefined) {
        fields.push(`${col} = $${idx++}`)
        values.push(body[key])
      }
    }
    if (fields.length) {
      fields.push('updated_at = NOW()')
      values.push(id, restaurantId)
      await query(
        `UPDATE budget_periods SET ${fields.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx}`,
        values
      )
    }

    if (body.allocations) {
      await query(`DELETE FROM budget_allocations WHERE budget_period_id = $1`, [id])
      for (const a of body.allocations) {
        await query(
          `INSERT INTO budget_allocations (budget_period_id, category, allocated_amount) VALUES ($1, $2, $3)`,
          [id, a.category, a.allocatedAmount]
        )
      }
    }

    const { rows } = await query(`SELECT * FROM budget_periods WHERE id = $1`, [id])
    res.json({ ok: true, data: { period: rows[0] }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.delete('/budgets/:id', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantId(req)
    const { rowCount } = await query(
      `UPDATE budget_periods SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND restaurant_id = $2`,
      [req.params.id, restaurantId]
    )
    if (!rowCount) throw new NotFoundError('Budget period not found')
    res.json({ ok: true, data: { deleted: true }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.get('/budgets/:id/usage', requirePermission('ORDERS_VIEW'), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantId(req)
    const usage = await getBudgetPeriodUsage(req.params.id, restaurantId)
    res.json({ ok: true, data: usage, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

// --- Approval rules ---

router.get('/rules', requirePermission('ORDERS_VIEW'), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantId(req)
    const { rows } = await query(
      `
      SELECT ar.*,
        u.display_name AS approver_name,
        u.email AS approver_email
      FROM approval_rules ar
      LEFT JOIN app_user u ON u.id = ar.approver_user_id
      WHERE ar.restaurant_id = $1
      ORDER BY ar.threshold_amount DESC NULLS LAST, ar.created_at DESC
      `,
      [restaurantId]
    )
    res.json({ ok: true, data: { rules: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/rules', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const body = ruleSchema.parse(req.body)
    const restaurantId = await getRestaurantId(req)

    if (!body.approverUserId && !body.requiresRole) {
      throw new ValidationError('Either approverUserId or requiresRole is required')
    }

    const {
      rows: [rule],
    } = await query(
      `
      INSERT INTO approval_rules (
        restaurant_id, name, threshold_amount, requires_role, approver_user_id
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        restaurantId,
        body.name,
        body.thresholdAmount ?? null,
        body.requiresRole ?? null,
        body.approverUserId ?? null,
      ]
    )
    res.status(201).json({ ok: true, data: { rule }, error: null, requestId: req.requestId })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid rule data', details: err.errors },
        requestId: req.requestId,
      })
    }
    next(err)
  }
})

router.patch('/rules/:id', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const body = ruleSchema.partial().parse(req.body)
    const restaurantId = await getRestaurantId(req)

    const { rows: existing } = await query(
      `SELECT id FROM approval_rules WHERE id = $1 AND restaurant_id = $2`,
      [req.params.id, restaurantId]
    )
    if (!existing.length) throw new NotFoundError('Approval rule not found')

    const {
      rows: [rule],
    } = await query(
      `
      UPDATE approval_rules SET
        name = COALESCE($3, name),
        threshold_amount = COALESCE($4, threshold_amount),
        requires_role = COALESCE($5, requires_role),
        approver_user_id = COALESCE($6, approver_user_id),
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
      WHERE id = $1 AND restaurant_id = $2
      RETURNING *
      `,
      [
        req.params.id,
        restaurantId,
        body.name,
        body.thresholdAmount,
        body.requiresRole,
        body.approverUserId,
        body.isActive,
      ]
    )
    res.json({ ok: true, data: { rule }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.delete('/rules/:id', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const restaurantId = await getRestaurantId(req)
    const { rowCount } = await query(
      `UPDATE approval_rules SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND restaurant_id = $2`,
      [req.params.id, restaurantId]
    )
    if (!rowCount) throw new NotFoundError('Approval rule not found')
    res.json({ ok: true, data: { deactivated: true }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

// --- Order approvals ---

router.get('/pending', requirePermission('ORDERS_VIEW'), async (req, res, next) => {
  try {
    const userId = req.userData.id
    const { rows } = await query(
      `
      SELECT oa.*,
        co.total_amount,
        co.currency,
        co.status AS order_status,
        co.placed_at,
        co.created_at AS order_created_at,
        ru.display_name AS requester_name,
        ru.email AS requester_email,
        r.name AS restaurant_name,
        (SELECT s.name FROM order_item oi JOIN supplier s ON s.id = oi.supplier_id WHERE oi.order_id = co.id LIMIT 1) AS supplier_name
      FROM order_approvals oa
      JOIN customer_order co ON co.id = oa.order_id
      JOIN app_user ru ON ru.id = oa.requested_by
      JOIN restaurant r ON r.id = co.restaurant_id
      WHERE oa.status = 'pending'
        AND oa.approver_id = $1
      ORDER BY oa.requested_at ASC
      `,
      [userId]
    )
    res.json({ ok: true, data: { approvals: rows }, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/orders/:orderId/request',
  requirePermission('ORDERS_CREATE'),
  async (req, res, next) => {
    try {
      const restaurantId = await getRestaurantId(req)
      const { orderId } = req.params

      const { rows: orders } = await query(
        `SELECT * FROM customer_order WHERE id = $1 AND restaurant_id = $2`,
        [orderId, restaurantId]
      )
      if (!orders.length) throw new NotFoundError('Order not found')

      const { rows: active } = await query(
        `SELECT id FROM order_approvals WHERE order_id = $1 AND status = 'pending'`,
        [orderId]
      )
      if (active.length)
        throw new ValidationError('A pending approval already exists for this order')

      const { rows: rules } = await query(
        `SELECT * FROM approval_rules WHERE restaurant_id = $1 AND is_active = TRUE`,
        [restaurantId]
      )
      const { findMatchingApprovalRule } = await import('../services/approvals.service.js')
      const rule = findMatchingApprovalRule(rules, orders[0].total_amount)
      if (!rule) throw new ValidationError('No approval rule matches this order amount')

      const approverId = await resolveApproverUserId(rule, restaurantId)
      if (!approverId) throw new ValidationError('Could not resolve approver for this rule')
      if (approverId === req.userData.id) {
        throw new ValidationError('You cannot request approval on your own order')
      }

      const {
        rows: [approval],
      } = await query(
        `
      INSERT INTO order_approvals (order_id, rule_id, requested_by, approver_id, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
      `,
        [orderId, rule.id, req.userData.id, approverId]
      )

      await query(
        `UPDATE customer_order SET status = 'PENDING_APPROVAL', updated_at = NOW() WHERE id = $1`,
        [orderId]
      )

      const { notifyApproverOfPendingOrder } = await import('../services/approvals.service.js')
      await notifyApproverOfPendingOrder({
        approverId,
        orderId,
        orderTotal: orders[0].total_amount,
      })

      res.status(201).json({ ok: true, data: { approval }, error: null, requestId: req.requestId })
    } catch (err) {
      next(err)
    }
  }
)

router.post('/requests/:id/approve', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const result = await approveOrderRequest(req.params.id, req.userData.id, req.body?.notes)
    res.json({ ok: true, data: result, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

router.post('/requests/:id/reject', requirePermission('ORDERS_MANAGE'), async (req, res, next) => {
  try {
    const result = await rejectOrderRequest(req.params.id, req.userData.id, req.body?.notes)
    res.json({ ok: true, data: result, error: null, requestId: req.requestId })
  } catch (err) {
    next(err)
  }
})

export { router as approvalsRoutes }
