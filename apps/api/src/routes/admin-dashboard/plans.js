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

export default router
