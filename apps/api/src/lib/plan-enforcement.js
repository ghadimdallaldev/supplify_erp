// Plan enforcement utilities for branches and warehouses
import { query } from './db.js'
import { logger } from './logger.js'
import { getWarehouseSupplierColumn } from './warehouse-helpers.js'
import { resolveOrgBillingTenantId } from './org-billing-tenant.js'
import { getTenantSubscription } from './subscription.js'
import { resolveEffectiveLimit } from './limit-resolution.js'
import {
  ENTERPRISE_BRANCH_THRESHOLD,
  addonKeyForLimitKey,
  canPurchaseLocationAddons,
  computeEffectiveWithAddons,
  getAddonQuantity,
} from './subscription-addons.js'

/**
 * Count location accounts for plan enforcement and usage meters.
 * Prefers org sub-tenants (restaurant/supplier rows under organization_id);
 * falls back to primary + tenant_account_link for legacy linked accounts.
 */
export async function countActiveBranchLocations(tenantId, tenantType) {
  const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
  const { rows: orgRows } = await query(`SELECT organization_id FROM ${table} WHERE id = $1`, [
    tenantId,
  ])
  const organizationId = orgRows[0]?.organization_id
  if (organizationId) {
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS count FROM ${table}
       WHERE organization_id = $1 AND is_branch_active = TRUE`,
      [organizationId]
    )
    return parseInt(countRows[0]?.count || 0, 10)
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS count FROM tenant_account_link
     WHERE parent_tenant_id = $1 AND parent_tenant_type = $2`,
    [tenantId, tenantType]
  )
  const linked = parseInt(countRows[0]?.count || 0, 10)
  return 1 + linked
}

/**
 * Count active warehouses for the supplier org (all branch tenants) or single tenant.
 */
export async function countActiveWarehouses(tenantId) {
  const supplierCol = await getWarehouseSupplierColumn()
  const { rows: orgRows } = await query(`SELECT organization_id FROM supplier WHERE id = $1`, [
    tenantId,
  ])
  const organizationId = orgRows[0]?.organization_id
  if (organizationId) {
    const { rows: suppliers } = await query(`SELECT id FROM supplier WHERE organization_id = $1`, [
      organizationId,
    ])
    const ids = suppliers.map((r) => r.id)
    if (ids.length === 0) return 0
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS count FROM warehouse
       WHERE ${supplierCol} = ANY($1::uuid[]) AND is_active = TRUE`,
      [ids]
    )
    return parseInt(countRows[0]?.count || 0, 10)
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS count FROM warehouse WHERE ${supplierCol} = $1 AND is_active = TRUE`,
    [tenantId]
  )
  return parseInt(countRows[0]?.count || 0, 10)
}

async function loadBillingSubscription(tenantId, tenantType) {
  const billingTenantId = await resolveOrgBillingTenantId(tenantId, tenantType)
  const subscription = await getTenantSubscription(billingTenantId, tenantType, {
    skipOrgBilling: true,
  })
  return { billingTenantId, subscription }
}

async function resolveLocationLimitContext(tenantId, tenantType, limitKey, currentUsage = null) {
  const { billingTenantId, subscription } = await loadBillingSubscription(tenantId, tenantType)

  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found. Please subscribe to a plan.',
      currentPlan: 'None',
      billingTenantId,
      action: 'NO_SUBSCRIPTION',
    }
  }

  const planCode = subscription.plan_code || ''
  const planName = subscription.plan_name || subscription.plan_display_name || planCode
  const planLimits = subscription.limits || {}

  const resolved = await resolveEffectiveLimit({
    tenantId: billingTenantId,
    tenantType,
    limitKey,
    planId: subscription.plan_id,
    planLimits,
  })

  let includedLimit = resolved.effectiveLimit
  if (resolved.isUnlimited) {
    includedLimit = null
  }

  const addonKey = addonKeyForLimitKey(tenantType, limitKey)
  const addonQuantity = addonKey ? await getAddonQuantity(billingTenantId, tenantType, addonKey) : 0
  const effectiveLimit =
    includedLimit != null ? computeEffectiveWithAddons(includedLimit, addonQuantity) : null

  let current = currentUsage?.[`${limitKey}_count`]
  if (current === undefined || current === null) {
    if (limitKey === 'branches') {
      current = await countActiveBranchLocations(tenantId, tenantType)
    } else if (limitKey === 'warehouses') {
      current = await countActiveWarehouses(tenantId)
    } else {
      current = 0
    }
  }

  return {
    billingTenantId,
    subscription,
    planCode,
    planName,
    includedLimit,
    addonQuantity,
    effectiveLimit,
    current,
    addonKey,
    canPurchaseAddons: canPurchaseLocationAddons(planCode),
  }
}

function buildBranchBlockResult(ctx) {
  const {
    planName,
    planCode,
    includedLimit,
    addonQuantity,
    effectiveLimit,
    current,
    canPurchaseAddons,
  } = ctx

  if (limitKeyIsBranches(ctx) && current >= ENTERPRISE_BRANCH_THRESHOLD) {
    return {
      allowed: false,
      reason: 'For more than 6 branches, contact sales for Enterprise.',
      currentPlan: planName,
      limit: effectiveLimit,
      includedLimit,
      addonQuantity,
      effectiveLimit,
      current,
      action: 'CONTACT_ENTERPRISE',
      enterpriseThreshold: ENTERPRISE_BRANCH_THRESHOLD,
    }
  }

  if (effectiveLimit != null && current >= effectiveLimit) {
    if (canPurchaseAddons) {
      return {
        allowed: false,
        reason:
          'You have reached your included branch limit. Add an extra branch or upgrade your plan.',
        currentPlan: planName,
        limit: effectiveLimit,
        includedLimit,
        addonQuantity,
        effectiveLimit,
        current,
        action: 'ADDON_OR_UPGRADE',
        requiredPlan: planCode.toLowerCase() === 'gold' ? 'Platinum' : 'Gold',
      }
    }

    const planLower = (planCode || '').toLowerCase()
    if (planLower === 'free' || planLower.includes('trial')) {
      return {
        allowed: false,
        reason:
          'Extra branch accounts are not available on Free Trial. Upgrade to Gold to add locations.',
        currentPlan: planName,
        limit: effectiveLimit,
        includedLimit,
        addonQuantity,
        effectiveLimit,
        current,
        action: 'UPGRADE_TO_GOLD',
        requiredPlan: 'Gold',
      }
    }

    return {
      allowed: false,
      reason: `Branch limit reached (${current}/${effectiveLimit} locations on ${planName}). Upgrade to Gold to add more branches.`,
      currentPlan: planName,
      limit: effectiveLimit,
      includedLimit,
      addonQuantity,
      effectiveLimit,
      current,
      action: 'UPGRADE_TO_GOLD',
      requiredPlan: 'Gold',
    }
  }

  return null
}

function limitKeyIsBranches(ctx) {
  return ctx.limitKey === 'branches' || !ctx.limitKey
}

function buildWarehouseBlockResult(ctx) {
  const {
    planName,
    planCode,
    includedLimit,
    addonQuantity,
    effectiveLimit,
    current,
    canPurchaseAddons,
  } = ctx

  if (includedLimit === 0 && effectiveLimit === 0) {
    return {
      allowed: false,
      reason:
        'Warehouses are not available on Free Trial. Upgrade to Silver or higher to add a warehouse.',
      currentPlan: planName,
      limit: 0,
      includedLimit: 0,
      addonQuantity: 0,
      effectiveLimit: 0,
      current,
      action: 'UPGRADE_TO_SILVER',
      requiredPlan: 'Silver',
    }
  }

  if (effectiveLimit != null && current >= effectiveLimit) {
    if (canPurchaseAddons) {
      return {
        allowed: false,
        reason:
          'You have reached your included warehouse limit. Add an extra warehouse or upgrade your plan.',
        currentPlan: planName,
        limit: effectiveLimit,
        includedLimit,
        addonQuantity,
        effectiveLimit,
        current,
        action: 'ADDON_OR_UPGRADE',
        requiredPlan: planCode.toLowerCase() === 'gold' ? 'Platinum' : 'Gold',
      }
    }

    const planLower = (planCode || '').toLowerCase()
    if (planLower === 'free' || planLower.includes('trial')) {
      return {
        allowed: false,
        reason:
          'Extra warehouses are not available on Free Trial. Upgrade to Silver for your first warehouse.',
        currentPlan: planName,
        limit: effectiveLimit,
        includedLimit,
        addonQuantity,
        effectiveLimit,
        current,
        action: 'UPGRADE_TO_SILVER',
        requiredPlan: 'Silver',
      }
    }

    return {
      allowed: false,
      reason: `Warehouse limit reached (${current}/${effectiveLimit} on ${planName}). Upgrade your plan for more warehouses.`,
      currentPlan: planName,
      limit: effectiveLimit,
      includedLimit,
      addonQuantity,
      effectiveLimit,
      current,
      action: 'UPGRADE_PLAN',
      requiredPlan: 'Gold',
    }
  }

  return null
}

async function checkLocationLimit(tenantId, tenantType, limitKey, currentUsage = null) {
  try {
    const ctx = await resolveLocationLimitContext(tenantId, tenantType, limitKey, currentUsage)
    if (ctx.allowed === false && ctx.reason && !ctx.subscription) {
      return ctx
    }

    const { subscription, planName, effectiveLimit, current, includedLimit, addonQuantity } = ctx

    if (limitKey === 'branches' && current >= ENTERPRISE_BRANCH_THRESHOLD) {
      const enterpriseBlock = buildBranchBlockResult({ ...ctx, limitKey })
      if (enterpriseBlock) return enterpriseBlock
    }

    if (effectiveLimit == null) {
      return {
        allowed: true,
        reason: null,
        currentPlan: planName,
        limit: null,
        includedLimit,
        addonQuantity,
        effectiveLimit: null,
        current,
      }
    }

    if (current < effectiveLimit) {
      return {
        allowed: true,
        reason: null,
        currentPlan: planName,
        limit: effectiveLimit,
        includedLimit,
        addonQuantity,
        effectiveLimit,
        current,
        remaining: effectiveLimit - current,
        overIncludedLimit: current >= (includedLimit ?? effectiveLimit),
      }
    }

    const blockCtx = { ...ctx, limitKey }
    const blocked =
      limitKey === 'warehouses'
        ? buildWarehouseBlockResult(blockCtx)
        : buildBranchBlockResult(blockCtx)

    return (
      blocked || {
        allowed: false,
        reason: `Limit reached (${current}/${effectiveLimit}).`,
        currentPlan: planName,
        limit: effectiveLimit,
        includedLimit,
        addonQuantity,
        effectiveLimit,
        current,
        action: 'LIMIT_REACHED',
      }
    )
  } catch (error) {
    logger.error(`Error checking ${limitKey} limit:`, error)
    return {
      allowed: false,
      reason: 'Unable to verify plan limits. Please try again.',
      error: error.message,
    }
  }
}

/**
 * Check if a tenant can create a branch (restaurants only)
 */
async function checkBranchLimit(tenantId, currentUsage = null) {
  return checkLocationLimit(tenantId, 'RESTAURANT', 'branches', currentUsage)
}

/**
 * Check if a tenant can create a warehouse (suppliers only)
 */
async function checkWarehouseLimit(tenantId, currentUsage = null) {
  return checkLocationLimit(tenantId, 'SUPPLIER', 'warehouses', currentUsage)
}

/** Linked branch accounts for suppliers (same model as restaurant branches). */
async function checkLinkedAccountLimit(tenantId, tenantType, currentUsage = null) {
  if (tenantType === 'RESTAURANT') {
    return checkBranchLimit(tenantId, currentUsage)
  }
  return checkLocationLimit(tenantId, 'SUPPLIER', 'branches', currentUsage)
}

/**
 * Create audit log entry (uses admin_audit_log columns: old_value, new_value, metadata)
 */
async function createAuditLog(action, details) {
  try {
    await query(
      `
      INSERT INTO admin_audit_log (action_type, target_entity_type, target_entity_id, action_description, admin_user_id, old_value, new_value, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        action,
        details.entityType || 'TENANT',
        details.entityId,
        details.description,
        details.adminUserId || null,
        details.oldValue ? JSON.stringify(details.oldValue) : null,
        details.newValue ? JSON.stringify(details.newValue) : null,
        JSON.stringify(details.changes || details.metadata || {}),
      ]
    )
  } catch (error) {
    logger.error('Error creating audit log:', error)
  }
}

export {
  checkBranchLimit,
  checkWarehouseLimit,
  checkLinkedAccountLimit,
  createAuditLog,
  resolveLocationLimitContext,
}
