import express from 'express'
import {
  requireAuth,
  requireRole,
  getRequestTenant,
  resolveTenantContext,
  requirePermission,
} from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import {
  getTenantSubscription,
  isFeatureEnabled,
  checkLimit,
  getEntitlements,
} from '../lib/subscription.js'

const router = express.Router()

// Auth + tenant context for all subscription routes (permission only on sensitive endpoints)
router.use(requireAuth, resolveTenantContext)

/**
 * Get canonical entitlements (plan, limits with overrides, features, usage snapshot).
 * Any authenticated tenant can view their own entitlements (no SUBSCRIPTIONS_VIEW required).
 */
router.get('/entitlements', requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']), async (req, res) => {
  try {
    const tenant = await getRequestTenant(req)
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

    let entitlements = await getEntitlements(tenant.tenantId, tenant.tenantType)
    if (!entitlements) {
      // Force ensure subscription and retry (handles migration not run or race)
      const { getTenantSubscription } = await import('../lib/subscription.js')
      await getTenantSubscription(tenant.tenantId, tenant.tenantType)
      entitlements = await getEntitlements(tenant.tenantId, tenant.tenantType)
    }
    if (!entitlements) {
      // Last resort: return synthetic Free so UI always shows something; backend will still enforce limits
      const { RESTAURANT_LIMIT_KEYS, SUPPLIER_LIMIT_KEYS } = await import('../lib/subscription.js')
      const limitKeys =
        tenant.tenantType === 'RESTAURANT' ? RESTAURANT_LIMIT_KEYS : SUPPLIER_LIMIT_KEYS
      const freeDefaults =
        tenant.tenantType === 'RESTAURANT'
          ? {
              branches: 0,
              users: 1,
              orders_per_day: 10,
              suppliers_per_restaurant: 2,
              restaurant_inventory_skus: 50,
              chats_per_day: 10,
              storage_mb: 100,
            }
          : {
              warehouses: 0,
              users: 1,
              supplier_products_skus: 50,
              chats_per_day: 10,
              storage_mb: 100,
            }
      const defaultLimits = Object.fromEntries(limitKeys.map((k) => [k, freeDefaults[k] ?? 0]))
      entitlements = {
        tenantId: tenant.tenantId,
        tenantType: tenant.tenantType,
        plan: {
          id: null,
          name: 'Free',
          code: 'free',
          tenant_type: tenant.tenantType,
          price_monthly: 0,
          price_yearly: 0,
        },
        features: { chat: true, smart_reorder: false, reports: false, multi_branch: false },
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
    const tenant = await getRequestTenant(req)
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

    // Normalize for frontend: plan_display_name -> plan_name, ensure limits/features are objects
    const subscriptionPayload = {
      ...subscription,
      plan_name: subscription.plan_display_name || subscription.plan_name,
      limits:
        subscription.limits && typeof subscription.limits === 'object' ? subscription.limits : {},
      features:
        subscription.features && typeof subscription.features === 'object'
          ? subscription.features
          : {},
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
      const tenant = await getRequestTenant(req)
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
 * Check if feature is enabled (restaurant or supplier)
 */
router.get(
  '/features/:featureKey',
  requirePermission('SUBSCRIPTIONS_VIEW'),
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
    try {
      const tenant = await getRequestTenant(req)
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
