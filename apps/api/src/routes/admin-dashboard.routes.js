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
        COALESCE(t.name, t.contact_email) as tenant_name, t.email as tenant_email
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      LEFT JOIN supplier su ON (s.tenant_id = su.id AND s.tenant_type = 'SUPPLIER')
      LEFT JOIN restaurant r ON (s.tenant_id = r.id AND s.tenant_type = 'RESTAURANT')
      LEFT JOIN app_user t ON ((t.keycloak_sub = su.contact_email AND s.tenant_type = 'SUPPLIER') OR (t.keycloak_sub = r.contact_email AND s.tenant_type = 'RESTAURANT'))
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

export default router;

