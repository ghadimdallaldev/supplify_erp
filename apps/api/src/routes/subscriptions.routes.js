import express from 'express';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getTenantSubscription, isFeatureEnabled, checkLimit } from '../lib/subscription.js';

const router = express.Router();

/**
 * Get current user's subscription (restaurant)
 */
router.get('/current', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    // Get restaurant ID
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Restaurant not found',
        },
        requestId: req.requestId,
      });
    }

    const tenantId = restaurants[0].id;
    const subscription = await getTenantSubscription(tenantId, 'RESTAURANT');

    if (!subscription) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'No active subscription found',
        },
        requestId: req.requestId,
      });
    }

    res.json({
      ok: true,
      data: { subscription },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get current subscription error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get subscription',
      },
      requestId: req.requestId,
    });
  }
});

/**
 * Get usage for a specific meter
 */
router.get('/usage/:meterType', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    // Get restaurant ID
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Restaurant not found',
        },
        requestId: req.requestId,
      });
    }

    const tenantId = restaurants[0].id;
    const { meterType } = req.params;

    const limitInfo = await checkLimit(tenantId, 'RESTAURANT', meterType);

    res.json({
      ok: true,
      data: {
        meterType,
        ...limitInfo
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get usage error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get usage',
      },
      requestId: req.requestId,
    });
  }
});

/**
 * Check if feature is enabled
 */
router.get('/features/:featureKey', requireAuth, requireRole(['RESTAURANT']), async (req, res) => {
  try {
    // Get restaurant ID
    const { rows: restaurants } = await query(
      'SELECT id FROM restaurant WHERE contact_email = $1',
      [req.userData.email]
    );

    if (restaurants.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: {
          name: 'NOT_FOUND',
          message: 'Restaurant not found',
        },
        requestId: req.requestId,
      });
    }

    const tenantId = restaurants[0].id;
    const { featureKey } = req.params;

    const isEnabled = await isFeatureEnabled(tenantId, 'RESTAURANT', featureKey);

    res.json({
      ok: true,
      data: {
        featureKey,
        isEnabled
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Check feature error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to check feature',
      },
      requestId: req.requestId,
    });
  }
});

export { router as subscriptionsRoutes };

