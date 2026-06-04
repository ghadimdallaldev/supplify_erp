/**
 * Central invalidation for auth / tenant / billing caches after state-changing writes.
 * Keeps /auth/me, tenant resolution, permissions, and billing status consistent.
 */
import { query } from './db.js'
import { invalidateUserBySubCache, invalidateRequestTenantCache } from './rbac.js'
import { invalidateUserPermissionCache } from './permissions.js'
import { invalidateWorkspaceAssignmentCache } from './workspace-tenant.js'
import { invalidateTenantSubscriptionCache } from './subscription.js'

/**
 * @param {{
 *   userId?: string | null
 *   keycloakSub?: string | null
 *   tenantId?: string | null
 *   tenantType?: string | null
 * }} input
 */
export async function invalidateUserAuthCaches(input = {}) {
  const { userId, tenantId, tenantType } = input
  let { keycloakSub } = input

  if (!keycloakSub && userId) {
    const { rows } = await query('SELECT keycloak_sub FROM app_user WHERE id = $1 LIMIT 1', [
      userId,
    ])
    keycloakSub = rows[0]?.keycloak_sub ?? null
  }

  if (keycloakSub) {
    await invalidateUserBySubCache(keycloakSub)
  }

  if (userId && tenantId && tenantType) {
    await Promise.all([
      invalidateUserPermissionCache(userId, tenantId, tenantType),
      invalidateWorkspaceAssignmentCache(userId, tenantType),
      invalidateRequestTenantCache(userId, tenantType),
    ])
  }

  if (tenantId && tenantType) {
    await invalidateTenantSubscriptionCache(tenantId, tenantType)
  }
}
