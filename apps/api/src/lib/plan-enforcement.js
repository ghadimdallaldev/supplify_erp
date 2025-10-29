// Plan enforcement utilities for branches and warehouses
import { query } from './db.js';
import { logger } from './logger.js';

/**
 * Check if a tenant can create a branch (restaurants only)
 * @param {string} tenantId - Restaurant ID
 * @param {object} currentUsage - Current usage metrics
 * @returns {object} { allowed: boolean, reason?: string, requiredPlan?: string }
 */
async function checkBranchLimit(tenantId, currentUsage = null) {
  try {
    // Get tenant's current subscription and plan
    const { rows: subscriptionRows } = await query(`
      SELECT s.*, sp.limits as plan_limits, sp.code as plan_code, sp.name as plan_name
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE s.tenant_id = $1 
        AND s.tenant_type = 'RESTAURANT'
        AND s.status IN ('ACTIVE', 'TRIALING')
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [tenantId]);

    if (subscriptionRows.length === 0) {
      return { 
        allowed: false, 
        reason: 'No active subscription found. Please subscribe to a plan.',
        currentPlan: 'None'
      };
    }

    const subscription = subscriptionRows[0];
    const limits = subscription.plan_limits || {};
    const branchLimit = limits.branches !== undefined ? parseInt(limits.branches) : -1;

    // Get current branch count
    let branchCount = currentUsage?.branches_count;
    if (branchCount === undefined || branchCount === null) {
      const { rows: countRows } = await query(`
        SELECT COUNT(*) as count FROM branch WHERE tenant_id = $1 AND is_active = TRUE
      `, [tenantId]);
      branchCount = parseInt(countRows[0]?.count || 0);
    }

    // Check if unlimited
    if (branchLimit === -1) {
      return { 
        allowed: true, 
        reason: null,
        currentPlan: subscription.plan_name,
        limit: -1,
        current: branchCount
      };
    }

    // Check if under limit
    if (branchCount < branchLimit) {
      return { 
        allowed: true, 
        reason: null,
        currentPlan: subscription.plan_name,
        limit: branchLimit,
        current: branchCount,
        remaining: branchLimit - branchCount
      };
    }

    // Over limit
    const eligiblePlans = ['Gold', 'Platinum'];
    return { 
      allowed: false, 
      reason: `Branch limit reached. You have ${branchCount}/${branchLimit} branches on ${subscription.plan_name} plan.`,
      currentPlan: subscription.plan_name,
      requiredPlan: eligiblePlans.find(p => p !== subscription.plan_name) || 'Gold',
      limit: branchLimit,
      current: branchCount
    };

  } catch (error) {
    logger.error('Error checking branch limit:', error);
    return { 
      allowed: false, 
      reason: 'Unable to verify plan limits. Please try again.',
      error: error.message 
    };
  }
}

/**
 * Check if a tenant can create a warehouse (suppliers only)
 * @param {string} tenantId - Supplier ID
 * @param {object} currentUsage - Current usage metrics
 * @returns {object} { allowed: boolean, reason?: string, requiredPlan?: string }
 */
async function checkWarehouseLimit(tenantId, currentUsage = null) {
  try {
    // Get tenant's current subscription and plan
    const { rows: subscriptionRows } = await query(`
      SELECT s.*, sp.limits as plan_limits, sp.code as plan_code, sp.name as plan_name
      FROM subscription s
      JOIN subscription_plan sp ON sp.id = s.plan_id
      WHERE s.tenant_id = $1 
        AND s.tenant_type = 'SUPPLIER'
        AND s.status IN ('ACTIVE', 'TRIALING')
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [tenantId]);

    if (subscriptionRows.length === 0) {
      return { 
        allowed: false, 
        reason: 'No active subscription found. Please subscribe to a plan.',
        currentPlan: 'None'
      };
    }

    const subscription = subscriptionRows[0];
    const limits = subscription.plan_limits || {};
    const warehouseLimit = limits.warehouses !== undefined ? parseInt(limits.warehouses) : -1;

    // Get current warehouse count
    let warehouseCount = currentUsage?.warehouses_count;
    if (warehouseCount === undefined || warehouseCount === null) {
      const { rows: countRows } = await query(`
        SELECT COUNT(*) as count FROM warehouse WHERE tenant_id = $1 AND is_active = TRUE
      `, [tenantId]);
      warehouseCount = parseInt(countRows[0]?.count || 0);
    }

    // Check if unlimited
    if (warehouseLimit === -1) {
      return { 
        allowed: true, 
        reason: null,
        currentPlan: subscription.plan_name,
        limit: -1,
        current: warehouseCount
      };
    }

    // Check if under limit
    if (warehouseCount < warehouseLimit) {
      return { 
        allowed: true, 
        reason: null,
        currentPlan: subscription.plan_name,
        limit: warehouseLimit,
        current: warehouseCount,
        remaining: warehouseLimit - warehouseCount
      };
    }

    // Over limit
    const eligiblePlans = ['Bronze', 'Gold', 'Platinum'];
    return { 
      allowed: false, 
      reason: `Warehouse limit reached. You have ${warehouseCount}/${warehouseLimit} warehouses on ${subscription.plan_name} plan.`,
      currentPlan: subscription.plan_name,
      requiredPlan: eligiblePlans.find(p => p !== subscription.plan_name) || 'Bronze',
      limit: warehouseLimit,
      current: warehouseCount
    };

  } catch (error) {
    logger.error('Error checking warehouse limit:', error);
    return { 
      allowed: false, 
      reason: 'Unable to verify plan limits. Please try again.',
      error: error.message 
    };
  }
}

/**
 * Create audit log entry
 */
async function createAuditLog(action, details) {
  try {
    await query(`
      INSERT INTO admin_audit_log (action_type, target_entity_type, target_entity_id, action_description, admin_user_id, changes_json)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      action,
      details.entityType || 'TENANT',
      details.entityId,
      details.description,
      details.adminUserId || null,
      JSON.stringify(details.changes || {})
    ]);
  } catch (error) {
    logger.error('Error creating audit log:', error);
    // Don't throw - audit logs are non-critical
  }
}

export {
  checkBranchLimit,
  checkWarehouseLimit,
  createAuditLog
};

