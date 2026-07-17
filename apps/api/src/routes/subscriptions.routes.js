import express from 'express'
import {
  requireAuth,
  requireRole,
  getRequestTenant,
  resolveTenantContext,
  requirePermission,
} from '../lib/rbac.js'
import { subscriptionRouteGuard } from '../lib/route-permissions.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  getTenantSubscription,
  isFeatureEnabled,
  checkLimit,
  getEntitlements,
  recommendPlan,
  resolveEffectivePlanFeatures,
} from '../lib/subscription.js'
import { formatTenantPlanDisplayName } from '../lib/plan-codes.js'
import { getAddonOptionsForPlan } from '../lib/subscription-addons.js'
import {
  recordConversionEvent,
  ALLOWED_TYPES as CONVERSION_ALLOWED_TYPES,
} from '../lib/conversion-events.js'

const router = express.Router()

// Auth + tenant context; billing permissions on plans/usage (entitlements/current stay open)
router.use(requireAuth, resolveTenantContext, subscriptionRouteGuard)

/**
 * Get canonical entitlements (plan, limits with overrides, features, usage snapshot).
 * Any authenticated tenant can view their own entitlements (no SUBSCRIPTIONS_VIEW required).
 */
router.get('/entitlements', requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = req.tenantContext?.tenantId
      ? {
          tenantId: req.tenantContext.tenantId,
          tenantType: req.tenantContext.tenantType,
          tenantName: req.tenantContext.tenantName,
        }
      : await getRequestTenant(req)
    if (!tenant) {
      if (req.userData.role === 'ADMIN') {
        return res.json({
          ok: true,
          data: { entitlements: null },
          error: null,
          requestId: req.requestId,
        })
      }
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message:
            req.userData.role === 'RESTAURANT' ? 'Restaurant not found' : 'Supplier not found',
        },
        requestId: req.requestId,
      })
    }

    let entitlements = await getEntitlements(tenant.tenantId, tenant.tenantType, req)
    if (!entitlements) {
      // getTenantSubscription ensures Free row when missing; one retry avoids duplicate work
      await getTenantSubscription(tenant.tenantId, tenant.tenantType)
      entitlements = await getEntitlements(tenant.tenantId, tenant.tenantType, req)
    }
    if (!entitlements) {
      // Last resort: return synthetic Free so UI always shows something; backend will still enforce limits
      const { RESTAURANT_LIMIT_KEYS, SUPPLIER_LIMIT_KEYS } = await import('../lib/subscription.js')
      const { resolveAllFeaturesForTenant } = await import('../lib/feature-flags.js')
      const limitKeys =
        tenant.tenantType === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
      const freeDefaults =
        tenant.tenantType === 'RESTAURANT'
          ? {
              branches: 1,
              users: 1,
              orders_per_day: 3,
              suppliers_per_restaurant: 1,
              restaurant_inventory_skus: 10,
              chats_per_day: 3,
              storage_mb: 50,
              quick_lists: 1,
              quick_list_items: 1,
              scheduled_quick_lists: 1,
              scheduled_order_grace_per_day: 1,
              open_conversations: 1,
            }
          : {
              warehouses: 0,
              users: 1,
              supplier_products_skus: 10,
              chats_per_day: 3,
              storage_mb: 50,
              branches: 1,
              promotions: 1,
              open_conversations: 1,
            }
      const defaultLimits = Object.fromEntries(limitKeys.map((k) => [k, freeDefaults[k] ?? 0]))
      const planFeat = {
        chat: true,
        smart_reorder: false,
        reports: false,
        multi_branch: false,
      }
      const { features, featureSources } = await resolveAllFeaturesForTenant(
        tenant.tenantId,
        tenant.tenantType,
        planFeat
      )
      entitlements = {
        tenantId: tenant.tenantId,
        tenantType: tenant.tenantType,
        plan: {
          id: null,
          name: formatTenantPlanDisplayName('free', tenant.tenantType, 'Free'),
          code: 'free',
          tenant_type: tenant.tenantType,
          price_monthly: 0,
          price_yearly: 0,
        },
        features,
        featureSources,
        planFeatures: planFeat,
        limits: defaultLimits,
        baseLimits: defaultLimits,
        overrides: [],
        usage: Object.fromEntries(limitKeys.map((k) => [k, 0])),
        usageWindowMeta: {},
      }
      logger.warn('Returning synthetic Free entitlements; run migration 0048 to fix', {
        tenantId: tenant.tenantId,
        tenantType: tenant.tenantType,
      })
    }

    res.json({
      ok: true,
      data: { entitlements },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get entitlements error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get entitlements' },
      requestId: req.requestId,
    })
  }
})

/**
 * Get current user's subscription (restaurant or supplier; admin when impersonating).
 * Any authenticated tenant can view (no SUBSCRIPTIONS_VIEW required).
 */
router.get('/current', requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = req.tenantContext?.tenantId
      ? {
          tenantId: req.tenantContext.tenantId,
          tenantType: req.tenantContext.tenantType,
          tenantName: req.tenantContext.tenantName,
        }
      : await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message:
            req.userData.role === 'RESTAURANT' ? 'Restaurant not found' : 'Supplier not found',
        },
        requestId: req.requestId,
      })
    }

    let subscription = await getTenantSubscription(tenant.tenantId, tenant.tenantType)
    if (!subscription) {
      // Retry once after getTenantSubscription (which runs ensureTenantSubscription)
      subscription = await getTenantSubscription(tenant.tenantId, tenant.tenantType)
    }
    if (!subscription) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'No active subscription found',
        },
        requestId: req.requestId,
      })
    }

    const effectiveFeatures = await resolveEffectivePlanFeatures(subscription)
    // Normalize for frontend: plan_display_name -> plan_name, ensure limits/features are objects
    const subscriptionPayload = {
      ...subscription,
      plan_name: formatTenantPlanDisplayName(
        subscription.plan_code,
        tenant.tenantType,
        subscription.plan_display_name || subscription.plan_name
      ),
      limits:
        subscription.limits && typeof subscription.limits === 'object' ? subscription.limits : {},
      features: effectiveFeatures && typeof effectiveFeatures === 'object' ? effectiveFeatures : {},
    }

    res.json({
      ok: true,
      data: { subscription: subscriptionPayload },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get current subscription error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get subscription',
      },
      requestId: req.requestId,
    })
  }
})

/**
 * Get usage for a specific meter (restaurant or supplier)
 */
router.get(
  '/usage/:meterType',
  requirePermission('SUBSCRIPTIONS_VIEW'),
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const tenant = req.tenantContext?.tenantId
        ? {
            tenantId: req.tenantContext.tenantId,
            tenantType: req.tenantContext.tenantType,
            tenantName: req.tenantContext.tenantName,
          }
        : await getRequestTenant(req)
      if (!tenant) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Tenant not found' },
          requestId: req.requestId,
        })
      }

      const { meterType } = req.params
      const limitInfo = await checkLimit(tenant.tenantId, tenant.tenantType, meterType)

      res.json({
        ok: true,
        data: {
          meterType,
          ...limitInfo,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get usage error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get usage',
        },
        requestId: req.requestId,
      })
    }
  }
)

/**
 * Get plan catalog for current tenant type (self-serve plans only; for upgrade modal comparison).
 */
router.get('/plans', requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = req.tenantContext?.tenantId
      ? {
          tenantId: req.tenantContext.tenantId,
          tenantType: req.tenantContext.tenantType,
          tenantName: req.tenantContext.tenantName,
        }
      : await getRequestTenant(req)
    if (!tenant) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Tenant not found' },
        requestId: req.requestId,
      })
    }
    let rows = []
    let currentSubscription = null
    try {
      currentSubscription = await getTenantSubscription(tenant.tenantId, tenant.tenantType)
      const includeTrialPlan = (currentSubscription?.plan_code || '').toLowerCase() === 'free'
      const result = await query(
        `SELECT id, code, name, description, limits, features, price_per_month, price_per_year, tenant_type, is_active, display_order, trial_days
         FROM subscription_plan
         WHERE tenant_type = $1 AND is_active = true
         ORDER BY display_order NULLS LAST, name`,
        [tenant.tenantType]
      )
      rows = result.rows.filter((p) => {
        const code = (p.code || '').toLowerCase()
        if (code === 'enterprise') return false
        if (code === 'free' && !includeTrialPlan) return false
        return true
      })
    } catch (e) {
      if (e.code !== '42P01') throw e
    }
    res.json({
      ok: true,
      data: {
        plans: rows.map((p) => {
          const monthly = Number(p.price_per_month || 0)
          const yearly = Number(p.price_per_year || 0)
          return {
            ...p,
            display_name: formatTenantPlanDisplayName(p.code, tenant.tenantType, p.name),
            limits: p.limits || {},
            features: p.features || {},
            annual_savings: monthly > 0 && yearly > 0 ? monthly * 12 - yearly : 0,
            trial_eligible: (p.code || '').toLowerCase() !== 'free',
            current_plan: currentSubscription?.plan_id === p.id,
            addon_options: getAddonOptionsForPlan(tenant.tenantType, p.code),
          }
        }),
      },
      error: null,
      requestId: req.requestId,
    })
  } catch (error) {
    logger.error('Get subscription plans error:', error)
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get plans' },
      requestId: req.requestId,
    })
  }
})

/**
 * Get recommended plan for current tenant (usage, limits, optional blocked events).
 * Query: blocked (optional) e.g. "limit:orders_per_day" or "feature:reports" or comma-separated.
 */
router.get(
  '/recommendation',
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const tenant = req.tenantContext?.tenantId
        ? {
            tenantId: req.tenantContext.tenantId,
            tenantType: req.tenantContext.tenantType,
            tenantName: req.tenantContext.tenantName,
          }
        : await getRequestTenant(req)
      if (!tenant) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: {
            name: 'NOT_FOUND',
            message:
              req.userData.role === 'RESTAURANT' ? 'Restaurant not found' : 'Supplier not found',
          },
          requestId: req.requestId,
        })
      }

      const blockedParam = req.query.blocked
      const blockedEvents = []
      if (typeof blockedParam === 'string') {
        blockedParam.split(',').forEach((part) => {
          const [type, key] = part
            .trim()
            .split(':')
            .map((s) => s?.trim())
          if (type === 'limit' && key) blockedEvents.push({ type: 'LIMIT', key })
          if (type === 'feature' && key) blockedEvents.push({ type: 'FEATURE', key })
        })
      }

      const result = await recommendPlan({
        tenantId: tenant.tenantId,
        tenantType: tenant.tenantType,
        blockedEvents,
      })

      res.json({
        ok: true,
        data: result,
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Get recommendation error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to get plan recommendation',
        },
        requestId: req.requestId,
      })
    }
  }
)

/**
 * Record conversion funnel event (VIEW_PLANS, OPEN_UPGRADE). Frontend calls this when user opens plans or upgrade modal.
 */
router.post(
  '/conversion-event',
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const tenant = req.tenantContext?.tenantId
        ? {
            tenantId: req.tenantContext.tenantId,
            tenantType: req.tenantContext.tenantType,
            tenantName: req.tenantContext.tenantName,
          }
        : await getRequestTenant(req)
      if (!tenant) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Tenant not found' },
          requestId: req.requestId,
        })
      }
      const { eventType, metadata } = req.body || {}
      if (!CONVERSION_ALLOWED_TYPES.includes(eventType)) {
        return res.status(400).json({
          ok: false,
          data: null,
          error: {
            name: 'BAD_REQUEST',
            message: `eventType must be one of: ${CONVERSION_ALLOWED_TYPES.join(', ')}`,
          },
          requestId: req.requestId,
        })
      }
      await recordConversionEvent(tenant.tenantId, tenant.tenantType, eventType, metadata || {})
      res.json({
        ok: true,
        data: { recorded: true },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Record conversion event error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to record event' },
        requestId: req.requestId,
      })
    }
  }
)

/**
 * Check if feature is enabled (restaurant or supplier)
 */
router.get(
  '/features/:featureKey',
  requirePermission('SUBSCRIPTIONS_VIEW'),
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const tenant = req.tenantContext?.tenantId
        ? {
            tenantId: req.tenantContext.tenantId,
            tenantType: req.tenantContext.tenantType,
            tenantName: req.tenantContext.tenantName,
          }
        : await getRequestTenant(req)
      if (!tenant) {
        return res.status(404).json({
          ok: false,
          data: null,
          error: { name: 'NOT_FOUND', message: 'Tenant not found' },
          requestId: req.requestId,
        })
      }

      const { featureKey } = req.params
      const isEnabled = await isFeatureEnabled(tenant.tenantId, tenant.tenantType, featureKey)

      res.json({
        ok: true,
        data: {
          featureKey,
          isEnabled,
        },
        error: null,
        requestId: req.requestId,
      })
    } catch (error) {
      logger.error('Check feature error:', error)
      res.status(500).json({
        ok: false,
        data: null,
        error: {
          name: 'INTERNAL_ERROR',
          message: 'Failed to check feature',
        },
        requestId: req.requestId,
      })
    }
  }
)

export { router as subscriptionsRoutes }
