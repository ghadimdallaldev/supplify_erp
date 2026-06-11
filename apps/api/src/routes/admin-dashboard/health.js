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

const router = Router()

// ========================================
// OPERATIONAL VISIBILITY (admin support / monitoring)
// ========================================
router.get('/operational-summary', async (req, res) => {
  try {
    const summary = await buildAdminOperationalSummary()
    res.json({
      ok: true,
      data: { summary },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Operational summary error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get operational summary' },
      requestId: req.requestId,
    })
  }
})

router.get('/operational/email-logs', async (req, res) => {
  try {
    const result = await listAdminEmailDeliveryLogs(req.query)
    res.json({
      ok: true,
      data: result,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Operational email logs error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list email delivery logs' },
      requestId: req.requestId,
    })
  }
})

router.get('/operational/fulfillment-issues', async (req, res) => {
  try {
    const result = await listAdminFulfillmentIssues(req.query)
    res.json({
      ok: true,
      data: result,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Operational fulfillment issues error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list fulfillment issues' },
      requestId: req.requestId,
    })
  }
})

router.get('/operational/active-deliveries', async (req, res) => {
  try {
    const limit = req.query.limit
    const result = await listAdminActiveDeliveries({ limit })
    res.json({
      ok: true,
      data: result,
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Operational active deliveries error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to list active deliveries' },
      requestId: req.requestId,
    })
  }
})

// ========================================
// HEALTH (Phase C1)
// ========================================
router.get('/health', async (req, res) => {
  try {
    const { getRecentCronFailures } = await import('../../lib/cron-runner.js')
    let jobFailures = getRecentCronFailures()
    let webhookFailures = []
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

    const emailFailures = await getAdminEmailHealthFailures({ limit: 20 })

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

export default router
