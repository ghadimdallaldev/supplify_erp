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

export default router
