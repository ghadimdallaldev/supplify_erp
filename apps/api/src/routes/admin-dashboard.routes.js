import { randomUUID } from 'crypto'
import { Router } from 'express'
import { query, pool } from '../lib/db.js'
import { requireAuth, requireRole, resolveAdminContext, requirePermission } from '../lib/rbac.js'
import { z } from 'zod'
import { logger } from '../lib/logger.js'
import { ZodError } from 'zod'
import { config } from '../config/env.js'
import { deliveredOrderStatusInSql } from '../lib/order-statuses.js'
import { parseAdminListPagination } from '../lib/admin-list-pagination.js'
import {
  createImpersonationToken,
  verifyImpersonationToken,
  getImpersonationCookieName,
  getEffectiveTenant,
  clearImpersonationCookie,
} from '../lib/impersonation.js'
import {
  getEntitlements,
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
  invalidateTenantSubscriptionCache,
  discoverLimitKeys,
  checkLimit,
} from '../lib/subscription.js'
import { resolveEffectiveLimit } from '../lib/limit-resolution.js'
import {
  resolveOrgBillingTenantId,
  resolveActiveBillingSubscription,
} from '../lib/org-billing-tenant.js'
import { clearActiveTenantCookie } from '../lib/tenant-switch.js'
import {
  defaultAddonUnitPrice,
  getActiveTenantAddons,
  isAddonKeyValidForTenant,
} from '../lib/subscription-addons.js'
import { getAllowedFeatureKeys, featureDisplayName } from '../lib/feature-keys.js'
import {
  listGlobalFeatureFlags,
  setGlobalFeatureOverride,
  listTenantFeatureOverrides,
  getEffectiveFeaturesForTenant,
  setTenantFeatureOverride,
  clearTenantFeatureOverride,
} from '../lib/feature-flags.js'
import { writeAuditLog } from '../lib/audit.js'
import { recordConversionEvent } from '../lib/conversion-events.js'
import {
  extendFreeSandboxTrial,
  unlockSubscriptionAccount,
} from '../lib/billing/billing-service.js'
import { clampFreeTrialDays } from '../lib/platform-settings.js'
import {
  validatePlanLimitsAndFeatures,
  validateFreePlanTrialDays,
  validateEnterprisePlanActivation,
  validateEnterprisePlanCreate,
  buildTierLadderWarnings,
} from '../lib/plan-admin-validation.js'
import { isLimitKeyApplicable } from '../lib/limit-resolution.js'
import { buildAdminOverviewMetrics } from '../lib/admin-overview-metrics.js'
import { buildAdminActivityFeed } from '../lib/admin-activity-feed.js'
import { adminResetUserPassword, listAdminUsers } from '../services/admin-user-password.service.js'
import { adminDashboardPermissionGuard, requireAnyPermission } from '../lib/route-permissions.js'
import { PERMISSION_KEYS as P } from '../lib/permission-keys.js'

const router = Router()

router.use(
  requireAuth,
  requireRole(['ADMIN']),
  resolveAdminContext,
  requireAnyPermission(
    P.ADMIN_ACCESS,
    P.ADMIN_TENANTS,
    P.ADMIN_PLANS,
    P.ADMIN_FINANCE,
    P.ADMIN_SUPPORT,
    P.ADMIN_GROWTH
  ),
  adminDashboardPermissionGuard
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
    const data = await buildAdminOverviewMetrics()

    res.json({
      ok: true,
      data,
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
    let countsPerEventType7d = {}
    let countsPerEventType30d = {}
    let funnelDropOff7d = { blocked: 0, openUpgrade: 0, clickUpgrade: 0, upgradeSuccess: 0 }
    let funnelDropOff30d = { blocked: 0, openUpgrade: 0, clickUpgrade: 0, upgradeSuccess: 0 }
    let recommendationFunnel7d = { shown: 0, clicked: 0, upgradeSuccess: 0 }
    let recommendationFunnel30d = { shown: 0, clicked: 0, upgradeSuccess: 0 }

    try {
      const since = new Date()
      since.setDate(since.getDate() - days)
      const since7 = new Date()
      since7.setDate(since7.getDate() - 7)

      const [
        blockCount,
        upgradeCount,
        byFeature,
        byLimit,
        perType7,
        perType30,
        funnel7,
        funnel30,
        rec7,
        rec30,
      ] = await Promise.all([
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
        query(
          `SELECT event_type, COUNT(*) as c FROM conversion_event WHERE created_at >= $1 GROUP BY event_type`,
          [since7]
        ),
        query(
          `SELECT event_type, COUNT(*) as c FROM conversion_event WHERE created_at >= $1 GROUP BY event_type`,
          [since]
        ),
        query(
          `SELECT event_type, COUNT(*) as c FROM conversion_event WHERE event_type IN ('BLOCKED_FEATURE', 'BLOCKED_LIMIT', 'OPEN_UPGRADE', 'CLICK_UPGRADE', 'UPGRADE_SUCCESS') AND created_at >= $1 GROUP BY event_type`,
          [since7]
        ),
        query(
          `SELECT event_type, COUNT(*) as c FROM conversion_event WHERE event_type IN ('BLOCKED_FEATURE', 'BLOCKED_LIMIT', 'OPEN_UPGRADE', 'CLICK_UPGRADE', 'UPGRADE_SUCCESS') AND created_at >= $1 GROUP BY event_type`,
          [since]
        ),
        query(
          `SELECT event_type, COUNT(*) as c FROM conversion_event WHERE event_type IN ('RECOMMENDATION_SHOWN', 'RECOMMENDATION_CLICKED', 'UPGRADE_SUCCESS') AND created_at >= $1 GROUP BY event_type`,
          [since7]
        ),
        query(
          `SELECT event_type, COUNT(*) as c FROM conversion_event WHERE event_type IN ('RECOMMENDATION_SHOWN', 'RECOMMENDATION_CLICKED', 'UPGRADE_SUCCESS') AND created_at >= $1 GROUP BY event_type`,
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

      perType7.rows.forEach((r) => {
        countsPerEventType7d[r.event_type] = parseInt(r.c)
      })
      perType30.rows.forEach((r) => {
        countsPerEventType30d[r.event_type] = parseInt(r.c)
      })

      funnel7.rows.forEach((r) => {
        const c = parseInt(r.c)
        if (r.event_type === 'BLOCKED_FEATURE' || r.event_type === 'BLOCKED_LIMIT')
          funnelDropOff7d.blocked += c
        else if (r.event_type === 'OPEN_UPGRADE') funnelDropOff7d.openUpgrade = c
        else if (r.event_type === 'CLICK_UPGRADE') funnelDropOff7d.clickUpgrade = c
        else if (r.event_type === 'UPGRADE_SUCCESS') funnelDropOff7d.upgradeSuccess = c
      })
      funnel30.rows.forEach((r) => {
        const c = parseInt(r.c)
        if (r.event_type === 'BLOCKED_FEATURE' || r.event_type === 'BLOCKED_LIMIT')
          funnelDropOff30d.blocked += c
        else if (r.event_type === 'OPEN_UPGRADE') funnelDropOff30d.openUpgrade = c
        else if (r.event_type === 'CLICK_UPGRADE') funnelDropOff30d.clickUpgrade = c
        else if (r.event_type === 'UPGRADE_SUCCESS') funnelDropOff30d.upgradeSuccess = c
      })

      rec7.rows.forEach((r) => {
        const c = parseInt(r.c)
        if (r.event_type === 'RECOMMENDATION_SHOWN') recommendationFunnel7d.shown = c
        else if (r.event_type === 'RECOMMENDATION_CLICKED') recommendationFunnel7d.clicked = c
        else if (r.event_type === 'UPGRADE_SUCCESS') recommendationFunnel7d.upgradeSuccess = c
      })
      rec30.rows.forEach((r) => {
        const c = parseInt(r.c)
        if (r.event_type === 'RECOMMENDATION_SHOWN') recommendationFunnel30d.shown = c
        else if (r.event_type === 'RECOMMENDATION_CLICKED') recommendationFunnel30d.clicked = c
        else if (r.event_type === 'UPGRADE_SUCCESS') recommendationFunnel30d.upgradeSuccess = c
      })
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
        countsPerEventType: { '7d': countsPerEventType7d, '30d': countsPerEventType30d },
        funnelDropOff: { '7d': funnelDropOff7d, '30d': funnelDropOff30d },
        recommendationFunnel: { '7d': recommendationFunnel7d, '30d': recommendationFunnel30d },
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
      // Deduplicate by (code, tenant_type): keep one row per plan code per tenant type (prefer active, then by id)
      const tenantFilter =
        tenantType && ['RESTAURANT', 'SUPPLIER'].includes(tenantType)
          ? 'WHERE tenant_type = $1'
          : ''
      const plansParams =
        tenantType && ['RESTAURANT', 'SUPPLIER'].includes(tenantType) ? [tenantType] : []
      const result = await query(
        `
        SELECT * FROM (
          SELECT DISTINCT ON (code, tenant_type) *
          FROM subscription_plan
          ${tenantFilter}
          ORDER BY code, tenant_type, is_active DESC NULLS LAST, id
        ) deduped
        ORDER BY tenant_type, display_order NULLS LAST, name`,
        plansParams
      )
      plans = result.rows
    } catch (queryErr) {
      if (
        queryErr.code === '42703' ||
        /tenant_type|column.*does not exist/i.test(queryErr.message)
      ) {
        const { rows } = await query(
          `SELECT * FROM subscription_plan ORDER BY display_order NULLS LAST, name`
        )
        plans = rows.map((p) => ({ ...p, tenant_type: p.tenant_type || 'RESTAURANT' }))
        // Dedupe by (code, tenant_type) in JS when column may be missing
        const seen = new Set()
        plans = plans.filter((p) => {
          const key = `${p.code}|${p.tenant_type || 'RESTAURANT'}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
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

const planJsonObject = z
  .record(z.any())
  .refine((val) => val !== null && typeof val === 'object' && !Array.isArray(val), {
    message: 'must be a JSON object',
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
  limits: planJsonObject,
  features: planJsonObject,
  trialDays: z.number().nonnegative().default(0),
  displayOrder: z.number().default(0),
  isActive: z.boolean().default(true),
  confirmEnterpriseActivation: z.boolean().optional(),
})

router.post('/plans', async (req, res) => {
  try {
    const planData = createPlanSchema.parse(req.body)
    const catalogValidation = validatePlanLimitsAndFeatures(
      planData.limits,
      planData.features,
      planData.tenantType
    )
    if (!catalogValidation.valid) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: catalogValidation.message },
        requestId: req.requestId,
      })
    }

    const enterpriseCreate = validateEnterprisePlanCreate(
      planData.code,
      planData.confirmEnterpriseActivation
    )
    if (!enterpriseCreate.valid) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: enterpriseCreate.message },
        requestId: req.requestId,
      })
    }

    const enterpriseActive = validateEnterprisePlanActivation(
      planData.code,
      planData.isActive,
      planData.confirmEnterpriseActivation
    )
    if (!enterpriseActive.valid) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: enterpriseActive.message },
        requestId: req.requestId,
      })
    }

    const trialValidation = validateFreePlanTrialDays(planData.code, planData.trialDays)
    if (!trialValidation.valid) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: trialValidation.message },
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
      data: { plan, validationWarnings: [] },
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
  limits: planJsonObject.optional(),
  features: planJsonObject.optional(),
  trialDays: z.number().nonnegative().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  confirmEnterpriseActivation: z.boolean().optional(),
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
    const planCode = existing.code

    const limitsForValidation =
      updateData.limits !== undefined ? updateData.limits : existing.limits
    const featuresForValidation =
      updateData.features !== undefined ? updateData.features : existing.features

    if (updateData.limits !== undefined || updateData.features !== undefined) {
      const catalogValidation = validatePlanLimitsAndFeatures(
        limitsForValidation,
        featuresForValidation,
        planTenantType
      )
      if (!catalogValidation.valid) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: { name: 'VALIDATION_ERROR', message: catalogValidation.message },
          requestId: req.requestId,
        })
      }
    }

    const enterpriseActive = validateEnterprisePlanActivation(
      planCode,
      updateData.isActive,
      updateData.confirmEnterpriseActivation
    )
    if (!enterpriseActive.valid) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: enterpriseActive.message },
        requestId: req.requestId,
      })
    }

    const trialDaysToValidate =
      updateData.trialDays !== undefined ? updateData.trialDays : existing.trial_days
    const trialValidation = validateFreePlanTrialDays(planCode, trialDaysToValidate)
    if (!trialValidation.valid) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: trialValidation.message },
        requestId: req.requestId,
      })
    }

    let validationWarnings = []
    if (updateData.limits !== undefined) {
      const { rows: peerPlans } = await query(
        `SELECT code, limits FROM subscription_plan WHERE tenant_type = $1 AND id != $2`,
        [planTenantType, id]
      )
      validationWarnings = buildTierLadderWarnings(planCode, limitsForValidation, peerPlans)
      if (validationWarnings.length > 0) {
        logger.warn('Plan update tier ladder warnings', {
          planId: id,
          planCode,
          validationWarnings,
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
      data: { plan: updated, validationWarnings },
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

    // One subscription per tenant: prefer ACTIVE, then TRIALING, then most recent
    const { rows: subscriptions } = await query(
      `
      SELECT sub.*,
        sp.code as plan_code,
        sp.price_per_month, sp.price_per_year, sp.limits as plan_limits, sp.features as plan_features,
        COALESCE(
          CASE WHEN sub.tenant_type = 'SUPPLIER' THEN su.name ELSE NULL END,
          CASE WHEN sub.tenant_type = 'RESTAURANT' THEN r.name ELSE NULL END
        ) as tenant_name,
        COALESCE(su.contact_email, r.contact_email) as tenant_email
      FROM (
        SELECT DISTINCT ON (s.tenant_id, s.tenant_type) s.*
        FROM subscription s
        ${whereClause}
        ORDER BY s.tenant_id, s.tenant_type,
          CASE s.status WHEN 'ACTIVE' THEN 1 WHEN 'TRIALING' THEN 2 ELSE 3 END,
          s.created_at DESC
      ) sub
      JOIN subscription_plan sp ON sp.id = sub.plan_id
      LEFT JOIN supplier su ON (sub.tenant_id = su.id AND sub.tenant_type = 'SUPPLIER')
      LEFT JOIN restaurant r ON (sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT')
      ORDER BY sub.created_at DESC
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
    const requestedSub = subRows[0]
    const billing = await resolveActiveBillingSubscription(
      requestedSub.tenant_id,
      requestedSub.tenant_type
    )
    if (!billing.subscription) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'No active subscription on the billing tenant for this organization.',
        },
        requestId: req.requestId,
      })
    }
    const sub =
      billing.subscription.id === requestedSub.id
        ? requestedSub
        : await query(
            `SELECT s.*, sp.limits as current_limits, sp.features as current_features
             FROM subscription s
             JOIN subscription_plan sp ON sp.id = s.plan_id
             WHERE s.id = $1`,
            [billing.subscription.id]
          ).then((r) => r.rows[0])
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

    let existing = existingSubs[0]
    let subscriptionId = id
    let appliedViaOrgBilling = false

    if (updateData.planId) {
      const billing = await resolveActiveBillingSubscription(
        existing.tenant_id,
        existing.tenant_type
      )
      if (!billing.subscription) {
        res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'VALIDATION_ERROR',
            message: 'No active subscription on the billing tenant for this organization.',
          },
          requestId: req.requestId,
        })
        return
      }
      if (billing.subscription.id !== existing.id) {
        const { rows: billingFull } = await query('SELECT * FROM subscription WHERE id = $1', [
          billing.subscription.id,
        ])
        if (billingFull.length === 0) {
          res.status(404).json({
            ok: false,
            data: null,
            error: { name: 'NOT_FOUND', message: 'Billing subscription not found' },
            requestId: req.requestId,
          })
          return
        }
        existing = billingFull[0]
        subscriptionId = billing.subscription.id
        appliedViaOrgBilling = billing.usesOrgBilling
      }
    }

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
            recordConversionEvent(
              existing.tenant_id,
              existing.tenant_type,
              'DOWNGRADE_ATTEMPT_BLOCKED',
              {
                limitKeys: willExceed.map((e) => e.limitKey),
                targetPlanCode: newPlan.code,
              }
            ).catch(() => {})
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

    values.push(subscriptionId)

    if (updates.length === 0) {
      res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'No subscription fields to update (provide planId and/or status)',
        },
        requestId: req.requestId,
      })
      return
    }

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

    if (
      existing.lock_reason === 'pending_activation' &&
      (updateData.planId || updateData.status === 'ACTIVE')
    ) {
      await unlockSubscriptionAccount(subscriptionId, {
        unlockedBy: 'admin',
        adminUserId: req.userData.id,
      })
    }

    if (updateData.planId && (newPlan || planChangeApplyAtPeriodEnd)) {
      try {
        await query(
          `
          INSERT INTO subscription_change_log (subscription_id, from_plan_id, to_plan_id, changed_by_admin_id, reason)
          VALUES ($1, $2, $3, $4, $5)
        `,
          [
            subscriptionId,
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
        subscription_id: subscriptionId,
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

    invalidateTenantSubscriptionCache(existing.tenant_id, existing.tenant_type).catch(() => {})
    try {
      const { emitEntitlementsRefreshNotice } = await import('../lib/socket.js')
      emitEntitlementsRefreshNotice({
        tenantId: existing.tenant_id,
        tenantType: existing.tenant_type,
        reason: 'admin_subscription_update',
      })
    } catch (emitErr) {
      logger.warn('emitEntitlementsRefreshNotice failed', { error: emitErr.message })
    }
    res.json({
      ok: true,
      data: {
        subscription: updated,
        appliedViaOrgBilling,
        billingTenantId: existing.tenant_id,
      },
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

/**
 * POST /subscriptions/:id/extend-free-trial — extend Free Trial expiry and unlock.
 * Body: { days?: number } — clamped to 3–7 (platform default when omitted).
 */
router.post('/subscriptions/:id/extend-free-trial', async (req, res) => {
  try {
    const { id } = req.params
    const rawDays = req.body?.days ?? req.body?.freeTrialDays
    const days = rawDays !== undefined && rawDays !== null ? Number(rawDays) : undefined

    if (days !== undefined && (!Number.isFinite(days) || days < 3 || days > 7)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'freeTrialDays must be between 3 and 7',
        },
        requestId: req.requestId,
      })
    }

    const { rows } = await query('SELECT * FROM subscription WHERE id = $1', [id])
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Subscription not found' },
        requestId: req.requestId,
      })
    }

    const existing = rows[0]
    const result = await extendFreeSandboxTrial(id, {
      days: days !== undefined ? clampFreeTrialDays(days) : undefined,
      adminUserId: req.userData.id,
      unlockedBy: 'admin',
    })

    const updated = result.subscription

    await logAudit(
      req,
      'subscription.free_trial_extended',
      `Extended Free Trial for subscription ${id} by ${result.freeTrialDays} day(s)`,
      'subscription',
      id,
      existing,
      updated,
      {
        target_tenant_id: existing.tenant_id,
        target_tenant_type: existing.tenant_type,
        freeTrialDays: result.freeTrialDays,
      }
    )
    await writeAuditLog(req, {
      action_type: 'billing.free_trial.extended',
      tenant_type: existing.tenant_type,
      tenant_id: existing.tenant_id,
      target_id: id,
      payload_json: {
        adminUserId: req.userData.id,
        freeTrialDays: result.freeTrialDays,
        freeSandboxExpiresAt: result.freeSandboxExpiresAt,
      },
    })

    invalidateTenantSubscriptionCache(existing.tenant_id, existing.tenant_type).catch(() => {})
    try {
      const { emitEntitlementsRefreshNotice } = await import('../lib/socket.js')
      emitEntitlementsRefreshNotice({
        tenantId: existing.tenant_id,
        tenantType: existing.tenant_type,
        reason: 'admin_free_trial_extended',
      })
    } catch (emitErr) {
      logger.warn('emitEntitlementsRefreshNotice failed', { error: emitErr.message })
    }

    res.json({
      ok: true,
      data: {
        subscription: updated,
        freeTrialDays: result.freeTrialDays,
        freeSandboxExpiresAt: result.freeSandboxExpiresAt,
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: error.message },
        requestId: req.requestId,
      })
    }
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Extend free trial error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to extend Free Trial' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /subscriptions/:id/unlock — clear lock (overdue payment resolved or admin activation).
 * For expired Free Trial, also extends free_sandbox_expires_at (body: freeTrialDays 3–7).
 */
router.post('/subscriptions/:id/unlock', async (req, res) => {
  try {
    const { id } = req.params
    const reason = (req.body?.reason || 'admin_unlock').trim()
    const rawTrialDays = req.body?.freeTrialDays ?? req.body?.days
    const extendFreeTrialDays =
      rawTrialDays !== undefined && rawTrialDays !== null ? Number(rawTrialDays) : undefined

    if (
      extendFreeTrialDays !== undefined &&
      (!Number.isFinite(extendFreeTrialDays) || extendFreeTrialDays < 3 || extendFreeTrialDays > 7)
    ) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'freeTrialDays must be between 3 and 7',
        },
        requestId: req.requestId,
      })
    }

    const { rows } = await query('SELECT * FROM subscription WHERE id = $1', [id])
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Subscription not found' },
        requestId: req.requestId,
      })
    }

    const existing = rows[0]
    await unlockSubscriptionAccount(id, {
      unlockedBy: 'admin',
      adminUserId: req.userData.id,
      extendFreeTrialDays,
    })

    await query(
      `UPDATE billing_invoice SET status = 'VOID', updated_at = now()
       WHERE subscription_id = $1 AND status = 'OPEN'`,
      [id]
    )

    const { rows: updatedRows } = await query('SELECT * FROM subscription WHERE id = $1', [id])
    const updated = updatedRows[0]

    await logAudit(
      req,
      'subscription.unlocked',
      `Unlocked subscription ${id} (billing)`,
      'subscription',
      id,
      existing,
      updated,
      {
        target_tenant_id: existing.tenant_id,
        target_tenant_type: existing.tenant_type,
        reason,
      }
    )
    await writeAuditLog(req, {
      action_type: 'billing.account.unlocked',
      tenant_type: existing.tenant_type,
      tenant_id: existing.tenant_id,
      target_id: id,
      payload_json: { reason, adminUserId: req.userData.id },
    })

    invalidateTenantSubscriptionCache(existing.tenant_id, existing.tenant_type).catch(() => {})
    try {
      const { emitEntitlementsRefreshNotice } = await import('../lib/socket.js')
      emitEntitlementsRefreshNotice({
        tenantId: existing.tenant_id,
        tenantType: existing.tenant_type,
        reason: 'admin_account_unlocked',
      })
    } catch (emitErr) {
      logger.warn('emitEntitlementsRefreshNotice failed', { error: emitErr.message })
    }

    res.json({
      ok: true,
      data: { subscription: updated },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({
        ok: false,
        data: null,
        error: {
          name: 'MIGRATION_REQUIRED',
          message: 'Run migration 0067_subscription_billing.sql',
        },
        requestId: req.requestId,
      })
    }
    logger.error('Unlock subscription error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to unlock subscription' },
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
    const {
      limit = 50,
      offset = 0,
      tenantId,
      actionType,
      adminId,
      dateFrom,
      dateTo,
      search,
    } = req.query

    const conditions = []
    const params = []
    let paramIndex = 1

    if (tenantId) {
      conditions.push(`target_tenant_id = $${paramIndex++}`)
      params.push(tenantId)
    }
    if (actionType && actionType !== 'all') {
      conditions.push(`action_type = $${paramIndex++}`)
      params.push(actionType)
    }
    if (adminId) {
      conditions.push(`admin_user_id = $${paramIndex++}`)
      params.push(adminId)
    }
    if (dateFrom) {
      conditions.push(`created_at >= $${paramIndex++}`)
      params.push(new Date(dateFrom).toISOString())
    }
    if (dateTo) {
      conditions.push(`created_at <= $${paramIndex++}`)
      params.push(new Date(dateTo + 'T23:59:59').toISOString())
    }
    if (search) {
      conditions.push(
        `(action_description ILIKE $${paramIndex} OR admin_name ILIKE $${paramIndex} OR action_type ILIKE $${paramIndex})`
      )
      params.push(`%${search}%`)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Total count for pagination
    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM admin_audit_log ${whereClause}`,
      params
    )
    const total = parseInt(countRows[0].count)

    params.push(parseInt(limit), parseInt(offset))
    const { rows: logs } = await query(
      `SELECT * FROM admin_audit_log ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    )

    // Also get distinct action types for filter dropdown
    const { rows: actionTypes } = await query(
      `SELECT DISTINCT action_type FROM admin_audit_log ORDER BY action_type`
    )

    res.json({
      ok: true,
      data: {
        logs,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        actionTypes: actionTypes.map((r) => r.action_type),
      },
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
  /** Required when target tenant subscription is SUSPENDED or inactive */
  acknowledgeSuspended: z.boolean().optional(),
})

/**
 * POST /api/admin-dashboard/impersonate
 * Start impersonating a tenant (Restaurant or Supplier). Cannot impersonate an admin.
 */
router.post('/impersonate', async (req, res) => {
  try {
    const { tenantId, tenantType, acknowledgeSuspended } = impersonateSchema.parse(req.body)

    // Resolve tenant and ensure it is not an admin user (no app_user with ADMIN for this tenant)
    const table = tenantType === 'RESTAURANT' ? 'restaurant' : 'supplier'
    const { rows: tenants } = await query(
      `SELECT id, name, contact_email, is_branch_active FROM ${table} WHERE id = $1`,
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

    const { rows: subRows } = await query(
      `SELECT status FROM subscription WHERE tenant_id = $1 AND tenant_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [tenantId, tenantType]
    )
    const subStatus = subRows[0]?.status
    const tenantInactive = tenant.is_branch_active === false
    const subRestricted = subStatus === 'SUSPENDED' || subStatus === 'CANCELLED'
    if ((tenantInactive || subRestricted) && !acknowledgeSuspended) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'TENANT_SUSPENDED',
          message:
            'This tenant is inactive or suspended. Confirm to impersonate for support purposes.',
          requiresAcknowledgement: true,
          tenantInactive,
          subscriptionStatus: subStatus || null,
        },
        requestId: req.requestId,
      })
    }

    const sessionId = randomUUID()
    const token = await createImpersonationToken({
      adminUserId: req.userData.id,
      tenantId,
      tenantType,
      tenantName: tenant.name || tenant.contact_email || tenantId,
      sessionId,
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
      {
        target_tenant_type: tenantType,
        impersonation_session_id: sessionId,
        acknowledged_suspended: Boolean(acknowledgeSuspended),
      }
    )

    logger.info('Impersonation started', {
      adminUserId: req.userData.id,
      tenantId,
      tenantType,
      requestId: req.requestId,
    })

    res.json({
      ok: true,
      data: {
        tenantId,
        tenantType,
        tenantName: tenant.name,
        expiresAt: expiresAt.toISOString(),
        redirectTo: '/app/dashboard',
      },
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
    clearImpersonationCookie(res)
    clearActiveTenantCookie(res)

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
        sessionId: ctx?.sessionId || effective.sessionId || null,
        realAdminUserId: ctx?.adminUserId || req.userData?.id || null,
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
// USER PASSWORD MANAGEMENT
// ========================================

const adminResetPasswordSchema = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().optional(),
    password: z.string().min(10).optional(),
    temporary: z.boolean().optional(),
    generate: z.boolean().optional(),
  })
  .refine((body) => Boolean(body.userId || body.email), {
    message: 'userId or email is required',
  })

/**
 * GET /api/admin-dashboard/users?search=&tenantId=&tenantType=
 */
router.get('/users', async (req, res) => {
  try {
    const tenantType = req.query.tenantType ? String(req.query.tenantType).toUpperCase() : undefined
    if (tenantType && tenantType !== 'RESTAURANT' && tenantType !== 'SUPPLIER') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'tenantType must be RESTAURANT or SUPPLIER' },
        requestId: req.requestId,
      })
    }
    const users = await listAdminUsers({
      search: req.query.search || req.query.q || '',
      tenantId: req.query.tenantId ? String(req.query.tenantId) : undefined,
      tenantType,
      limit: req.query.limit,
    })
    res.json({
      ok: true,
      data: { users },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List admin users error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list users' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/admin-dashboard/users/reset-password
 * Reset a tenant or staff user's Keycloak password (admin support).
 */
router.post('/users/reset-password', async (req, res) => {
  try {
    const body = adminResetPasswordSchema.parse(req.body)
    const result = await adminResetUserPassword({
      actorUserId: req.userData.id,
      targetUserId: body.userId,
      email: body.email,
      password: body.password,
      temporary: body.temporary ?? true,
      generate: body.generate ?? !body.password,
    })

    await logAudit(
      req,
      'ADMIN_RESET_USER_PASSWORD',
      `Reset password for ${result.email}`,
      'USER',
      result.userId,
      null,
      { temporary: result.temporary },
      { target_email: result.email, target_role: result.role }
    )

    res.json({
      ok: true,
      data: result,
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
    const status = error.status || 500
    if (status < 500) {
      return res.status(status).json({
        ok: false,
        data: null,
        error: { name: error.name || 'ERROR', message: error.message },
        requestId: req.requestId,
      })
    }
    logger.error('Admin reset password error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to reset password' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// TENANT MANAGEMENT
// ========================================

/** Align admin tenant rows with the subscription row used for entitlements (org main branch). */
async function attachBillingSubscriptionFields(rows, tenantType) {
  await Promise.all(
    rows.map(async (row) => {
      const billing = await resolveActiveBillingSubscription(row.id, tenantType)
      if (!billing.subscription) return
      row.subscription_id = billing.subscription.id
      row.uses_org_billing = billing.usesOrgBilling
      row.billing_tenant_id = billing.billingTenantId
      row.subscription_status = billing.subscription.status
      row.plan_name = billing.subscription.plan_name
      if (billing.subscription.plan_id) {
        const { rows: planRows } = await query('SELECT code FROM subscription_plan WHERE id = $1', [
          billing.subscription.plan_id,
        ])
        row.plan_code = planRows[0]?.code ?? row.plan_code
      }
    })
  )
}

// Get suppliers with detailed info
router.get('/tenants/suppliers', async (req, res) => {
  try {
    const { limit, offset } = parseAdminListPagination(req.query)
    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM supplier`)
    const total = countRows[0]?.total ?? 0

    const { rows: suppliers } = await query(
      `
      SELECT 
        s.*,
        sub.status as subscription_status,
        sub.plan_name,
        sp.code as plan_code,
        sub.id as subscription_id,
        COALESCE(pc.product_count, 0)::int as product_count,
        COALESCE(wc.warehouse_count, 0)::int as warehouse_count,
        COALESCE(rev.total_revenue, 0)::numeric(12,2) as total_revenue
      FROM supplier s
      LEFT JOIN subscription sub ON sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER' AND sub.status IN ('ACTIVE', 'TRIALING')
      LEFT JOIN subscription_plan sp ON sp.id = sub.plan_id
      LEFT JOIN (
        SELECT supplier_id, COUNT(*)::int AS product_count FROM product GROUP BY supplier_id
      ) pc ON pc.supplier_id = s.id
      LEFT JOIN (
        SELECT supplier_id, COUNT(*)::int AS warehouse_count
        FROM warehouse WHERE is_active = true GROUP BY supplier_id
      ) wc ON wc.supplier_id = s.id
      LEFT JOIN (
        SELECT oi.supplier_id, COALESCE(SUM(oi.line_total), 0) AS total_revenue
        FROM order_item oi
        JOIN customer_order o ON o.id = oi.order_id
        WHERE ${deliveredOrderStatusInSql('o.status')}
        GROUP BY oi.supplier_id
      ) rev ON rev.supplier_id = s.id
      ORDER BY s.name
      LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    )

    await attachBillingSubscriptionFields(suppliers, 'SUPPLIER')

    res.json({
      ok: true,
      data: { suppliers, total, limit, offset },
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
    const { limit, offset } = parseAdminListPagination(req.query)
    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM restaurant`)
    const total = countRows[0]?.total ?? 0

    const { rows: restaurants } = await query(
      `
      SELECT 
        r.*,
        sub.status as subscription_status,
        sub.plan_name,
        sp.code as plan_code,
        sub.id as subscription_id,
        COALESCE(oc.order_count, 0)::int as order_count,
        COALESCE(oc.total_spent, 0)::numeric(12,2) as total_spent,
        COALESCE(oc.orders_last_30d, 0)::int as orders_last_30d
      FROM restaurant r
      LEFT JOIN subscription sub ON sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT' AND sub.status IN ('ACTIVE', 'TRIALING')
      LEFT JOIN subscription_plan sp ON sp.id = sub.plan_id
      LEFT JOIN (
        SELECT
          restaurant_id,
          COUNT(*)::int AS order_count,
          COALESCE(SUM(total_amount) FILTER (WHERE ${deliveredOrderStatusInSql()}), 0) AS total_spent,
          COUNT(*) FILTER (WHERE placed_at >= NOW() - INTERVAL '30 days')::int AS orders_last_30d
        FROM customer_order
        GROUP BY restaurant_id
      ) oc ON oc.restaurant_id = r.id
      ORDER BY r.name
      LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    )

    await attachBillingSubscriptionFields(restaurants, 'RESTAURANT')

    res.json({
      ok: true,
      data: { restaurants, total, limit, offset },
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

/**
 * GET /api/admin-dashboard/tenants/search?q=&type=RESTAURANT|SUPPLIER&orgMainOnly=true
 * Lightweight tenant lookup for admin limits / billing tools.
 */
router.get('/tenants/search', async (req, res) => {
  try {
    const q = String(req.query.q || '')
      .trim()
      .toLowerCase()
    const type = req.query.type ? String(req.query.type).toUpperCase() : null
    const orgMainOnly = req.query.orgMainOnly === 'true'
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100)

    const results = []

    const matchesQuery = (row) => {
      if (!q) return true
      const haystack = [
        row.name,
        row.slug,
        row.contact_email,
        row.sales_contact_email,
        row.plan_code,
        row.plan_name,
        row.subscription_status,
        row.id,
        row.tenant_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    }

    if (!type || type === 'SUPPLIER') {
      const { rows } = await query(`
        SELECT
          s.id,
          s.name,
          s.slug,
          s.organization_id,
          s.is_main_branch,
          COALESCE(s.contact_email, s.sales_contact_email, s.accounting_contact_email) AS contact_email,
          sub.status AS subscription_status,
          sub.plan_name,
          (SELECT sp.code FROM subscription_plan sp WHERE sp.id = sub.plan_id LIMIT 1) AS plan_code,
          'SUPPLIER' AS tenant_type
        FROM supplier s
        LEFT JOIN subscription sub ON sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER'
          AND sub.status IN ('ACTIVE', 'TRIALING')
        ORDER BY s.name
      `)
      for (const row of rows) {
        if (orgMainOnly && row.is_main_branch === false) continue
        if (!matchesQuery(row)) continue
        results.push(row)
      }
    }

    if (!type || type === 'RESTAURANT') {
      const { rows } = await query(`
        SELECT
          r.id,
          r.name,
          r.slug,
          r.organization_id,
          r.is_main_branch,
          r.contact_email,
          sub.status AS subscription_status,
          sub.plan_name,
          (SELECT sp.code FROM subscription_plan sp WHERE sp.id = sub.plan_id LIMIT 1) AS plan_code,
          'RESTAURANT' AS tenant_type
        FROM restaurant r
        LEFT JOIN subscription sub ON sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT'
          AND sub.status IN ('ACTIVE', 'TRIALING')
        ORDER BY r.name
      `)
      for (const row of rows) {
        if (orgMainOnly && row.is_main_branch === false) continue
        if (!matchesQuery(row)) continue
        results.push(row)
      }
    }

    results.sort((a, b) => String(a.name).localeCompare(String(b.name)))

    res.json({
      ok: true,
      data: { tenants: results.slice(0, limit) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Tenant search error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to search tenants' },
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
    const normalizedType = tenantType.toUpperCase()
    if (!['RESTAURANT', 'SUPPLIER'].includes(normalizedType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'tenantType must be RESTAURANT or SUPPLIER' },
        requestId: req.requestId,
      })
    }
    const body = z
      .object({
        limit_type: z.string().min(1),
        override_value: z.number().int().nonnegative(),
        expiration_date: z.string().datetime().optional().nullable(),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(req.body)
    const { limit_type, override_value, expiration_date, reason } = body

    const allowedKeys = await discoverLimitKeys(normalizedType)
    if (!allowedKeys.includes(limit_type)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: `Invalid limit key: ${limit_type}` },
        requestId: req.requestId,
      })
    }

    const { rows: existingRows } = await query(
      `SELECT * FROM tenant_limit_override WHERE tenant_id = $1 AND tenant_type = $2 AND limit_type = $3`,
      [tenantId, normalizedType, limit_type]
    )
    const isUpdate = existingRows.length > 0
    const oldValue = existingRows[0]?.override_value ?? null

    const { rows: overrides } = await query(
      `
      INSERT INTO tenant_limit_override (
        tenant_id, tenant_type, limit_type, override_value, expiration_date, reason, created_by, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      ON CONFLICT (tenant_id, tenant_type, limit_type)
      DO UPDATE SET
        override_value = EXCLUDED.override_value,
        expiration_date = EXCLUDED.expiration_date,
        reason = EXCLUDED.reason,
        is_active = TRUE,
        updated_at = now()
      RETURNING *
    `,
      [
        tenantId,
        normalizedType,
        limit_type,
        override_value,
        expiration_date || null,
        reason || null,
        req.userData.id,
      ]
    )

    await invalidateTenantSubscriptionCache(tenantId, normalizedType)

    await logAudit(
      req,
      isUpdate ? 'override.update' : 'OVERRIDE_LIMIT',
      isUpdate
        ? `Updated ${limit_type} override: ${oldValue} → ${override_value}`
        : `Granted ${limit_type} override: ${override_value}`,
      normalizedType,
      tenantId,
      isUpdate ? existingRows[0] : null,
      {
        limit_type,
        override_value,
        expiration_date,
        reason,
        old_value: oldValue,
        new_value: override_value,
      }
    )

    res.json({
      ok: true,
      data: { override: overrides[0] },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid body' },
        requestId: req.requestId,
      })
    }
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

    await invalidateTenantSubscriptionCache(deleted[0].tenant_id, deleted[0].tenant_type)

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
    const effectiveFeatures = await getEffectiveFeaturesForTenant(id, tenantType)
    res.json({
      ok: true,
      data: { entitlements, effectiveFeatures },
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

/**
 * GET /api/admin-dashboard/limit-keys?tenantType=RESTAURANT|SUPPLIER
 */
router.get('/limit-keys', async (req, res) => {
  try {
    const tenantType = req.query.tenantType ? String(req.query.tenantType).toUpperCase() : null
    if (tenantType && !['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid tenantType' },
        requestId: req.requestId,
      })
    }
    const keys = await discoverLimitKeys(tenantType || undefined)
    res.json({ ok: true, data: { keys }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('List limit keys error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list limit keys' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/admin-dashboard/limit-overrides
 */
router.get('/limit-overrides', async (req, res) => {
  try {
    const { tenantType, tenantId, planId, limitKey, active } = req.query
    const params = []
    const tenantClauses = []
    if (tenantType) {
      params.push(String(tenantType).toUpperCase())
      tenantClauses.push(`tlo.tenant_type = $${params.length}`)
    }
    if (tenantId) {
      params.push(String(tenantId))
      tenantClauses.push(`tlo.tenant_id = $${params.length}`)
    }
    if (limitKey) {
      params.push(String(limitKey))
      tenantClauses.push(`tlo.limit_type = $${params.length}`)
    }
    if (active === 'true') tenantClauses.push(`tlo.is_active = TRUE`)
    if (active === 'false') tenantClauses.push(`tlo.is_active = FALSE`)

    const tenantWhere = tenantClauses.length ? `WHERE ${tenantClauses.join(' AND ')}` : ''

    const { rows: tenantOverrides } = await query(
      `
      SELECT tlo.*, sp.name AS plan_name, sp.code AS plan_code
      FROM tenant_limit_override tlo
      LEFT JOIN subscription s ON s.tenant_id = tlo.tenant_id AND s.tenant_type = tlo.tenant_type
        AND s.status IN ('ACTIVE', 'TRIALING')
      LEFT JOIN subscription_plan sp ON sp.id = s.plan_id
      ${tenantWhere}
      ORDER BY tlo.updated_at DESC
      LIMIT 200
      `,
      params
    )

    const planParams = []
    const planClauses = []
    if (planId) {
      planParams.push(String(planId))
      planClauses.push(`plo.plan_id = $${planParams.length}`)
    }
    if (limitKey) {
      planParams.push(String(limitKey))
      planClauses.push(`plo.limit_type = $${planParams.length}`)
    }
    if (active === 'true') planClauses.push(`plo.is_active = TRUE`)
    if (active === 'false') planClauses.push(`plo.is_active = FALSE`)
    const planWhere = planClauses.length ? `WHERE ${planClauses.join(' AND ')}` : ''

    const { rows: planOverrides } = await query(
      `
      SELECT plo.*, sp.name AS plan_name, sp.code AS plan_code, sp.tenant_type
      FROM plan_limit_override plo
      JOIN subscription_plan sp ON sp.id = plo.plan_id
      ${planWhere}
      ORDER BY plo.updated_at DESC
      LIMIT 200
      `,
      planParams
    )

    res.json({
      ok: true,
      data: { tenantOverrides, planOverrides },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List limit overrides error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list overrides' },
      requestId: req.requestId,
    })
  }
})

/**
 * POST /api/admin-dashboard/plans/:planId/override-limit
 */
router.post('/plans/:planId/override-limit', async (req, res) => {
  try {
    const { planId } = req.params
    const body = z
      .object({
        limit_type: z.string().min(1),
        override_value: z.number().int().nonnegative(),
        expiration_date: z.string().datetime().optional().nullable(),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(req.body)

    const { rows: plans } = await query(`SELECT * FROM subscription_plan WHERE id = $1`, [planId])
    if (!plans.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Plan not found' },
        requestId: req.requestId,
      })
    }
    const plan = plans[0]
    const tenantType = plan.tenant_type || 'RESTAURANT'
    if (!isLimitKeyApplicable(tenantType, body.limit_type)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: `Limit "${body.limit_type}" is not applicable for ${tenantType} plans`,
        },
        requestId: req.requestId,
      })
    }
    const allowedKeys = await discoverLimitKeys(tenantType)
    if (!allowedKeys.includes(body.limit_type)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: `Invalid limit key: ${body.limit_type}` },
        requestId: req.requestId,
      })
    }

    const { rows: existingRows } = await query(
      `SELECT * FROM plan_limit_override WHERE plan_id = $1 AND limit_type = $2`,
      [planId, body.limit_type]
    )
    const oldValue = existingRows[0]?.override_value ?? null

    const { rows } = await query(
      `
      INSERT INTO plan_limit_override (
        plan_id, limit_type, override_value, expiration_date, reason, created_by, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      ON CONFLICT (plan_id, limit_type)
      DO UPDATE SET
        override_value = EXCLUDED.override_value,
        expiration_date = EXCLUDED.expiration_date,
        reason = EXCLUDED.reason,
        is_active = TRUE,
        updated_at = now()
      RETURNING *
      `,
      [
        planId,
        body.limit_type,
        body.override_value,
        body.expiration_date || null,
        body.reason || null,
        req.userData.id,
      ]
    )

    await logAudit(
      req,
      existingRows.length ? 'plan_override.update' : 'plan_override.create',
      `Plan ${plan.code} ${body.limit_type}: ${oldValue ?? 'default'} → ${body.override_value}`,
      plan.tenant_type,
      planId,
      existingRows[0] || null,
      {
        limit_type: body.limit_type,
        old_value: oldValue,
        new_value: body.override_value,
        expiration_date: body.expiration_date,
        reason: body.reason,
      }
    )

    res.json({ ok: true, data: { override: rows[0] }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid body' },
        requestId: req.requestId,
      })
    }
    logger.error('Plan override error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to set plan override' },
      requestId: req.requestId,
    })
  }
})

/**
 * PATCH /api/admin-dashboard/plan-overrides/:overrideId
 */
router.patch('/plan-overrides/:overrideId', async (req, res) => {
  try {
    const body = z
      .object({
        override_value: z.number().int().nonnegative().optional(),
        expiration_date: z.string().datetime().optional().nullable(),
        reason: z.string().max(500).optional().nullable(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body)

    const { rows: existing } = await query(`SELECT * FROM plan_limit_override WHERE id = $1`, [
      req.params.overrideId,
    ])
    if (!existing.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Override not found' },
        requestId: req.requestId,
      })
    }

    const fields = []
    const values = []
    let i = 1
    for (const [key, col] of [
      ['override_value', 'override_value'],
      ['expiration_date', 'expiration_date'],
      ['reason', 'reason'],
      ['is_active', 'is_active'],
    ]) {
      if (body[key] !== undefined) {
        fields.push(`${col} = $${i++}`)
        values.push(body[key])
      }
    }
    if (!fields.length) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'No fields to update' },
        requestId: req.requestId,
      })
    }
    fields.push('updated_at = now()')
    values.push(req.params.overrideId)
    const { rows } = await query(
      `UPDATE plan_limit_override SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    )

    await logAudit(
      req,
      body.is_active === false ? 'plan_override.disable' : 'plan_override.update',
      `Updated plan override ${existing[0].limit_type}`,
      null,
      existing[0].plan_id,
      existing[0],
      { ...body, old_value: existing[0].override_value, new_value: rows[0].override_value }
    )

    res.json({ ok: true, data: { override: rows[0] }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid body' },
        requestId: req.requestId,
      })
    }
    logger.error('Update plan override error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update plan override' },
      requestId: req.requestId,
    })
  }
})

/**
 * PATCH /api/admin-dashboard/tenant-overrides/:overrideId
 */
router.patch('/tenant-overrides/:overrideId', async (req, res) => {
  try {
    const body = z
      .object({
        override_value: z.number().int().nonnegative().optional(),
        expiration_date: z.string().datetime().optional().nullable(),
        reason: z.string().max(500).optional().nullable(),
        is_active: z.boolean().optional(),
      })
      .parse(req.body)

    const { rows: existing } = await query(`SELECT * FROM tenant_limit_override WHERE id = $1`, [
      req.params.overrideId,
    ])
    if (!existing.length) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Override not found' },
        requestId: req.requestId,
      })
    }

    const fields = []
    const values = []
    let i = 1
    for (const [key, col] of [
      ['override_value', 'override_value'],
      ['expiration_date', 'expiration_date'],
      ['reason', 'reason'],
      ['is_active', 'is_active'],
    ]) {
      if (body[key] !== undefined) {
        fields.push(`${col} = $${i++}`)
        values.push(body[key])
      }
    }
    if (!fields.length) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'No fields to update' },
        requestId: req.requestId,
      })
    }
    fields.push('updated_at = now()')
    values.push(req.params.overrideId)
    const { rows } = await query(
      `UPDATE tenant_limit_override SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    )

    await invalidateTenantSubscriptionCache(existing[0].tenant_id, existing[0].tenant_type)

    await logAudit(
      req,
      body.is_active === false ? 'override.disable' : 'override.update',
      `Updated tenant override ${existing[0].limit_type}`,
      existing[0].tenant_type,
      existing[0].tenant_id,
      existing[0],
      { ...body, old_value: existing[0].override_value, new_value: rows[0].override_value }
    )

    res.json({ ok: true, data: { override: rows[0] }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid body' },
        requestId: req.requestId,
      })
    }
    logger.error('Update tenant override error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update tenant override' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/admin-dashboard/tenants/:tenantType/:id/subscription-addons
 */
router.get('/tenants/:tenantType/:id/subscription-addons', async (req, res) => {
  try {
    const tenantType = req.params.tenantType.toUpperCase()
    const { id: tenantId } = req.params
    if (!['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid tenantType' },
        requestId: req.requestId,
      })
    }
    const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
    const entitlements = await getEntitlements(tenantId, tenantType)
    const addons = await getActiveTenantAddons(billingTenantId, tenantType)
    const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
    const { rows: tenantRows } = await query(`SELECT id, name FROM ${table} WHERE id = $1`, [
      tenantId,
    ])
    const { rows: billingRows } =
      billingTenantId !== tenantId
        ? await query(`SELECT id, name FROM ${table} WHERE id = $1`, [billingTenantId])
        : tenantRows
    res.json({
      ok: true,
      data: {
        billingTenantId,
        tenantName: tenantRows[0]?.name ?? null,
        billingTenantName: billingRows[0]?.name ?? tenantRows[0]?.name ?? null,
        usesOrgBilling: billingTenantId !== tenantId,
        addons,
        locationLimits: entitlements?.locationLimits ?? {},
        planCode: entitlements?.plan?.code ?? null,
        planName: entitlements?.plan?.name ?? null,
        overrides: entitlements?.overrides ?? [],
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get subscription addons error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get subscription add-ons' },
      requestId: req.requestId,
    })
  }
})

/**
 * PUT /api/admin-dashboard/tenants/:tenantType/:id/subscription-addons/:addonKey
 * Upsert active add-on quantity (admin-granted).
 */
router.put('/tenants/:tenantType/:id/subscription-addons/:addonKey', async (req, res) => {
  try {
    const tenantType = req.params.tenantType.toUpperCase()
    const { id: tenantId, addonKey } = req.params
    if (!['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid tenantType' },
        requestId: req.requestId,
      })
    }
    if (!isAddonKeyValidForTenant(tenantType, addonKey)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: `Invalid add-on key for ${tenantType}` },
        requestId: req.requestId,
      })
    }

    const body = z
      .object({
        quantity: z.number().int().min(0).max(99),
        unit_price_monthly: z.number().min(0).optional().nullable(),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(req.body)

    const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
    const entitlements = await getEntitlements(tenantId, tenantType)
    const planCode = entitlements?.plan?.code ?? 'gold'

    if (body.quantity === 0) {
      await query(
        `UPDATE tenant_subscription_addon
         SET status = 'cancelled', ends_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND tenant_type = $2 AND addon_key = $3 AND status = 'active'`,
        [billingTenantId, tenantType, addonKey]
      )
      await invalidateTenantSubscriptionCache(billingTenantId, tenantType)
      return res.json({
        ok: true,
        data: { addon: null, cancelled: true },
        error: null,
        requestId: req.requestId,
      })
    }

    const unitPrice = body.unit_price_monthly ?? defaultAddonUnitPrice(addonKey, planCode) ?? null

    const { rows: existing } = await query(
      `SELECT * FROM tenant_subscription_addon
       WHERE tenant_id = $1 AND tenant_type = $2 AND addon_key = $3 AND status = 'active'`,
      [billingTenantId, tenantType, addonKey]
    )

    let addon
    if (existing.length > 0) {
      const { rows } = await query(
        `UPDATE tenant_subscription_addon
         SET quantity = $1, unit_price_monthly = COALESCE($2, unit_price_monthly),
             metadata = metadata || $3::jsonb, updated_at = now()
         WHERE id = $4
         RETURNING *`,
        [
          body.quantity,
          unitPrice,
          JSON.stringify({ admin_reason: body.reason || null }),
          existing[0].id,
        ]
      )
      addon = rows[0]
    } else {
      const { rows } = await query(
        `INSERT INTO tenant_subscription_addon (
           tenant_id, tenant_type, addon_key, quantity, unit_price_monthly, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *`,
        [
          billingTenantId,
          tenantType,
          addonKey,
          body.quantity,
          unitPrice,
          JSON.stringify({ admin_reason: body.reason || null }),
        ]
      )
      addon = rows[0]
    }

    await invalidateTenantSubscriptionCache(billingTenantId, tenantType)

    await logAudit(
      req,
      'addon.upsert',
      `Set ${addonKey} quantity=${body.quantity} for billing tenant`,
      tenantType,
      billingTenantId,
      existing[0] || null,
      addon
    )

    res.json({ ok: true, data: { addon }, error: null, requestId: req.requestId })
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid body' },
        requestId: req.requestId,
      })
    }
    logger.error('Upsert subscription addon error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update subscription add-on' },
      requestId: req.requestId,
    })
  }
})

/**
 * GET /api/admin-dashboard/tenants/:tenantType/:id/effective-limit/:limitKey
 */
router.get('/tenants/:tenantType/:id/effective-limit/:limitKey', async (req, res) => {
  try {
    const tenantType = req.params.tenantType.toUpperCase()
    const { id: tenantId, limitKey } = req.params
    if (!['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid tenantType' },
        requestId: req.requestId,
      })
    }
    const entitlements = await getEntitlements(tenantId, tenantType)
    if (!entitlements) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'No subscription' },
        requestId: req.requestId,
      })
    }
    const subscription = await query(
      `SELECT plan_id, limits FROM subscription s JOIN subscription_plan sp ON sp.id = s.plan_id
       WHERE s.tenant_id = $1 AND s.tenant_type = $2 AND s.status IN ('ACTIVE','TRIALING')
       ORDER BY s.created_at DESC LIMIT 1`,
      [tenantId, tenantType]
    )
    const planRow = subscription.rows[0]
    const resolved = await resolveEffectiveLimit({
      tenantId,
      tenantType,
      limitKey,
      planId: planRow?.plan_id,
      planLimits: planRow?.limits || {},
    })
    const usage = await checkLimit(tenantId, tenantType, limitKey)
    res.json({
      ok: true,
      data: { resolved, usage },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Resolve effective limit error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to resolve limit' },
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
        `SELECT sp.name as plan_name,
         COALESCE(sp.tenant_type, sp.type) as tenant_type,
         sp.code as plan_code,
         COUNT(s.id) as subscription_count,
         COALESCE(SUM(
           CASE
             WHEN s.billing_cycle = 'YEARLY' AND COALESCE(sp.price_per_year, 0) > 0
               THEN sp.price_per_year / 12.0
             ELSE sp.price_per_month
           END
         ), 0)::numeric as mrr
         FROM subscription s
         JOIN subscription_plan sp ON sp.id = s.plan_id
         WHERE s.status IN ('ACTIVE', 'TRIALING')
           AND LOWER(sp.code) NOT IN ('free', 'enterprise')
           AND COALESCE(sp.price_per_month, 0) > 0
         GROUP BY sp.id, sp.name, sp.code, sp.tenant_type, sp.type, sp.price_per_month, sp.price_per_year`
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
          planCode: r.plan_code,
          tenantType: r.tenant_type,
          subscriptionCount: parseInt(r.subscription_count || 0),
          mrr: parseFloat(r.mrr || 0),
          arr: parseFloat(r.mrr || 0) * 12,
        })),
        mrr,
        arr,
        mrrExcludesFreeTrial: true,
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

// ========================================
// FEATURE FLAGS (global + per-tenant)
// ========================================

/** GET /api/admin-dashboard/feature-flags — list global feature toggles */
router.get('/feature-flags', async (req, res) => {
  try {
    const flags = await listGlobalFeatureFlags()
    res.json({ ok: true, data: { flags }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('List feature flags error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list feature flags' },
      requestId: req.requestId,
    })
  }
})

/** PATCH /api/admin-dashboard/feature-flags/:featureKey — set global override (inherit|on|off) */
router.patch('/feature-flags/:featureKey', async (req, res) => {
  try {
    const { featureKey } = req.params
    const mode = req.body?.mode ?? req.body?.globalOverride
    if (!['inherit', 'on', 'off', null].includes(mode)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'mode must be inherit, on, or off',
        },
        requestId: req.requestId,
      })
    }
    const flag = await setGlobalFeatureOverride(featureKey, mode === null ? 'inherit' : mode)
    await logAudit(
      req,
      'feature_flag.global_update',
      `Set global feature ${featureKey} to ${mode}`,
      'feature_flag',
      featureKey,
      null,
      flag,
      { mode }
    )
    try {
      const { emitEntitlementsRefreshNotice } = await import('../lib/socket.js')
      emitEntitlementsRefreshNotice({
        reason: 'global_feature',
        featureKey,
        featureName: featureDisplayName(featureKey),
        mode: mode === null ? 'inherit' : mode,
        globalOverride: flag.globalOverride,
      })
    } catch (emitErr) {
      logger.warn('emitEntitlementsRefreshNotice failed', { error: emitErr.message })
    }
    res.json({ ok: true, data: { flag }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('Update global feature flag error:', error)
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'VALIDATION_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

/** GET /api/admin-dashboard/tenants/:tenantType/:id/feature-overrides */
router.get('/tenants/:tenantType/:id/feature-overrides', async (req, res) => {
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
    const [overrides, effectiveFeatures] = await Promise.all([
      listTenantFeatureOverrides(id, tenantType),
      getEffectiveFeaturesForTenant(id, tenantType),
    ])
    res.json({
      ok: true,
      data: { overrides, effectiveFeatures },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('List tenant feature overrides error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list tenant feature overrides' },
      requestId: req.requestId,
    })
  }
})

/** PUT /api/admin-dashboard/tenants/:tenantType/:id/feature-overrides/:featureKey */
router.put('/tenants/:tenantType/:id/feature-overrides/:featureKey', async (req, res) => {
  try {
    const { tenantType, id, featureKey } = req.params
    const { enabled, reason } = req.body || {}
    if (!['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'tenantType must be RESTAURANT or SUPPLIER' },
        requestId: req.requestId,
      })
    }
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'enabled (boolean) is required' },
        requestId: req.requestId,
      })
    }
    const override = await setTenantFeatureOverride(
      id,
      tenantType,
      featureKey,
      enabled,
      reason,
      req.userData?.id
    )
    await logAudit(
      req,
      'feature_flag.tenant_override',
      `Set ${featureKey}=${enabled} for ${tenantType} ${id}`,
      'feature_flag_override',
      `${tenantType}:${id}:${featureKey}`,
      null,
      override,
      { reason }
    )
    try {
      const { emitEntitlementsRefreshNotice } = await import('../lib/socket.js')
      emitEntitlementsRefreshNotice({
        reason: 'tenant_feature_override',
        tenantType,
        tenantId: id,
        featureKey,
        featureName: featureDisplayName(featureKey),
        enabled,
      })
    } catch (emitErr) {
      logger.warn('emitEntitlementsRefreshNotice failed', { error: emitErr.message })
    }
    res.json({ ok: true, data: { override }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('Set tenant feature override error:', error)
    res.status(400).json({
      ok: false,
      data: null,
      error: { name: 'VALIDATION_ERROR', message: error.message },
      requestId: req.requestId,
    })
  }
})

/** DELETE /api/admin-dashboard/tenants/:tenantType/:id/feature-overrides/:featureKey */
router.delete('/tenants/:tenantType/:id/feature-overrides/:featureKey', async (req, res) => {
  try {
    const { tenantType, id, featureKey } = req.params
    if (!['RESTAURANT', 'SUPPLIER'].includes(tenantType)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'tenantType must be RESTAURANT or SUPPLIER' },
        requestId: req.requestId,
      })
    }
    await clearTenantFeatureOverride(id, tenantType, featureKey)
    await logAudit(
      req,
      'feature_flag.tenant_override_clear',
      `Cleared override for ${featureKey} on ${tenantType} ${id}`,
      'feature_flag_override',
      `${tenantType}:${id}:${featureKey}`,
      null,
      null
    )
    try {
      const { emitEntitlementsRefreshNotice } = await import('../lib/socket.js')
      emitEntitlementsRefreshNotice({
        reason: 'tenant_feature_override_clear',
        tenantType,
        tenantId: id,
        featureKey,
        featureName: featureDisplayName(featureKey),
      })
    } catch (emitErr) {
      logger.warn('emitEntitlementsRefreshNotice failed', { error: emitErr.message })
    }
    res.json({ ok: true, data: { cleared: true }, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('Clear tenant feature override error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to clear tenant feature override' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// PLATFORM ACTIVITY FEED
// ========================================
/**
 * GET /api/admin-dashboard/activity
 * Chronological stream of all major platform events.
 * Event types: order_placed, order_confirmed, order_completed, cart_updated,
 *   new_tenant, plan_changed, subscription_status, staff_added,
 *   reservation_made, invoice_issued, payment_received,
 *   quick_list_created, receiving_report, chat_started
 */
router.get('/activity', async (req, res) => {
  try {
    const { limit = 50, offset = 0, type, days } = req.query
    const data = await buildAdminActivityFeed({ limit, offset, type, days })
    res.json({
      ok: true,
      data,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Activity feed error:', { error: error.message })
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load activity feed' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// PLATFORM SETTINGS
// ========================================

router.get('/platform-settings', requirePermission('ADMIN_ACCESS'), async (req, res) => {
  try {
    const { getPlatformSetting } = await import('../lib/platform-settings.js')
    const freeSandboxDays = await getPlatformSetting('free_sandbox_days', 7)
    res.json({
      ok: true,
      data: { freeSandboxDays: Number(freeSandboxDays) || 7 },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('GET platform-settings error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load platform settings' },
      requestId: req.requestId,
    })
  }
})

router.patch('/platform-settings', requirePermission('ADMIN_ACCESS'), async (req, res) => {
  try {
    const days = Number(req.body?.freeSandboxDays ?? req.body?.free_sandbox_days)
    if (!Number.isFinite(days) || days < 3 || days > 7) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'freeSandboxDays must be between 3 and 7',
        },
        requestId: req.requestId,
      })
    }
    const { setPlatformSetting } = await import('../lib/platform-settings.js')
    await setPlatformSetting('free_sandbox_days', Math.round(days))
    res.json({
      ok: true,
      data: { freeSandboxDays: Math.round(days) },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('PATCH platform-settings error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update platform settings' },
      requestId: req.requestId,
    })
  }
})

export default router
