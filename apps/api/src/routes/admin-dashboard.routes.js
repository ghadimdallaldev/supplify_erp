import { Router } from 'express';
import { query } from '../lib/db.js';
import { requireAuth, requireRole } from '../lib/rbac.js';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { ZodError } from 'zod';

const router = Router();

// ========================================
// AUDIT LOGGING HELPERS
// ========================================
async function logAudit(req, actionType, actionDescription, targetEntityType, targetEntityId, oldValue, newValue, metadata = {}) {
  try {
    await query(`
      INSERT INTO admin_audit_log (
        admin_user_id, admin_name, action_type, action_description,
        target_entity_type, target_entity_id, old_value, new_value, metadata,
        ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      req.userData.id,
      req.userData.display_name || req.userData.email,
      actionType,
      actionDescription,
      targetEntityType,
      targetEntityId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      JSON.stringify(metadata),
      req.ip,
      req.get('user-agent')
    ]);
  } catch (error) {
    logger.error('Failed to log audit event:', error);
    // Don't throw - audit logging should not fail requests
  }
}

// ========================================
// OVERVIEW / DASHBOARD
// ========================================
router.get('/overview', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    // Get platform stats
    const [
      { rows: tenantCounts },
      { rows: subscriptionStats },
      { rows: revenueStats },
      { rows: recentOrders },
      { rows: recentChats },
      { rows: alerts }
    ] = await Promise.all([
      query(`
        SELECT tenant_type, COUNT(*) as count
        FROM subscription
        WHERE status IN ('ACTIVE', 'TRIALING')
        GROUP BY tenant_type
      `),
      query(`
        SELECT status, COUNT(*) as count
        FROM subscription
        GROUP BY status
      `),
      query(`
        SELECT 
          COALESCE(SUM(CASE WHEN s.billing_cycle = 'MONTHLY' THEN sp.price_per_month ELSE sp.price_per_month * 12 END), 0) as mrr,
          COUNT(*) as active_subscriptions
        FROM subscription s
        JOIN subscription_plan sp ON sp.id = s.plan_id
        WHERE s.status = 'ACTIVE'
      `),
      query(`
        SELECT COUNT(*) as count
        FROM customer_order
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*) as count
        FROM message
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `),
      query(`
        SELECT COUNT(*) as count
        FROM subscription
        WHERE status = 'PAST_DUE'
      `)
    ]);

    res.json({
      ok: true,
      data: {
        tenantCounts: tenantCounts.reduce((acc, row) => {
          acc[row.tenant_type] = parseInt(row.count);
          return acc;
        }, {}),
        subscriptionStats: subscriptionStats.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        revenue: {
          mrr: parseFloat(revenueStats[0]?.mrr || 0),
          activeSubscriptions: parseInt(revenueStats[0]?.active_subscriptions || 0),
          arr: parseFloat(revenueStats[0]?.mrr || 0) * 12
        },
        activity: {
          ordersLast24h: parseInt(recentOrders[0]?.count || 0),
          chatsLast24h: parseInt(recentChats[0]?.count || 0)
        },
        alerts: {
          pastDueInvoices: parseInt(alerts[0]?.count || 0)
        }
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get admin overview error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get admin overview' },
      requestId: req.requestId,
    });
  }
});

// ========================================
// PLANS MANAGEMENT
// ========================================
router.get('/plans', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { rows: plans } = await query(`
      SELECT * FROM subscription_plan
      ORDER BY display_order, name
    `);

    res.json({
      ok: true,
      data: { plans: plans.map(p => ({
        ...p,
        limits: p.limits || {},
        features: p.features || []
      })) },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get plans error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get plans' },
      requestId: req.requestId,
    });
  }
});

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pricePerMonth: z.number().nonnegative(),
  pricePerYear: z.number().nonnegative().optional(),
  limits: z.record(z.any()),
  features: z.array(z.string()),
  trialDays: z.number().nonnegative().default(0),
  displayOrder: z.number().default(0),
  isActive: z.boolean().default(true),
});

router.post('/plans', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const planData = createPlanSchema.parse(req.body);

    const { rows: [plan] } = await query(`
      INSERT INTO subscription_plan (
        name, description, price_per_month, price_per_year,
        limits, features, trial_days, display_order, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      planData.name,
      planData.description || null,
      planData.pricePerMonth,
      planData.pricePerYear || null,
      JSON.stringify(planData.limits),
      JSON.stringify(planData.features),
      planData.trialDays,
      planData.displayOrder,
      planData.isActive
    ]);

    await logAudit(req, 'plan.created', `Created plan: ${planData.name}`, 'plan', plan.id, null, plan);
    logger.info(`Plan created: ${planData.name}`);

    res.json({
      ok: true,
      data: { plan },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Create plan error:', error);
    if (error instanceof ZodError) {
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid plan data', details: error.errors },
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to create plan' },
        requestId: req.requestId,
      });
    }
  }
});

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  pricePerMonth: z.number().nonnegative().optional(),
  pricePerYear: z.number().nonnegative().optional(),
  limits: z.record(z.any()).optional(),
  features: z.array(z.string()).optional(),
  trialDays: z.number().nonnegative().optional(),
  displayOrder: z.number().optional(),
  isActive: z.boolean().optional(),
});

router.patch('/plans/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = updatePlanSchema.parse(req.body);

    // Get existing plan
    const { rows: existingPlans } = await query('SELECT * FROM subscription_plan WHERE id = $1', [id]);
    if (existingPlans.length === 0) {
      res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Plan not found' },
        requestId: req.requestId,
      });
      return;
    }

    const existing = existingPlans[0];

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(updateData.name);
    }
    if (updateData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(updateData.description);
    }
    if (updateData.pricePerMonth !== undefined) {
      updates.push(`price_per_month = $${paramIndex++}`);
      values.push(updateData.pricePerMonth);
    }
    if (updateData.pricePerYear !== undefined) {
      updates.push(`price_per_year = $${paramIndex++}`);
      values.push(updateData.pricePerYear);
    }
    if (updateData.limits !== undefined) {
      updates.push(`limits = $${paramIndex++}`);
      values.push(JSON.stringify(updateData.limits));
    }
    if (updateData.features !== undefined) {
      updates.push(`features = $${paramIndex++}`);
      values.push(JSON.stringify(updateData.features));
    }
    if (updateData.trialDays !== undefined) {
      updates.push(`trial_days = $${paramIndex++}`);
      values.push(updateData.trialDays);
    }
    if (updateData.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(updateData.displayOrder);
    }
    if (updateData.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(updateData.isActive);
    }

    values.push(id);

    const { rows: [updated] } = await query(`
      UPDATE subscription_plan
      SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    await logAudit(req, 'plan.updated', `Updated plan: ${existing.name}`, 'plan', id, existing, updated);
    logger.info(`Plan updated: ${existing.name}`);

    res.json({
      ok: true,
      data: { plan: updated },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Update plan error:', error);
    if (error instanceof ZodError) {
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid plan data', details: error.errors },
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to update plan' },
        requestId: req.requestId,
      });
    }
  }
});

// ========================================
// SUBSCRIPTIONS MANAGEMENT
// ========================================
router.get('/subscriptions', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { status, tenantType } = req.query;

    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` WHERE s.status = $${paramIndex++}`;
      params.push(status);
    }

    if (tenantType) {
      if (whereClause) whereClause += ' AND';
      else whereClause = ' WHERE';
      whereClause += ` s.tenant_type = $${paramIndex++}`;
      params.push(tenantType);
    }

    const { rows: subscriptions } = await query(`
      SELECT s.*,
        sp.price_per_month, sp.price_per_year, sp.limits as plan_limits, sp.features as plan_features,
        COALESCE(
          CASE WHEN s.tenant_type = 'SUPPLIER' THEN su.name ELSE NULL END,
          CASE WHEN s.tenant_type = 'RESTAURANT' THEN r.name ELSE NULL END
        ) as tenant_name,
        COALESCE(su.contact_email, r.contact_email) as tenant_email
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      LEFT JOIN supplier su ON (s.tenant_id = su.id AND s.tenant_type = 'SUPPLIER')
      LEFT JOIN restaurant r ON (s.tenant_id = r.id AND s.tenant_type = 'RESTAURANT')
      ${whereClause}
      ORDER BY s.created_at DESC
    `, params);

    res.json({
      ok: true,
      data: { subscriptions },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get subscriptions error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get subscriptions' },
      requestId: req.requestId,
    });
  }
});

const updateSubscriptionSchema = z.object({
  planId: z.string().uuid().optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'PAST_DUE']).optional(),
  cancelReason: z.string().optional(),
});

router.patch('/subscriptions/:id', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = updateSubscriptionSchema.parse(req.body);

    const { rows: existingSubs } = await query('SELECT * FROM subscription WHERE id = $1', [id]);
    if (existingSubs.length === 0) {
      res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Subscription not found' },
        requestId: req.requestId,
      });
      return;
    }

    const existing = existingSubs[0];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.planId) {
      updates.push(`plan_id = $${paramIndex++}`);
      values.push(updateData.planId);
      
      // Get new plan name
      const { rows: plans } = await query('SELECT name FROM subscription_plan WHERE id = $1', [updateData.planId]);
      if (plans.length > 0) {
        updates.push(`plan_name = $${paramIndex++}`);
        values.push(plans[0].name);
      }
    }

    if (updateData.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(updateData.status);
      
      if (updateData.status === 'CANCELLED') {
        updates.push(`cancelled_at = now()`);
      }
    }

    if (updateData.cancelReason) {
      updates.push(`cancel_reason = $${paramIndex++}`);
      values.push(updateData.cancelReason);
    }

    values.push(id);

    const { rows: [updated] } = await query(`
      UPDATE subscription
      SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    await logAudit(req, 'subscription.updated', `Updated subscription status to ${updateData.status || 'unchanged'}`, 'subscription', id, existing, updated);

    res.json({
      ok: true,
      data: { subscription: updated },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Update subscription error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to update subscription' },
      requestId: req.requestId,
    });
  }
});

// ========================================
// FEATURE FLAGS MANAGEMENT
// ========================================
router.get('/feature-flags', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { rows: flags } = await query(`
      SELECT * FROM feature_flag
      ORDER BY feature_name
    `);

    res.json({
      ok: true,
      data: { flags },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get feature flags error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get feature flags' },
      requestId: req.requestId,
    });
  }
});

const toggleFlagSchema = z.object({
  isEnabledGlobally: z.boolean().optional(),
});

router.patch('/feature-flags/:key', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { key } = req.params;
    const updateData = toggleFlagSchema.parse(req.body);

    const { rows: existing } = await query('SELECT * FROM feature_flag WHERE feature_key = $1', [key]);
    if (existing.length === 0) {
      res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Feature flag not found' },
        requestId: req.requestId,
      });
      return;
    }

    const { rows: [updated] } = await query(`
      UPDATE feature_flag
      SET is_enabled_globally = $1, updated_at = now()
      WHERE feature_key = $2
      RETURNING *
    `, [updateData.isEnabledGlobally, key]);

    await logAudit(req, 'feature_flag.toggled', `Toggled ${key} to ${updateData.isEnabledGlobally}`, 'feature_flag', key, existing[0], updated);

    res.json({
      ok: true,
      data: { flag: updated },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Toggle feature flag error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to toggle feature flag' },
      requestId: req.requestId,
    });
  }
});

// ========================================
// TENANT FEATURE FLAG OVERRIDES
// ========================================
router.get('/tenants/:tenantId/feature-flags', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { tenantType } = req.query;

    const { rows: overrides } = await query(`
      SELECT fo.*, ff.feature_name, ff.is_enabled_globally
      FROM feature_flag_override fo
      JOIN feature_flag ff ON ff.id = fo.feature_flag_id
      WHERE fo.tenant_id = $1 AND fo.tenant_type = $2
    `, [tenantId, tenantType]);

    res.json({
      ok: true,
      data: { overrides },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get tenant feature flags error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get tenant feature flags' },
      requestId: req.requestId,
    });
  }
});

const setTenantFlagSchema = z.object({
  tenantId: z.string().uuid(),
  tenantType: z.enum(['SUPPLIER', 'RESTAURANT']),
  featureKey: z.string(),
  isEnabled: z.boolean(),
});

router.post('/tenants/:tenantId/feature-flags', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { tenantType, featureKey, isEnabled } = setTenantFlagSchema.parse(req.body);

    // Get feature flag ID
    const { rows: flags } = await query('SELECT id FROM feature_flag WHERE feature_key = $1', [featureKey]);
    if (flags.length === 0) {
      res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Feature flag not found' },
        requestId: req.requestId,
      });
      return;
    }

    const flagId = flags[0].id;

    const { rows: [override] } = await query(`
      INSERT INTO feature_flag_override (tenant_id, tenant_type, feature_flag_id, feature_key, is_enabled)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, tenant_type, feature_key)
      DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now()
      RETURNING *
    `, [tenantId, tenantType, flagId, featureKey, isEnabled]);

    await logAudit(req, 'feature_flag.override', `Set ${featureKey} = ${isEnabled} for tenant ${tenantId}`, 'feature_flag_override', override.id, null, override);

    res.json({
      ok: true,
      data: { override },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Set tenant feature flag error:', error);
    if (error instanceof ZodError) {
      res.status(400).json({
        ok: false,
        data: null,
        error: { name: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors },
        requestId: req.requestId,
      });
    } else {
      res.status(500).json({
        ok: false,
        data: null,
        error: { name: 'INTERNAL_ERROR', message: 'Failed to set tenant feature flag' },
        requestId: req.requestId,
      });
    }
  }
});

router.delete('/tenants/:tenantId/feature-flags/:featureKey', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { tenantId, featureKey } = req.params;
    const { tenantType } = req.query;

    const { rows: deleted } = await query(`
      DELETE FROM feature_flag_override
      WHERE tenant_id = $1 AND tenant_type = $2 AND feature_key = $3
      RETURNING *
    `, [tenantId, tenantType, featureKey]);

    await logAudit(req, 'feature_flag.override_deleted', `Removed override for ${featureKey}`, 'feature_flag_override', deleted[0]?.id, deleted[0], null);

    res.json({
      ok: true,
      data: { deleted: deleted[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Delete tenant feature flag error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to delete tenant feature flag' },
      requestId: req.requestId,
    });
  }
});

// ========================================
// USAGE & QUOTAS
// ========================================
router.get('/usage/:tenantId', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { tenantType, period } = req.query;

    const periodStart = period || 'monthly';
    
    const { rows: usage } = await query(`
      SELECT * FROM usage_meter
      WHERE tenant_id = $1 AND tenant_type = $2
        AND period_type = $3
      ORDER BY meter_type
    `, [tenantId, tenantType, periodStart]);

    res.json({
      ok: true,
      data: { usage, period: periodStart },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get usage error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get usage' },
      requestId: req.requestId,
    });
  }
});

// ========================================
// AUDIT LOGS
// ========================================
router.get('/audit-logs', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { limit = 50, offset = 0, tenantId, actionType } = req.query;

    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      whereClause += ` WHERE target_tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    if (actionType) {
      if (whereClause) whereClause += ' AND';
      else whereClause = ' WHERE';
      whereClause += ` action_type = $${paramIndex++}`;
      params.push(actionType);
    }

    params.push(limit, offset);

    const { rows: logs } = await query(`
      SELECT * FROM admin_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, params);

    res.json({
      ok: true,
      data: { logs, limit: parseInt(limit), offset: parseInt(offset) },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get audit logs error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get audit logs' },
      requestId: req.requestId,
    });
  }
});

// ========================================
// TENANT MANAGEMENT
// ========================================

// Get suppliers with detailed info
router.get('/tenants/suppliers', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { rows: suppliers } = await query(`
      SELECT 
        s.*,
        sub.status as subscription_status,
        sub.plan_name,
        sub.id as subscription_id,
        (SELECT COUNT(*) FROM product WHERE supplier_id = s.id) as product_count,
        (SELECT COUNT(*) FROM warehouse WHERE supplier_id = s.id AND is_active = true) as warehouse_count,
        0 as total_revenue
      FROM supplier s
      LEFT JOIN subscription sub ON sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER' AND sub.status IN ('ACTIVE', 'TRIALING')
      ORDER BY s.name
    `);

    res.json({
      ok: true,
      data: { suppliers },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get suppliers error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get suppliers' },
      requestId: req.requestId,
    });
  }
});

// Get restaurants with detailed info
router.get('/tenants/restaurants', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { rows: restaurants } = await query(`
      SELECT 
        r.*,
        sub.status as subscription_status,
        sub.plan_name,
        sub.id as subscription_id,
        (SELECT COUNT(*) FROM customer_order WHERE restaurant_id = r.id) as order_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM customer_order WHERE restaurant_id = r.id AND status = 'COMPLETED') as total_spent,
        (SELECT COUNT(*) FROM customer_order WHERE restaurant_id = r.id AND placed_at >= NOW() - INTERVAL '30 days') as orders_last_30d
      FROM restaurant r
      LEFT JOIN subscription sub ON sub.tenant_id = r.id AND sub.tenant_type = 'RESTAURANT' AND sub.status IN ('ACTIVE', 'TRIALING')
      ORDER BY r.name
    `);

    res.json({
      ok: true,
      data: { restaurants },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get restaurants error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get restaurants' },
      requestId: req.requestId,
    });
  }
});

// ========================================
// TENANT OVERRIDES
// ========================================

/**
 * POST /api/admin-dashboard/tenants/:id/override-limit
 * Manually override a tenant's limit (e.g., grant temporary increase)
 */
router.post('/tenants/:tenantType/:id/override-limit', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id: tenantId, tenantType } = req.params;
    const { limit_type, override_value, expiration_date, reason } = req.body;

    // Create override record
    const { rows: overrides } = await query(`
      INSERT INTO tenant_limit_override (
        tenant_id, tenant_type, limit_type, override_value, expiration_date, reason, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenantId, tenantType.toUpperCase(), limit_type, override_value, expiration_date || null, reason || null, req.userData.id]);

    // Log audit
    await logAudit(req, 'OVERRIDE_LIMIT', 
      `Granted ${limit_type} override: ${override_value}`, 
      tenantType.toUpperCase(), tenantId, null, { limit_type, override_value, expiration_date, reason });

    res.json({
      ok: true,
      data: { override: overrides[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Override limit error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to set override' },
      requestId: req.requestId,
    });
  }
});

/**
 * DELETE /api/admin-dashboard/tenants/:id/override-limit/:overrideId
 * Remove a tenant limit override
 */
router.delete('/tenants/:tenantType/:id/override-limit/:overrideId', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { overrideId } = req.params;

    const { rows: deleted } = await query(`
      DELETE FROM tenant_limit_override WHERE id = $1 RETURNING *
    `, [overrideId]);

    if (deleted.length === 0) {
      return res.status(404).json({
        ok: false,
        data: null,
        error: { name: 'NOT_FOUND', message: 'Override not found' },
        requestId: req.requestId,
      });
    }

    // Log audit
    await logAudit(req, 'REMOVE_OVERRIDE', 
      `Removed limit override`, 
      deleted[0].tenant_type, deleted[0].tenant_id, deleted[0], null);

    res.json({
      ok: true,
      data: { override: deleted[0] },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Remove override error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to remove override' },
      requestId: req.requestId,
    });
  }
});

// Get supplier usage details
router.get('/tenants/suppliers/:id/usage', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows: usage } = await query(`
      SELECT * FROM usage_meter
      WHERE tenant_id = $1 AND tenant_type = 'SUPPLIER'
      ORDER BY meter_type, period_start_date DESC
    `, [id]);

    res.json({
      ok: true,
      data: { usage },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get supplier usage error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get supplier usage' },
      requestId: req.requestId,
    });
  }
});

// Get restaurant usage details
router.get('/tenants/restaurants/:id/usage', requireAuth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows: usage } = await query(`
      SELECT * FROM usage_meter
      WHERE tenant_id = $1 AND tenant_type = 'RESTAURANT'
      ORDER BY meter_type, period_start_date DESC
    `, [id]);

    res.json({
      ok: true,
      data: { usage },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get restaurant usage error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: { name: 'INTERNAL_ERROR', message: 'Failed to get restaurant usage' },
      requestId: req.requestId,
    });
  }
});

export default router;

