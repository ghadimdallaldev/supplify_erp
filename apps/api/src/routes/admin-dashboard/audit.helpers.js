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

async function logAudit(
  req,
  actionType,
  actionDescription,
  targetEntityType,
  targetEntityId,
  oldValue,
  newValue,
  metadata = {}
) {
  try {
    await query(
      `
      INSERT INTO admin_audit_log (
        admin_user_id, admin_name, action_type, action_description,
        target_entity_type, target_entity_id, old_value, new_value, metadata,
        ip_address, user_agent, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
      [
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
        req.get('user-agent'),
        req.requestId || null,
      ]
    )
    const tenantId = metadata.target_tenant_id || newValue?.tenant_id || oldValue?.tenant_id
    const tenantType = metadata.target_tenant_type || newValue?.tenant_type || oldValue?.tenant_type
    await writeAuditLog(req, {
      action_type: actionType,
      actor_admin_role: 'ADMIN',
      tenant_type: tenantType || undefined,
      tenant_id: tenantId || targetEntityId,
      target_id: targetEntityId,
      payload_json: {
        description: actionDescription,
        old_value: oldValue,
        new_value: newValue,
        ...metadata,
      },
    })
  } catch (error) {
    logger.error('Failed to log audit event:', error)
    // Don't throw - audit logging should not fail requests
  }
}
export { logAudit }
