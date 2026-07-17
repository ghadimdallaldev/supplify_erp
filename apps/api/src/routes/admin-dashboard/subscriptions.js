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
import {
  FREE_TRIAL_MAX_DAYS,
  FREE_TRIAL_MIN_DAYS,
  clampFreeTrialDays,
} from '../../lib/platform-settings.js'
import {
  notifyBillingCancelled,
  notifyBillingPlanChanged,
} from '../../services/notification.service.js'
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

    await invalidateTenantSubscriptionCache(existing.tenant_id, existing.tenant_type)
    if (updateData.status === 'CANCELLED') {
      notifyBillingCancelled({
        tenantId: existing.tenant_id,
        tenantType: existing.tenant_type,
      }).catch(() => {})
    }
    if (updateData.planId && newPlan && !planChangeApplyAtPeriodEnd) {
      const { rows: oldPlanRows } = await query(
        'SELECT name FROM subscription_plan WHERE id = $1',
        [existing.plan_id]
      )
      notifyBillingPlanChanged({
        tenantId: existing.tenant_id,
        tenantType: existing.tenant_type,
        planName: newPlan.name,
        previousPlanName: oldPlanRows[0]?.name || existingPlanCode || null,
      }).catch(() => {})
    }
    try {
      const { emitEntitlementsRefreshNotice } = await import('../../lib/socket.js')
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
 * Body: { days?: number } — clamped to platform bounds (platform default when omitted).
 */
router.post('/subscriptions/:id/extend-free-trial', async (req, res) => {
  try {
    const { id } = req.params
    const rawDays = req.body?.days ?? req.body?.freeTrialDays
    const days = rawDays !== undefined && rawDays !== null ? Number(rawDays) : undefined

    if (
      days !== undefined &&
      (!Number.isFinite(days) || days < FREE_TRIAL_MIN_DAYS || days > FREE_TRIAL_MAX_DAYS)
    ) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: `freeTrialDays must be between ${FREE_TRIAL_MIN_DAYS} and ${FREE_TRIAL_MAX_DAYS}`,
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

    await invalidateTenantSubscriptionCache(existing.tenant_id, existing.tenant_type)
    try {
      const { emitEntitlementsRefreshNotice } = await import('../../lib/socket.js')
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
 * For expired Free Trial, also extends free_sandbox_expires_at (body: freeTrialDays within platform bounds).
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
      (!Number.isFinite(extendFreeTrialDays) ||
        extendFreeTrialDays < FREE_TRIAL_MIN_DAYS ||
        extendFreeTrialDays > FREE_TRIAL_MAX_DAYS)
    ) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: `freeTrialDays must be between ${FREE_TRIAL_MIN_DAYS} and ${FREE_TRIAL_MAX_DAYS}`,
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

    await invalidateTenantSubscriptionCache(existing.tenant_id, existing.tenant_type)
    try {
      const { emitEntitlementsRefreshNotice } = await import('../../lib/socket.js')
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

export default router
