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
      const { emitEntitlementsRefreshNotice } = await import('../../lib/socket.js')
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
      const { emitEntitlementsRefreshNotice } = await import('../../lib/socket.js')
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
      const { emitEntitlementsRefreshNotice } = await import('../../lib/socket.js')
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

export default router
