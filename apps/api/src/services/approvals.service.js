import { query, withTransaction } from '../lib/db.js'
import { ValidationError, NotFoundError } from '../middlewares/errorHandler.js'
import { sendNotification, notifyOrderStatusChange } from './notification.service.js'
import { restoreSupplierStockForOrder } from './supplier-inventory.service.js'

/**
 * Find the highest-threshold active rule that applies to an order total.
 */
export function findMatchingApprovalRule(rules, orderTotal) {
  const total = Number(orderTotal) || 0
  const matches = (rules || []).filter((rule) => {
    if (!rule.is_active) return false
    const threshold = rule.threshold_amount == null ? null : Number(rule.threshold_amount)
    if (threshold == null) return false
    return total > threshold
  })
  if (!matches.length) return null
  return matches.sort((a, b) => Number(b.threshold_amount) - Number(a.threshold_amount))[0]
}

/**
 * Resolve approver user id from rule (explicit user or first user with role).
 */
export async function resolveApproverUserId(rule, restaurantId) {
  if (rule.approver_user_id) return rule.approver_user_id
  if (!rule.requires_role) return null

  const { rows } = await query(
    `
    SELECT ur.user_id
    FROM user_role ur
    JOIN role r ON r.id = ur.role_id
    WHERE ur.tenant_id = $1
      AND ur.tenant_type = 'RESTAURANT'
      AND r.code = $2
    ORDER BY ur.created_at ASC
    LIMIT 1
    `,
    [restaurantId, rule.requires_role]
  )
  return rows[0]?.user_id || null
}

/**
 * Budget usage: spent per category vs allocations for a period.
 */
export async function getBudgetPeriodUsage(budgetPeriodId, restaurantId) {
  const { rows: periods } = await query(
    `
    SELECT id, restaurant_id, branch_id, start_date, end_date, total_budget, currency, name
    FROM budget_periods
    WHERE id = $1 AND restaurant_id = $2 AND is_active = TRUE
    `,
    [budgetPeriodId, restaurantId]
  )
  if (!periods.length) {
    throw new NotFoundError('Budget period not found')
  }
  const period = periods[0]

  const { rows: allocations } = await query(
    `SELECT id, category, allocated_amount FROM budget_allocations WHERE budget_period_id = $1 ORDER BY category`,
    [budgetPeriodId]
  )

  const branchFilter = period.branch_id ? 'AND co.branch_id = $4' : ''
  const params = [restaurantId, period.start_date, period.end_date]
  if (period.branch_id) params.push(period.branch_id)

  const { rows: spentRows } = await query(
    `
    SELECT
      COALESCE(pc.name, p.category, 'Uncategorized') AS category,
      COALESCE(SUM(oi.line_total), 0)::numeric AS spent
    FROM customer_order co
    JOIN order_item oi ON oi.order_id = co.id
    JOIN product p ON p.id = oi.product_id
    LEFT JOIN product_category pc ON pc.id = p.category_id
    WHERE co.restaurant_id = $1
      AND co.placed_at IS NOT NULL
      AND co.placed_at::date >= $2
      AND co.placed_at::date <= $3
      AND co.status NOT IN ('DRAFT', 'CANCELLED', 'PENDING_APPROVAL')
      ${branchFilter}
    GROUP BY COALESCE(pc.name, p.category, 'Uncategorized')
    `,
    params
  )

  const spentByCategory = new Map(spentRows.map((r) => [r.category, Number(r.spent)]))

  const categories = allocations.map((a) => {
    const allocated = Number(a.allocated_amount)
    const spent = spentByCategory.get(a.category) || 0
    const remaining = allocated - spent
    const percentUsed = allocated > 0 ? (spent / allocated) * 100 : 0
    return {
      category: a.category,
      allocated,
      spent,
      remaining,
      percentUsed: Math.round(percentUsed * 100) / 100,
      lowRemaining: allocated > 0 && remaining / allocated < 0.2,
    }
  })

  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0)
  const totalAllocated = Number(period.total_budget)
  const totalRemaining = totalAllocated - totalSpent

  return {
    period,
    categories,
    summary: {
      totalAllocated,
      totalSpent,
      totalRemaining,
      percentUsed: totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 10000) / 100 : 0,
      lowRemaining: totalAllocated > 0 && totalRemaining / totalAllocated < 0.2,
    },
  }
}

/**
 * After order creation: apply approval rule if needed.
 */
export async function applyOrderApprovalGate({ client, order, restaurantId, requestedByUserId }) {
  const { rows: rules } = await client.query(
    `
    SELECT * FROM approval_rules
    WHERE restaurant_id = $1 AND is_active = TRUE
    ORDER BY threshold_amount DESC NULLS LAST
    `,
    [restaurantId]
  )

  const rule = findMatchingApprovalRule(rules, order.total_amount)
  if (!rule) return null

  const approverId = await resolveApproverUserId(rule, restaurantId)
  if (!approverId) {
    return null
  }

  if (approverId === requestedByUserId) {
    return null
  }

  await client.query(
    `UPDATE customer_order SET status = 'PENDING_APPROVAL', updated_at = NOW() WHERE id = $1`,
    [order.id]
  )

  const {
    rows: [approval],
  } = await client.query(
    `
    INSERT INTO order_approvals (order_id, rule_id, requested_by, approver_id, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING *
    `,
    [order.id, rule.id, requestedByUserId, approverId]
  )

  return { approval, rule, approverId, status: 'PENDING_APPROVAL' }
}

export async function notifyApproverOfPendingOrder({
  approverId,
  orderId,
  orderTotal,
  restaurantName,
}) {
  try {
    await sendNotification({
      userId: approverId,
      userType: 'RESTAURANT',
      notificationType: 'order_approval',
      notificationCategory: 'orders',
      title: 'Order awaiting your approval',
      message: `Order requires approval (${Number(orderTotal).toFixed(2)}). Review and approve or reject.`,
      referenceId: orderId,
      referenceType: 'order',
      metadata: { restaurantName, action: 'approve_order' },
    })
  } catch {
    // fire-and-forget
  }
}

/**
 * Approve pending order: set PLACED, notify supplier, increment usage.
 */
export async function approveOrderRequest(approvalId, approverUserId, notes = null) {
  const { rows: approvals } = await query(
    `
    SELECT oa.*, co.restaurant_id, co.total_amount, co.status AS order_status
    FROM order_approvals oa
    JOIN customer_order co ON co.id = oa.order_id
    WHERE oa.id = $1
    `,
    [approvalId]
  )
  if (!approvals.length) throw new NotFoundError('Approval request not found')
  const approval = approvals[0]

  if (approval.status !== 'pending') {
    throw new ValidationError('Approval request is not pending')
  }
  if (approval.approver_id !== approverUserId) {
    throw new ValidationError('You are not the assigned approver for this request')
  }
  if (approval.requested_by === approverUserId) {
    throw new ValidationError('You cannot approve your own order request')
  }

  await query(
    `
    UPDATE order_approvals
    SET status = 'approved', notes = COALESCE($2, notes), decided_at = NOW()
    WHERE id = $1
    `,
    [approvalId, notes]
  )

  await query(
    `
    UPDATE customer_order
    SET status = 'PLACED', placed_at = COALESCE(placed_at, NOW()), updated_at = NOW()
    WHERE id = $1
    `,
    [approval.order_id]
  )

  const { rows: items } = await query(
    `SELECT supplier_id FROM order_item WHERE order_id = $1 LIMIT 1`,
    [approval.order_id]
  )
  const supplierId = items[0]?.supplier_id

  if (supplierId) {
    await notifyOrderStatusChange(
      {
        id: approval.order_id,
        total_amount: approval.total_amount,
        restaurant_id: approval.restaurant_id,
        supplier_id: supplierId,
      },
      'PLACED'
    )
  }

  return { orderId: approval.order_id, status: 'PLACED' }
}

/**
 * Reject: mark approval rejected, cancel order, restore inventory.
 */
export async function rejectOrderRequest(approvalId, approverUserId, notes) {
  if (!notes || String(notes).trim().length < 1) {
    throw new ValidationError('Rejection notes are required')
  }

  const { rows: approvals } = await query(`SELECT * FROM order_approvals WHERE id = $1`, [
    approvalId,
  ])
  if (!approvals.length) throw new NotFoundError('Approval request not found')
  const approval = approvals[0]

  if (approval.status !== 'pending') {
    throw new ValidationError('Approval request is not pending')
  }
  if (approval.approver_id !== approverUserId) {
    throw new ValidationError('You are not the assigned approver for this request')
  }
  if (approval.requested_by === approverUserId) {
    throw new ValidationError('You cannot reject your own order request')
  }

  await query(
    `
    UPDATE order_approvals
    SET status = 'rejected', notes = $2, decided_at = NOW()
    WHERE id = $1
    `,
    [approvalId, notes]
  )

  await withTransaction(async (client) => {
    await restoreSupplierStockForOrder(client, approval.order_id)
    await client.query(
      `UPDATE customer_order SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [approval.order_id]
    )
  })

  return { orderId: approval.order_id, status: 'CANCELLED' }
}

export async function getOrderApprovalStatus(orderId) {
  const { rows } = await query(
    `
    SELECT oa.*,
      ru.email AS requester_email,
      ru.display_name AS requester_name,
      au.email AS approver_email,
      au.display_name AS approver_name,
      ar.name AS rule_name
    FROM order_approvals oa
    LEFT JOIN app_user ru ON ru.id = oa.requested_by
    LEFT JOIN app_user au ON au.id = oa.approver_id
    LEFT JOIN approval_rules ar ON ar.id = oa.rule_id
    WHERE oa.order_id = $1
    ORDER BY oa.requested_at DESC
    LIMIT 1
    `,
    [orderId]
  )
  return rows[0] || null
}
