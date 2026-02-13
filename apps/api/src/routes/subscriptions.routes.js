import express from 'express'
import { requireAuth, requireRole, getRequestTenant } from '../lib/rbac.js'
import { query } from '../lib/db.js'
import { logger } from '../lib/logger.js'
import { getTenantSubscription, isFeatureEnabled, checkLimit } from '../lib/subscription.js'

const router = express.Router()

/**
 * Get current user's subscription (restaurant or supplier; admin when impersonating)
 */
router.get(
  '/current',
  requireAuth,
  requireRole(['RESTAURANT', 'SUPPLIER', 'ADMIN']),
  async (req, res) => {
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

      const subscription = await getTenantSubscription(tenant.tenantId, tenant.tenantType)

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
  }
)

/**
 * Get usage for a specific meter (restaurant or supplier)
 */
router.get(
  '/usage/:meterType',
  requireAuth,
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
  requireAuth,
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
