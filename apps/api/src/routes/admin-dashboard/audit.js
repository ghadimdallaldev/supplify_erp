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
      sameSite: config.COOKIE_SAME_SITE,
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

export default router
