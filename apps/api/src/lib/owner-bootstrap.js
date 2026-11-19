import { withTransaction } from './db.js'
import { userIsVerifiedTenantOwner, assignOwnerRoleForUser } from './tenant-roles.js'

/** Only a verified owner or the contact of a memberless legacy tenant can bootstrap. */
export async function bootstrapVerifiedTenantOwner(userId, tenantId, tenantType) {
  if (!userId || !tenantId || !['RESTAURANT', 'SUPPLIER'].includes(tenantType)) return false
  return withTransaction(async (client) => {
    const table = tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'
    const { rows: tenants } = await client.query(
      `SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`,
      [tenantId]
    )
    if (!tenants.length) return false
    const { rows } = await client.query(
      `SELECT email FROM app_user WHERE id = $1 AND COALESCE(is_active, TRUE)
      AND NOT EXISTS (SELECT 1 FROM user_workspace_membership m WHERE m.user_id = app_user.id AND m.status = 'revoked')`,
      [userId]
    )
    if (
      !rows[0] ||
      !(await userIsVerifiedTenantOwner(userId, rows[0].email, tenantId, tenantType, client))
    )
      return false
    return assignOwnerRoleForUser(userId, tenantId, tenantType, null, client)
  })
}
