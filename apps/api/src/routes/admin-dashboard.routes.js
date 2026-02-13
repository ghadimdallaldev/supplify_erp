import { Router } from 'express'
import { query, pool } from '../lib/db.js'
import { requireAuth, requireRole, resolveAdminContext, requirePermission } from '../lib/rbac.js'
import { z } from 'zod'
import { logger } from '../lib/logger.js'
import { ZodError } from 'zod'
import { config } from '../config/env.js'
import {
  createImpersonationToken,
  verifyImpersonationToken,
  getImpersonationCookieName,
  getEffectiveTenant,
} from '../lib/impersonation.js'
import { getEntitlements, RESTAURANT_LIMIT_KEYS, SUPPLIER_LIMIT_KEYS } from '../lib/subscription.js'
import { writeAuditLog } from '../lib/audit.js'
import { recordConversionEvent } from '../lib/conversion-events.js'

/** Allowed feature keys per tenant type (from plan features JSONB in use) */
const RESTAURANT_FEATURE_KEYS = [
  'chat',
  'reports',
  'smart_reorder',
  'multi_branch',
  'receiving_quality',
  'finance_invoices',
  'quick_lists',
  'inventory_management',
  'waste_tracking',
  'approvals_budgets',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
]
const SUPPLIER_FEATURE_KEYS = [
  'chat',
  'reports',
  'fulfillment_tools',
  'quick_lists',
  'inventory_management',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
]

function getAllowedLimitKeys(tenantType) {
  return tenantType === 'RESTAURANT' ? [...RESTAURANT_LIMIT_KEYS] : [...SUPPLIER_LIMIT_KEYS]
}
function getAllowedFeatureKeys(tenantType) {
  return tenantType === 'RESTAURANT' ? [...RESTAURANT_FEATURE_KEYS] : [...SUPPLIER_FEATURE_KEYS]
}

function validatePlanLimitsAndFeatures(limits, features, tenantType) {
  const limitKeys = getAllowedLimitKeys(tenantType)
  const featureKeys = getAllowedFeatureKeys(tenantType)
  const unknownLimits = Object.keys(limits || {}).filter((k) => !limitKeys.includes(k))
  const unknownFeatures = Object.keys(features || {}).filter((k) => !featureKeys.includes(k))
  if (unknownLimits.length > 0 || unknownFeatures.length > 0) {
    return {
      valid: false,
      message: `Unknown keys not allowed: limits: ${unknownLimits.join(', ') || 'none'}; features: ${unknownFeatures.join(', ') || 'none'}`,
    }
  }
  for (const [k, v] of Object.entries(limits || {})) {
    if (v !== null && v !== -1 && (typeof v !== 'number' || v < 0 || !Number.isInteger(v))) {
      return {
        valid: false,
        message: `Limit ${k} must be a non-negative integer or null (-1 for unlimited)`,
      }
    }
  }
  return { valid: true }
}

const router = Router()

router.use(
  requireAuth,
  requireRole(['ADMIN']),
  resolveAdminContext,
  requirePermission('ADMIN_ACCESS')
)

// ========================================
// AUDIT LOGGING HELPERS
// ========================================
async function logAudit(
  req,
  actionType,
  actionDescription,
  targetEntityType,
  targetEntityId,
  oldValue,
  newValue,
  metadata = {}
) {
  try {
    await query(
      `
      INSERT INTO admin_audit_log (
        admin_user_id, admin_name, action_type, action_description,
        target_entity_type, target_entity_id, old_value, new_value, metadata,
        ip_address, user_agent, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
      [
        req.userData.id,
        req.userData.display_name || req.userData.email,
        actionType,
        actionDescription,
        targetEntityType,
        targetEntityId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        JSON.stringify(metadata),
        req.ip,
        req.get('user-agent'),
        req.requestId || null,
      ]
    )
    const tenantId = metadata.target_tenant_id || newValue?.tenant_id || oldValue?.tenant_id
    const tenantType = metadata.target_tenant_type || newValue?.tenant_type || oldValue?.tenant_type
    await writeAuditLog(req, {
      action_type: actionType,
      actor_admin_role: 'ADMIN',
      tenant_type: tenantType || undefined,
      tenant_id: tenantId || targetEntityId,
      target_id: targetEntityId,
      payload_json: {
        description: actionDescription,
        old_value: oldValue,
        new_value: newValue,
        ...metadata,
      },
    })
  } catch (error) {
    logger.error('Failed to log audit event:', error)
    // Don't throw - audit logging should not fail requests
  }
}

// ========================================
// OVERVIEW / DASHBOARD
// ========================================
router.get('/overview', async (req, res) => {
  try {
    // Get platform stats
    const [
      { rows: tenantCounts },
      { rows: subscriptionStats },
      { rows: revenueStats },
      { rows: recentOrders },
      { rows: recentChats },
      { rows: alerts },
    ] = await Promise.all([
      query(`
        SELECT tenant_type, COUNT(*) as count
        FROM subscription
        WHERE status IN ('ACTIVE', 'TRIALING')
        GROUP BY tenant_type
      `),
      query(`
        SELECT status, COUNT(*) as count
        FROM subscription
        GROUP BY status
      `),
      query(`
        SELECT 
          COALESCE(SUM(CASE WHEN s.billing_cycle = 'MONTHLY' THEN sp.price_per_month ELSE sp.price_per_month * 12 END), 0) as mrr,
          COUNT(*) as active_subscriptions
        FROM subscription s
        JOIN subscription_plan sp ON sp.id = s.plan_id
        WHERE s.status = 'ACTIVE'
      `),
      query(`
        SELECT COUNT(*) as count
        FROM customer_order
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*) as count
        FROM message
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*) as count
        FROM subscription
        WHERE status = 'PAST_DUE'
      `),
    ])

    res.json({
      ok: true,
      data: {
        tenantCounts: tenantCounts.reduce((acc, row) => {
          acc[row.tenant_type] = parseInt(row.count)
          return acc
        }, {}),
        subscriptionStats: subscriptionStats.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count)
          return acc
        }, {}),
        revenue: {
          mrr: parseFloat(revenueStats[0]?.mrr || 0),
          activeSubscriptions: parseInt(revenueStats[0]?.active_subscriptions || 0),
          arr: parseFloat(revenueStats[0]?.mrr || 0) * 12,
        },
        activity: {
          ordersLast24h: parseInt(recentOrders[0]?.count || 0),
          chatsLast24h: parseInt(recentChats[0]?.count || 0),
        },
        alerts: {
          pastDueInvoices: parseInt(alerts[0]?.count || 0),
        },
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get admin overview error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get admin overview' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// CONVERSION FUNNEL STATS (lightweight, no analytics vendor)
// ========================================
router.get('/conversion-stats', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30))
    let blocksToUpgradesConversionPercent = 0
    let mostBlockedFeature = null
    let mostBlockedLimit = null
    let totalBlocks = 0
    let totalUpgrades = 0
    let blocksByFeature = []
    let blocksByLimit = []

    try {
      const since = new Date()
      since.setDate(since.getDate() - days)

      const [blockCount, upgradeCount, byFeature, byLimit] = await Promise.all([
        query(
          `SELECT COUNT(*) as c FROM conversion_event WHERE event_type IN ('BLOCKED_FEATURE', 'BLOCKED_LIMIT') AND created_at >= $1`,
          [since]
        ),
        query(
          `SELECT COUNT(*) as c FROM conversion_event WHERE event_type = 'UPGRADE_SUCCESS' AND created_at >= $1`,
          [since]
        ),
        query(
          `SELECT metadata_json->>'featureKey' as key, COUNT(*) as c FROM conversion_event WHERE event_type = 'BLOCKED_FEATURE' AND created_at >= $1 GROUP BY metadata_json->>'featureKey' ORDER BY c DESC LIMIT 5`,
          [since]
        ),
        query(
          `SELECT metadata_json->>'limitKey' as key, COUNT(*) as c FROM conversion_event WHERE event_type = 'BLOCKED_LIMIT' AND created_at >= $1 GROUP BY metadata_json->>'limitKey' ORDER BY c DESC LIMIT 5`,
          [since]
        ),
      ])

      totalBlocks = parseInt(blockCount.rows[0]?.c || 0)
      totalUpgrades = parseInt(upgradeCount.rows[0]?.c || 0)
      if (totalBlocks > 0) {
        blocksToUpgradesConversionPercent = Math.round((totalUpgrades / totalBlocks) * 100)
      }
      mostBlockedFeature = byFeature.rows[0]?.key || null
      mostBlockedLimit = byLimit.rows[0]?.key || null
      blocksByFeature = byFeature.rows.map((r) => ({ key: r.key, count: parseInt(r.c) }))
      blocksByLimit = byLimit.rows.map((r) => ({ key: r.key, count: parseInt(r.c) }))
    } catch (e) {
      if (e.code !== '42P01') throw e
    }

    res.json({
      ok: true,
      data: {
        days,
        totalBlocks,
        totalUpgrades,
        blocksToUpgradesConversionPercent,
        mostBlockedFeature,
        mostBlockedLimit,
        blocksByFeature,
        blocksByLimit,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Conversion stats error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get conversion stats' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// PLANS MANAGEMENT
// ========================================
router.get('/plans', async (req, res) => {
  try {
    const tenantType = req.query.tenant_type // 'RESTAURANT' | 'SUPPLIER' | omit = all
    let plans

    try {
      const plansQuery =
        tenantType && ['RESTAURANT', 'SUPPLIER'].includes(tenantType)
          ? `SELECT * FROM subscription_plan WHERE tenant_type = $1 ORDER BY display_order, name`
          : `SELECT * FROM subscription_plan ORDER BY tenant_type, display_order, name`
      const plansParams =
        tenantType && ['RESTAURANT', 'SUPPLIER'].includes(tenantType) ? [tenantType] : []
      const result = await query(plansQuery, plansParams)
      plans = result.rows
    } catch (queryErr) {
      if (
        queryErr.code === '42703' ||
        /tenant_type|column.*does not exist/i.test(queryErr.message)
      ) {
        const { rows } = await query(`SELECT * FROM subscription_plan ORDER BY display_order, name`)
        plans = rows.map((p) => ({ ...p, tenant_type: p.tenant_type || 'RESTAURANT' }))
        if (tenantType && ['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
          plans = plans.filter((p) => (p.tenant_type || 'RESTAURANT') === tenantType)
        }
      } else if (queryErr.code === '42P01') {
        plans = []
      } else {
        throw queryErr
      }
    }

    res.json({
      ok: true,
      data: {
        plans: plans.map((p) => ({
          ...p,
          limits: p.limits || {},
          features: typeof p.features === 'object' && p.features !== null ? p.features : {},
        })),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get plans error:', { error: error.message, code: error.code })
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to get plans',
      },
      requestId: req.requestId,
    })
  }
})

const createPlanSchema = z.object({
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, 'code must be lowercase alphanumeric + underscore'),
  name: z.string().min(1),
  tenantType: z.enum(['RESTAURANT', 'SUPPLIER']),
  description: z.string().optional(),
  pricePerMonth: z.number().nonnegative(),
  pricePerYear: z.number().nonnegative().optional(),
  limits: z.record(z.any()),
  features: z.record(z.any()),
  trialDays: z.number().nonnegative().default(0),
  displayOrder: z.number().default(0),
  isActive: z.boolean().default(true),
})

router.post('/plans', async (req, res) => {
  try {
    const planData = createPlanSchema.parse(req.body)
    const validation = validatePlanLimitsAndFeatures(
      planData.limits,
      planData.features,
      planData.tenantType
    )
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: validation.message },
        requestId: req.requestId,
      })
    }
    const planType = planData.tenantType === 'RESTAURANT' ? 'restaurant_only' : 'supplier_only'

    const {
      rows: [plan],
    } = await query(
      `
      INSERT INTO subscription_plan (
        code, name, tenant_type, type, description, price_per_month, price_per_year,
        limits, features, trial_days, display_order, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
      [
        planData.code.toLowerCase(),
        planData.name,
        planData.tenantType,
        planType,
        planData.description || null,
        planData.pricePerMonth,
        planData.pricePerYear || null,
        JSON.stringify(planData.limits || {}),
        JSON.stringify(planData.features || {}),
        planData.trialDays,
        planData.displayOrder,
        planData.isActive,
      ]
    )

    await logAudit(
      req,
      'plan.created',
      `Created plan: ${planData.name}`,
      'plan',
      plan.id,
      null,
      plan
    )
    logger.info(`Plan created: ${planData.name}`)

    res.json({
      ok: true,
      data: { plan },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Create plan error:', error)
    if (error instanceof ZodError) {
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid plan data', details: error.errors },
        requestId: req.requestId,
      })
    } else {
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to create plan' },
        requestId: req.requestId,
      })
    }
  }
})

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  pricePerMonth: z.number().nonnegative().optional(),
  pricePerYear: z.number().nonnegative().optional(),
  limits: z.record(z.any()).optional(),
  features: z.record(z.any()).optional(),
  trialDays: z.number().nonnegative().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().optional(),
})

router.patch('/plans/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updateData = updatePlanSchema.parse(req.body)

    // Get existing plan
    const { rows: existingPlans } = await query('SELECT * FROM subscription_plan WHERE id = $1', [
      id,
    ])
    if (existingPlans.length === 0) {
      res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Plan not found' },
        requestId: req.requestId,
      })
      return
    }

    const existing = existingPlans[0]
    const planTenantType = existing.tenant_type || 'RESTAURANT'

    if (updateData.limits !== undefined || updateData.features !== undefined) {
      const limits = updateData.limits !== undefined ? updateData.limits : existing.limits
      const features = updateData.features !== undefined ? updateData.features : existing.features
      const validation = validatePlanLimitsAndFeatures(limits, features, planTenantType)
      if (!validation.valid) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: validation.message },
          requestId: req.requestId,
        })
      }
    }

    // Build update query dynamically
    const updates = []
    const values = []
    let paramIndex = 1

    if (updateData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(updateData.name)
    }
    if (updateData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(updateData.description)
    }
    if (updateData.pricePerMonth !== undefined) {
      updates.push(`price_per_month = $${paramIndex++}`)
      values.push(updateData.pricePerMonth)
    }
    if (updateData.pricePerYear !== undefined) {
      updates.push(`price_per_year = $${paramIndex++}`)
      values.push(updateData.pricePerYear)
    }
    if (updateData.limits !== undefined) {
      updates.push(`limits = $${paramIndex++}`)
      values.push(JSON.stringify(updateData.limits))
    }
    if (updateData.features !== undefined) {
      updates.push(`features = $${paramIndex++}`)
      values.push(JSON.stringify(updateData.features))
    }
    if (updateData.trialDays !== undefined) {
      updates.push(`trial_days = $${paramIndex++}`)
      values.push(updateData.trialDays)
    }
    if (updateData.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`)
      values.push(updateData.displayOrder)
    }
    if (updateData.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`)
      values.push(updateData.isActive)
    }

    values.push(id)

    const {
      rows: [updated],
    } = await query(
      `
      UPDATE subscription_plan
      SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${paramIndex}
      RETURNING *
    `,
      values
    )

    await logAudit(
      req,
      'plan.updated',
      `Updated plan: ${existing.name}`,
      'plan',
      id,
      existing,
      updated
    )
    logger.info(`Plan updated: ${existing.name}`)

    res.json({
      ok: true,
      data: { plan: updated },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Update plan error:', error)
    if (error instanceof ZodError) {
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid plan data', details: error.errors },
        requestId: req.requestId,
      })
    } else {
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update plan' },
        requestId: req.requestId,
      })
    }
  }
})

// ========================================
// SUBSCRIPTIONS MANAGEMENT
// ========================================
router.get('/subscriptions', async (req, res) => {
  try {
    const { status, tenantType } = req.query

    let whereClause = ''
    const params = []
    let paramIndex = 1

    if (status) {
      whereClause += ` WHERE s.status = $${paramIndex++}`
      params.push(status)
    }

    if (tenantType) {
      if (whereClause) whereClause += ' AND'
      else whereClause = ' WHERE'
      whereClause += ` s.tenant_type = $${paramIndex++}`
      params.push(tenantType)
    }

    const { rows: subscriptions } = await query(
      `
      SELECT s.*,
        sp.price_per_month, sp.price_per_year, sp.limits as plan_limits, sp.features as plan_features,
        COALESCE(
          CASE WHEN s.tenant_type = 'SUPPLIER' THEN su.name ELSE NULL END,
          CASE WHEN s.tenant_type = 'RESTAURANT' THEN r.name ELSE NULL END
        ) as tenant_name,
        COALESCE(su.contact_email, r.contact_email) as tenant_email
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      LEFT JOIN supplier su ON (s.tenant_id = su.id AND s.tenant_type = 'SUPPLIER')
      LEFT JOIN restaurant r ON (s.tenant_id = r.id AND s.tenant_type = 'RESTAURANT')
      ${whereClause}
      ORDER BY s.created_at DESC
    `,
      params
    )

    res.json({
      ok: true,
      data: { subscriptions },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get subscriptions error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get subscriptions' },
      requestId: req.requestId,
    })
  }
})

const updateSubscriptionSchema = z.object({
  planId: z.string().uuid().optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'PAST_DUE']).optional(),
  cancelReason: z.string().optional(),
  allowExceedance: z.boolean().optional(),
  force: z.boolean().optional(),
  reason: z.string().optional(),
  applyAtPeriodEnd: z.boolean().optional(),
})

/**
 * POST /subscriptions/:id/preview-change
 * Preview impact of changing subscription to target plan (usage vs limits, feature diff).
 */
router.post('/subscriptions/:id/preview-change', async (req, res) => {
  try {
    const { id } = req.params
    const { targetPlanId } = req.body
    if (!targetPlanId || typeof targetPlanId !== 'string') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'targetPlanId is required' },
        requestId: req.requestId,
      })
    }

    const { rows: subRows } = await query(
      'SELECT s.*, sp.limits as current_limits, sp.features as current_features FROM subscription s JOIN subscription_plan sp ON sp.id = s.plan_id WHERE s.id = $1',
      [id]
    )
    if (subRows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Subscription not found' },
        requestId: req.requestId,
      })
    }
    const sub = subRows[0]
    const tenantId = sub.tenant_id
    const tenantType = sub.tenant_type

    const { rows: targetPlanRows } = await query(
      'SELECT id, name, code, tenant_type, limits, features FROM subscription_plan WHERE id = $1',
      [targetPlanId]
    )
    if (targetPlanRows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Target plan not found' },
        requestId: req.requestId,
      })
    }
    const targetPlan = targetPlanRows[0]
    if (targetPlan.tenant_type !== tenantType) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'Target plan tenant_type must match subscription (Restaurant vs Supplier)',
        },
        requestId: req.requestId,
      })
    }

    const entitlements = await getEntitlements(tenantId, tenantType)
    if (!entitlements) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'No entitlements for tenant' },
        requestId: req.requestId,
      })
    }

    const limitKeys = tenantType === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
    const targetLimits = targetPlan.limits || {}
    const willExceed = []
    for (const limitKey of limitKeys) {
      const usage = entitlements.usage[limitKey] ?? 0
      const rawLimit = targetLimits[limitKey]
      const limit =
        rawLimit === -1 || rawLimit === null || rawLimit === undefined ? null : parseInt(rawLimit)
      if (limit !== null && usage > limit) {
        willExceed.push({ limitKey, usage, limit })
      }
    }

    const currentFeatures = sub.current_features || {}
    const targetFeatures = targetPlan.features || {}
    const featureKeys = new Set([...Object.keys(currentFeatures), ...Object.keys(targetFeatures)])
    const toBool = (v) => {
      if (typeof v === 'boolean') return v
      if (typeof v === 'string') return v !== 'false' && v !== 'disabled' && v !== ''
      return !!v
    }
    const enabled = []
    const disabled = []
    for (const key of featureKeys) {
      const cur = toBool(currentFeatures[key])
      const tgt = toBool(targetFeatures[key])
      if (tgt && !cur) enabled.push(key)
      else if (cur && !tgt) disabled.push(key)
    }

    const recommendedActions = []
    if (willExceed.length > 0) {
      recommendedActions.push(
        `Current usage exceeds target plan limits for: ${willExceed.map((e) => `${e.limitKey} (${e.usage} > ${e.limit})`).join(', ')}. Reduce usage or choose a higher plan.`
      )
    }

    res.json({
      ok: true,
      data: {
        willExceed,
        featureDiff: { enabled, disabled },
        recommendedActions,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Preview plan change error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to preview plan change' },
      requestId: req.requestId,
    })
  }
})

router.patch('/subscriptions/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updateData = updateSubscriptionSchema.parse(req.body)
    const allowExceedance = updateData.allowExceedance || updateData.force === true
    if (updateData.force === true && !(updateData.reason && updateData.reason.trim())) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'reason is required when force is true',
        },
        requestId: req.requestId,
      })
    }

    const { rows: existingSubs } = await query('SELECT * FROM subscription WHERE id = $1', [id])
    if (existingSubs.length === 0) {
      res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Subscription not found' },
        requestId: req.requestId,
      })
      return
    }

    const existing = existingSubs[0]
    let existingPlanCode = null
    if (existing.plan_id) {
      const { rows: oldPlan } = await query('SELECT code FROM subscription_plan WHERE id = $1', [
        existing.plan_id,
      ])
      existingPlanCode = oldPlan[0]?.code || null
    }

    const updates = []
    const values = []
    let paramIndex = 1
    let newPlan = null
    let planChangeApplyAtPeriodEnd = false

    if (updateData.planId) {
      const { rows: planRows } = await query(
        'SELECT id, name, code, tenant_type, limits FROM subscription_plan WHERE id = $1',
        [updateData.planId]
      )
      if (planRows.length === 0) {
        res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: 'Plan not found' },
          requestId: req.requestId,
        })
        return
      }
      newPlan = planRows[0]
      if (newPlan.tenant_type !== existing.tenant_type) {
        res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'Plan tenant_type must match subscription tenant (Restaurant vs Supplier)',
          },
          requestId: req.requestId,
        })
        return
      }
      if (!allowExceedance) {
        const entitlements = await getEntitlements(existing.tenant_id, existing.tenant_type)
        if (entitlements) {
          const limitKeys =
            existing.tenant_type === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
          const targetLimits = newPlan.limits || {}
          const willExceed = []
          for (const limitKey of limitKeys) {
            const usage = entitlements.usage[limitKey] ?? 0
            const rawLimit = targetLimits[limitKey]
            const limit =
              rawLimit === -1 || rawLimit === null || rawLimit === undefined
                ? null
                : parseInt(rawLimit)
            if (limit !== null && usage > limit) {
              willExceed.push({ limitKey, usage, limit })
            }
          }
          if (willExceed.length > 0) {
            res.status(400).json({
              ok: false,
              data: null,
              error: {
                name: 'LIMIT_EXCEEDED',
                message:
                  'Current usage exceeds target plan limits. Use preview-change to see impact, or pass force: true with reason to force change.',
                details: { willExceed },
              },
              requestId: req.requestId,
            })
            return
          }
        }
      }
      if (updateData.applyAtPeriodEnd === true) {
        const effectiveAt =
          existing.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        updates.push(`pending_plan_id = $${paramIndex++}`)
        values.push(updateData.planId)
        updates.push(`pending_effective_at = $${paramIndex++}`)
        values.push(effectiveAt)
        planChangeApplyAtPeriodEnd = true
      } else {
        updates.push(`plan_id = $${paramIndex++}`)
        values.push(updateData.planId)
        updates.push(`plan_name = $${paramIndex++}`)
        values.push(newPlan.name)
        updates.push(`previous_plan_code = $${paramIndex++}`)
        values.push(existingPlanCode)
        updates.push(`pending_plan_id = NULL`)
        updates.push(`pending_effective_at = NULL`)
      }
    }

    if (updateData.status) {
      updates.push(`status = $${paramIndex++}`)
      values.push(updateData.status)

      if (updateData.status === 'CANCELLED') {
        updates.push(`cancelled_at = now()`)
      }
    }

    if (updateData.cancelReason) {
      updates.push(`cancel_reason = $${paramIndex++}`)
      values.push(updateData.cancelReason)
    }

    values.push(id)

    const {
      rows: [updated],
    } = await query(
      `
      UPDATE subscription
      SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${paramIndex}
      RETURNING *
    `,
      values
    )

    if (updateData.planId && (newPlan || planChangeApplyAtPeriodEnd)) {
      try {
        await query(
          `
          INSERT INTO subscription_change_log (subscription_id, from_plan_id, to_plan_id, changed_by_admin_id, reason)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [
            id,
            existing.plan_id,
            updateData.planId,
            req.userData.id,
            updateData.reason || (planChangeApplyAtPeriodEnd ? 'apply_at_period_end' : null),
          ]
        )
      } catch (e) {
        if (e.code !== '42P01') logger.error('subscription_change_log insert failed', e)
      }
      recordConversionEvent(existing.tenant_id, existing.tenant_type, 'UPGRADE_SUCCESS', {
        from_plan_id: existing.plan_id,
        to_plan_id: updateData.planId,
        subscription_id: id,
      }).catch(() => {})
    }

    const statusChangeReason = updateData.reason || updateData.cancelReason
    if (updateData.status === 'SUSPENDED') {
      await logAudit(
        req,
        'subscription.suspend',
        `Suspended subscription ${id}`,
        'subscription',
        id,
        existing,
        updated,
        {
          target_tenant_id: existing.tenant_id,
          target_tenant_type: existing.tenant_type,
          reason: statusChangeReason,
        }
      )
    } else if (updateData.status === 'ACTIVE' && existing.status === 'SUSPENDED') {
      await logAudit(
        req,
        'subscription.resume',
        `Resumed subscription ${id}`,
        'subscription',
        id,
        existing,
        updated,
        {
          target_tenant_id: existing.tenant_id,
          target_tenant_type: existing.tenant_type,
          reason: statusChangeReason,
        }
      )
    } else {
      await logAudit(
        req,
        'subscription.updated',
        `Updated subscription ${updateData.planId ? 'plan' : ''} ${updateData.status ? `status to ${updateData.status}` : 'unchanged'}`,
        'subscription',
        id,
        existing,
        updated,
        { target_tenant_id: existing.tenant_id, target_tenant_type: existing.tenant_type }
      )
    }

    res.json({
      ok: true,
      data: { subscription: updated },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Update subscription error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update subscription' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// USAGE & QUOTAS
// ========================================
router.get('/usage/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params
    const { tenantType, period } = req.query

    const periodStart = period || 'monthly'

    const { rows: usage } = await query(
      `
      SELECT * FROM usage_meter
      WHERE tenant_id = $1 AND tenant_type = $2
        AND period_type = $3
      ORDER BY meter_type
    `,
      [tenantId, tenantType, periodStart]
    )

    res.json({
      ok: true,
      data: { usage, period: periodStart },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get usage error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get usage' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// AUDIT LOGS
// ========================================
router.get('/audit-logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, tenantId, actionType } = req.query

    let whereClause = ''
    const params = []
    let paramIndex = 1

    if (tenantId) {
      whereClause += ` WHERE target_tenant_id = $${paramIndex++}`
      params.push(tenantId)
    }

    if (actionType) {
      if (whereClause) whereClause += ' AND'
      else whereClause = ' WHERE'
      whereClause += ` action_type = $${paramIndex++}`
      params.push(actionType)
    }

    params.push(limit, offset)

    const { rows: logs } = await query(
      `
      SELECT * FROM admin_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `,
      params
    )

    res.json({
      ok: true,
      data: { logs, limit: parseInt(limit), offset: parseInt(offset) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get audit logs error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get audit logs' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// IMPERSONATION
// ========================================

const impersonateSchema = z.object({
  tenantId: z.string().uuid(),
  tenantType: z.enum(['RESTAURANT', 'SUPPLIER']),
})

/**
 * POST /api/admin-dashboard/impersonate
 * Start impersonating a tenant (Restaurant or Supplier). Cannot impersonate an admin.
 */
router.post('/impersonate', async (req, res) => {
  try {
    const { tenantId, tenantType } = impersonateSchema.parse(req.body)

    // Resolve tenant and ensure it is not an admin user (no app_user with ADMIN for this tenant)
    const table = tenantType === 'RESTAURANT' ? 'restaurant' : 'supplier'
    const { rows: tenants } = await query(
      `SELECT id, name, contact_email FROM ${table} WHERE id = $1`,
      [tenantId]
    )
    if (tenants.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    const tenant = tenants[0]
    // Ensure we're not impersonating an admin (contact_email that belongs to ADMIN)
    const { rows: adminUsers } = await query(
      "SELECT id FROM app_user WHERE email = $1 AND role = 'ADMIN'",
      [tenant.contact_email]
    )
    if (adminUsers.length > 0) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: { name: 'FORBIDDEN', message: 'Cannot impersonate a user with Admin role' },
        requestId: req.requestId,
      })
    }

    const token = await createImpersonationToken({
      adminUserId: req.userData.id,
      tenantId,
      tenantType,
      tenantName: tenant.name || tenant.contact_email || tenantId,
    })
    const maxMin = config.IMPERSONATION_MAX_DURATION_MINUTES || 60
    const maxAgeMs = maxMin * 60 * 1000
    const expiresAt = new Date(Date.now() + maxAgeMs)

    res.cookie(getImpersonationCookieName(), token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeMs,
      path: '/',
    })

    await logAudit(
      req,
      'IMPERSONATION_START',
      `Started impersonating ${tenantType} ${tenant.name || tenantId}`,
      'TENANT',
      tenantId,
      null,
      { tenantId, tenantType, tenantName: tenant.name },
      { target_tenant_type: tenantType }
    )

    res.json({
      ok: true,
      data: { tenantId, tenantType, tenantName: tenant.name, expiresAt: expiresAt.toISOString() },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid body', details: error.errors },
        requestId: req.requestId,
      })
    }
    logger.error('Impersonate start error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to start impersonation' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/admin-dashboard/impersonate/stop
 * End impersonation and clear the cookie.
 */
router.post('/impersonate/stop', async (req, res) => {
  try {
    const ctx = req.impersonationContext
    // Clear with same options as setCookie so the browser actually removes it
    res.clearCookie(getImpersonationCookieName(), {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
    })

    if (ctx) {
      await logAudit(
        req,
        'IMPERSONATION_END',
        `Stopped impersonating ${ctx.tenantType} ${ctx.tenantName || ctx.tenantId}`,
        'TENANT',
        ctx.tenantId,
        { tenantId: ctx.tenantId, tenantType: ctx.tenantType },
        null,
        { target_tenant_type: ctx.tenantType }
      )
    }

    res.json({
      ok: true,
      data: { stopped: true },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Impersonate stop error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to stop impersonation' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/admin-dashboard/impersonate
 * Return current impersonation status (for UI banner).
 */
router.get('/impersonate', async (req, res) => {
  try {
    const effective = getEffectiveTenant(req)
    if (!effective) {
      return res.json({
        ok: true,
        data: { active: false },
        error: null,
        requestId: req.requestId,
      })
    }
    const ctx = req.impersonationContext
    const expiresAt = ctx?.exp ? new Date(ctx.exp * 1000).toISOString() : null
    res.json({
      ok: true,
      data: {
        active: true,
        tenantId: effective.tenantId,
        tenantType: effective.tenantType,
        tenantName: effective.tenantName,
        expiresAt,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Impersonate status error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get impersonation status' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// TENANT MANAGEMENT
// ========================================

// Get suppliers with detailed info
router.get('/tenants/suppliers', async (req, res) => {
  try {
    const { rows: suppliers } = await query(`
      SELECT 
        s.*,
        sub.status as subscription_status,
        sub.plan_name,
        sub.id as subscription_id,
        (SELECT COUNT(*) FROM product WHERE supplier_id = s.id) as product_count,
        (SELECT COUNT(*) FROM warehouse WHERE supplier_id = s.id AND is_active = true) as warehouse_count,
        (SELECT COALESCE(SUM(oi.line_total), 0)
         FROM order_item oi
         JOIN customer_order o ON o.id = oi.order_id
         WHERE oi.supplier_id = s.id AND o.status = 'COMPLETED'
        )::numeric(12,2) as total_revenue
      FROM supplier s
      LEFT JOIN subscription sub ON sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER' AND sub.status IN ('ACTIVE', 'TRIALING')
      ORDER BY s.name
    `)

    res.json({
      ok: true,
      data: { suppliers },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get suppliers error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get suppliers' },
      requestId: req.requestId,
    })
  }
})

// Get restaurants with detailed info
router.get('/tenants/restaurants', async (req, res) => {
  try {
    const { rows: restaurants } = await query(`
      SELECT 
        r.*,
        sub.status as subscription_status,
        sub.plan_name,
        sub.id as subscription_id,
        (SELECT COUNT(*) FROM customer_order WHERE restaurant_id = r.id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM customer_order WHERE restaurant_id = r.id AND status = 'COMPLETED') as total_spent,
        (SELECT COUNT(*) FROM customer_order WHERE restaurant_id = r.id AND placed_at >= NOW() - INTERVAL '30 days') as orders_last_30d
      FROM restaurant r
      LEFT JOIN subscription sub ON sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT' AND sub.status IN ('ACTIVE', 'TRIALING')
      ORDER BY r.name
    `)

    res.json({
      ok: true,
      data: { restaurants },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get restaurants error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get restaurants' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// TENANT OVERRIDES
// ========================================

/**
 * POST /api/admin-dashboard/tenants/:id/override-limit
 * Manually override a tenant's limit (e.g., grant temporary increase)
 */
router.post('/tenants/:tenantType/:id/override-limit', async (req, res) => {
  try {
    const { id: tenantId, tenantType } = req.params
    const { limit_type, override_value, expiration_date, reason } = req.body

    const { rows: existing } = await query(
      `SELECT id FROM tenant_limit_override WHERE tenant_id = $1 AND tenant_type = $2 AND limit_type = $3`,
      [tenantId, tenantType.toUpperCase(), limit_type]
    )
    const isUpdate = existing.length > 0

    const { rows: overrides } = await query(
      `
      INSERT INTO tenant_limit_override (
        tenant_id, tenant_type, limit_type, override_value, expiration_date, reason, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, tenant_type, limit_type)
      DO UPDATE SET override_value = EXCLUDED.override_value, expiration_date = EXCLUDED.expiration_date, reason = EXCLUDED.reason, updated_at = now()
      RETURNING *
    `,
      [
        tenantId,
        tenantType.toUpperCase(),
        limit_type,
        override_value,
        expiration_date || null,
        reason || null,
        req.userData.id,
      ]
    )

    await logAudit(
      req,
      isUpdate ? 'override.update' : 'OVERRIDE_LIMIT',
      isUpdate
        ? `Updated ${limit_type} override: ${override_value}`
        : `Granted ${limit_type} override: ${override_value}`,
      tenantType.toUpperCase(),
      tenantId,
      isUpdate ? existing[0] : null,
      { limit_type, override_value, expiration_date, reason }
    )

    res.json({
      ok: true,
      data: { override: overrides[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Override limit error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to set override' },
      requestId: req.requestId,
    })
  }
})

/**
 * DELETE /api/admin-dashboard/tenants/:id/override-limit/:overrideId
 * Remove a tenant limit override
 */
router.delete('/tenants/:tenantType/:id/override-limit/:overrideId', async (req, res) => {
  try {
    const { overrideId } = req.params

    const { rows: deleted } = await query(
      `
      DELETE FROM tenant_limit_override WHERE id = $1 RETURNING *
    `,
      [overrideId]
    )

    if (deleted.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Override not found' },
        requestId: req.requestId,
      })
    }

    // Log audit
    await logAudit(
      req,
      'REMOVE_OVERRIDE',
      `Removed limit override`,
      deleted[0].tenant_type,
      deleted[0].tenant_id,
      deleted[0],
      null
    )

    res.json({
      ok: true,
      data: { override: deleted[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Remove override error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to remove override' },
      requestId: req.requestId,
    })
  }
})

// Get tenant entitlements (plan, limits, overrides, usage) for admin tenant detail
router.get('/tenants/:tenantType/:id/entitlements', async (req, res) => {
  try {
    const { tenantType, id } = req.params
    if (!['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'tenantType must be RESTAURANT or SUPPLIER' },
        requestId: req.requestId,
      })
    }
    const entitlements = await getEntitlements(id, tenantType)
    if (!entitlements) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'No active subscription for this tenant' },
        requestId: req.requestId,
      })
    }
    res.json({
      ok: true,
      data: { entitlements },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get tenant entitlements error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get tenant entitlements' },
      requestId: req.requestId,
    })
  }
})

// Get supplier usage details
router.get('/tenants/suppliers/:id/usage', async (req, res) => {
  try {
    const { id } = req.params

    const { rows: usage } = await query(
      `
      SELECT * FROM usage_meter
      WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER'
      ORDER BY meter_type, period_start_date DESC
    `,
      [id]
    )

    res.json({
      ok: true,
      data: { usage },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get supplier usage error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get supplier usage' },
      requestId: req.requestId,
    })
  }
})

// Get restaurant usage details
router.get('/tenants/restaurants/:id/usage', async (req, res) => {
  try {
    const { id } = req.params

    const { rows: usage } = await query(
      `
      SELECT * FROM usage_meter
      WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT'
      ORDER BY meter_type, period_start_date DESC
    `,
      [id]
    )

    res.json({
      ok: true,
      data: { usage },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get restaurant usage error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get restaurant usage' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// HEALTH (Phase C1)
// ========================================
router.get('/health', async (req, res) => {
  try {
    let jobFailures = []
    let webhookFailures = []
    let emailFailures = []
    let recentErrors = []
    let dbPool = null

    try {
      const { rows } = await query(
        `SELECT type, severity, source, payload, created_at FROM system_event WHERE severity = 'error' ORDER BY created_at DESC LIMIT 50`
      )
      recentErrors = rows.map((r) => ({
        type: r.type,
        source: r.source,
        message: r.payload?.message,
        created_at: r.created_at,
      }))
    } catch (e) {
      if (e.code !== '42P01') throw e
    }

    if (pool && typeof pool.totalCount === 'number') {
      dbPool = { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
    }

    res.json({
      ok: true,
      data: {
        jobFailures: jobFailures.length ? jobFailures : null,
        webhookFailures: webhookFailures.length ? webhookFailures : null,
        emailFailures: emailFailures.length ? emailFailures : null,
        recentApiErrors: recentErrors,
        dbPool,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Health endpoint error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get health' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// FINANCIAL OVERVIEW (Phase C2)
// ========================================
router.get('/financial-overview', async (req, res) => {
  try {
    const [
      gmvResult,
      outstandingResult,
      overdueResult,
      revenueByPlanResult,
      topTenantsRevenueResult,
      topTenantsOverdueResult,
    ] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(total_amount), 0)::numeric as gmv FROM invoice WHERE status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE')`
      ),
      query(
        `SELECT COALESCE(SUM(balance_due), 0)::numeric as outstanding FROM invoice WHERE status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') AND balance_due > 0`
      ),
      query(
        `SELECT COALESCE(SUM(balance_due), 0)::numeric as overdue FROM invoice WHERE status = 'OVERDUE' AND balance_due > 0`
      ),
      query(
        `SELECT sp.name as plan_name, sp.type as tenant_type,
         COUNT(s.id) as subscription_count,
         COALESCE(SUM(CASE WHEN s.billing_cycle = 'MONTHLY' THEN sp.price_per_month ELSE sp.price_per_month * 12 END), 0)::numeric as mrr
         FROM subscription s
         JOIN subscription_plan sp ON sp.id = s.plan_id
         WHERE s.status IN ('ACTIVE', 'TRIALING')
         GROUP BY sp.id, sp.name, sp.type, sp.price_per_month`
      ),
      query(
        `SELECT restaurant_id as tenant_id, 'RESTAURANT' as tenant_type,
         COALESCE(SUM(total_amount), 0)::numeric as revenue
         FROM invoice WHERE status IN ('PAID', 'PARTIALLY_PAID') AND restaurant_id IS NOT NULL
         GROUP BY restaurant_id ORDER BY revenue DESC LIMIT 10`
      ),
      query(
        `SELECT restaurant_id as tenant_id, 'RESTAURANT' as tenant_type,
         COALESCE(SUM(balance_due), 0)::numeric as overdue_amount
         FROM invoice WHERE status = 'OVERDUE' AND balance_due > 0 AND restaurant_id IS NOT NULL
         GROUP BY restaurant_id ORDER BY overdue_amount DESC LIMIT 10`
      ),
    ])

    const gmv = parseFloat(gmvResult.rows[0]?.gmv || 0)
    const outstanding = parseFloat(outstandingResult.rows[0]?.outstanding || 0)
    const overdue = parseFloat(overdueResult.rows[0]?.overdue || 0)
    const mrrRows = revenueByPlanResult.rows || []
    const mrr = mrrRows.reduce((sum, r) => sum + parseFloat(r.mrr || 0), 0)
    const arr = mrr * 12

    res.json({
      ok: true,
      data: {
        gmv,
        outstanding,
        overdue,
        revenueByPlan: mrrRows.map((r) => ({
          planName: r.plan_name,
          tenantType: r.tenant_type,
          subscriptionCount: parseInt(r.subscription_count || 0),
          mrr: parseFloat(r.mrr || 0),
          arr: parseFloat(r.mrr || 0) * 12,
        })),
        mrr,
        arr,
        topTenantsByRevenue: topTenantsRevenueResult.rows || [],
        topTenantsByOverdue: topTenantsOverdueResult.rows || [],
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Financial overview error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get financial overview' },
      requestId: req.requestId,
    })
  }
})

export default router
