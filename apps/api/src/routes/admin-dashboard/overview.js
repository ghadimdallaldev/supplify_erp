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
import { getCache, setCache } from '../../lib/cache.js'
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

const ADMIN_OVERVIEW_CACHE_KEY = 'admin:overview:v1'
const ADMIN_OVERVIEW_CACHE_TTL_SECONDS = 120

// ========================================
// OVERVIEW / DASHBOARD
// ========================================
router.get('/overview', async (req, res) => {
  try {
    const cached = await getCache(ADMIN_OVERVIEW_CACHE_KEY)
    if (cached) {
      return res.json({
        ok: true,
        data: cached,
        error: null,
        requestId: req.requestId,
      })
    }

    const data = await buildAdminOverviewMetrics()
    await setCache(ADMIN_OVERVIEW_CACHE_KEY, data, ADMIN_OVERVIEW_CACHE_TTL_SECONDS).catch(() => {})

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
    const { getPlatformSetting } = await import('../../lib/platform-settings.js')
    const freeSandboxDays = await getPlatformSetting('free_sandbox_days', 30)
    res.json({
      ok: true,
      data: { freeSandboxDays: Number(freeSandboxDays) || 30 },
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
    if (!Number.isFinite(days) || days < 7 || days > 90) {
      return res.status(400).json({
        ok: false,
        data: null,
        error: {
          name: 'VALIDATION_ERROR',
          message: 'freeSandboxDays must be between 7 and 90',
        },
        requestId: req.requestId,
      })
    }
    const { setPlatformSetting } = await import('../../lib/platform-settings.js')
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

router.get('/growth-settings', requirePermission('ADMIN_GROWTH'), async (req, res) => {
  try {
    const { getReferralProgramConfig } = await import('../../lib/platform-settings.js')
    const config = await getReferralProgramConfig()
    res.json({ ok: true, data: config, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('GET growth-settings error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to load growth settings' },
      requestId: req.requestId,
    })
  }
})

router.patch('/growth-settings', requirePermission('ADMIN_GROWTH'), async (req, res) => {
  try {
    const { setReferralProgramConfig } = await import('../../lib/platform-settings.js')
    const config = await setReferralProgramConfig(req.body || {})
    res.json({ ok: true, data: config, error: null, requestId: req.requestId })
  } catch (error) {
    logger.error('PATCH growth-settings error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update growth settings' },
      requestId: req.requestId,
    })
  }
})

export default router
