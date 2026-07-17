import { randomUUID } from 'crypto'
import { Router } from 'express'
import { query, pool } from '../../lib/db.js'
import { requireAuth, requireRole, resolveAdminContext, requirePermission } from '../../lib/rbac.js'
import { z } from 'zod'
import { logger } from '../../lib/logger.js'
import { ZodError } from 'zod'
import { config } from '../../config/env.js'
import { deliveredOrderStatusInSql } from '../../lib/order-statuses.js'
import { parseAdminListPagination } from '../../lib/admin-list-pagination.js'
import {
  createImpersonationToken,
  verifyImpersonationToken,
  getImpersonationCookieName,
  getEffectiveTenant,
  clearImpersonationCookie,
} from '../../lib/impersonation.js'
import {
  getEntitlements,
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_LIMIT_KEYS,
  invalidateTenantSubscriptionCache,
  discoverLimitKeys,
  checkLimit,
} from '../../lib/subscription.js'
import { resolveEffectiveLimit } from '../../lib/limit-resolution.js'
import {
  resolveOrgBillingTenantId,
  resolveActiveBillingSubscription,
  resolveActiveBillingSubscriptionsBatch,
} from '../../lib/org-billing-tenant.js'
import { clearActiveTenantCookie } from '../../lib/tenant-switch.js'
import {
  defaultAddonUnitPrice,
  getActiveTenantAddons,
  isAddonKeyCompatibleWithPlan,
  isAddonKeyValidForTenant,
} from '../../lib/subscription-addons.js'
import { getAllowedFeatureKeys, featureDisplayName } from '../../lib/feature-keys.js'
import {
  listGlobalFeatureFlags,
  setGlobalFeatureOverride,
  listTenantFeatureOverrides,
  getEffectiveFeaturesForTenant,
  setTenantFeatureOverride,
  clearTenantFeatureOverride,
} from '../../lib/feature-flags.js'
import { writeAuditLog } from '../../lib/audit.js'
import { recordConversionEvent } from '../../lib/conversion-events.js'
import {
  extendFreeSandboxTrial,
  unlockSubscriptionAccount,
} from '../../lib/billing/billing-service.js'
import { clampFreeTrialDays } from '../../lib/platform-settings.js'
import {
  validatePlanLimitsAndFeatures,
  validateFreePlanTrialDays,
  validateEnterprisePlanActivation,
  validateEnterprisePlanCreate,
  buildTierLadderWarnings,
} from '../../lib/plan-admin-validation.js'
import { isLimitKeyApplicable } from '../../lib/limit-resolution.js'
import { buildAdminOverviewMetrics } from '../../lib/admin-overview-metrics.js'
import { buildAdminActivityFeed } from '../../lib/admin-activity-feed.js'
import {
  buildAdminOperationalSummary,
  listAdminEmailDeliveryLogs,
  listAdminFulfillmentIssues,
  listAdminActiveDeliveries,
  buildTenantOperationalSnapshot,
  getAdminEmailHealthFailures,
} from '../../lib/admin-operational-metrics.js'
import {
  adminResetUserPassword,
  listAdminUsers,
} from '../../services/admin-user-password.service.js'
import { adminDashboardPermissionGuard, requireAnyPermission } from '../../lib/route-permissions.js'
import { PERMISSION_KEYS as P } from '../../lib/permission-keys.js'

import { logAudit } from './audit.helpers.js'

const router = Router()

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

// Get tenant operational snapshot (read-only diagnostics)
router.get('/tenants/:tenantType/:id/operational-snapshot', async (req, res) => {
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
    const snapshot = await buildTenantOperationalSnapshot(id, tenantType)
    res.json({
      ok: true,
      data: { snapshot },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get tenant operational snapshot error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get tenant operational snapshot' },
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
    const planCode = entitlements?.plan?.code ?? null

    if (body.quantity > 0 && !isAddonKeyCompatibleWithPlan(addonKey, planCode)) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: "This add-on is not available for the tenant's current plan",
        },
        requestId: req.requestId,
      })
    }

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

export default router
