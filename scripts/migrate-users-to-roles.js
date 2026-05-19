/**
 * One-time migration: assign tenant_user_roles for existing users.
 * Idempotent — safe to run multiple times.
 *
 * Usage: node scripts/migrate-users-to-roles.js
 * (from repo root; loads apps/api db config)
 */
import { fileURLToPath } from 'url'
import path from 'path'

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/api')
process.chdir(apiRoot)

const { query } = await import('./src/lib/db.js')
const {
  ensureTenantSystemRoles,
  assignOwnerRoleForUser,
  matchClosestSystemRole,
  getRoleIdByName,
  assignTenantUserRole,
} = await import('./src/lib/tenant-roles.js')
const { getPermissionsForUser, invalidateUserPermissionCache } = await import(
  './src/lib/permissions.js'
)

const unmatched = []

async function migrateTenantUsers(tenantId, tenantType, contactEmail) {
  await ensureTenantSystemRoles(tenantId, tenantType)

  const { rows: users } = await query(
    `
    SELECT DISTINCT u.id, u.email
    FROM app_user u
    WHERE u.id IN (
      SELECT ur.user_id FROM user_role ur
      WHERE ur.tenant_id = $1 AND ur.tenant_type = $2
      UNION
      SELECT id FROM app_user WHERE LOWER(TRIM(email)) = LOWER(TRIM($3::text))
    )
  `,
    [tenantId, tenantType, contactEmail || '']
  )

  for (const user of users) {
    const { rows: existing } = await query(
      `SELECT 1 FROM tenant_user_roles WHERE user_id = $1 AND tenant_id = $2 AND tenant_type = $3`,
      [user.id, tenantId, tenantType]
    )
    if (existing.length > 0) continue

    const perms = await getPermissionsForUser(user.id, tenantId, tenantType)
    if (perms.length === 0) {
      await assignOwnerRoleForUser(user.id, tenantId, tenantType)
      await invalidateUserPermissionCache(user.id, tenantId, tenantType)
      continue
    }

    const roleName = matchClosestSystemRole(perms, tenantType)
    const roleId = await getRoleIdByName(tenantId, tenantType, roleName)
    if (!roleId) {
      unmatched.push({ userId: user.id, email: user.email, tenantId, tenantType, roleName })
      await assignOwnerRoleForUser(user.id, tenantId, tenantType)
    } else {
      await assignTenantUserRole({
        userId: user.id,
        roleId,
        tenantId,
        tenantType,
        assignedBy: null,
      })
    }
    await invalidateUserPermissionCache(user.id, tenantId, tenantType)
  }
}

async function main() {
  console.log('Migrating users to tenant named roles...\n')

  const { rows: restaurants } = await query(`SELECT id, contact_email FROM restaurant`)
  for (const r of restaurants) {
    await migrateTenantUsers(r.id, 'RESTAURANT', r.contact_email)
  }
  console.log(`Restaurants processed: ${restaurants.length}`)

  const { rows: suppliers } = await query(`SELECT id, contact_email FROM supplier`)
  for (const s of suppliers) {
    await migrateTenantUsers(s.id, 'SUPPLIER', s.contact_email)
  }
  console.log(`Suppliers processed: ${suppliers.length}`)

  if (unmatched.length > 0) {
    console.warn('\nUsers that required Owner fallback (review manually):')
    for (const row of unmatched) {
      console.warn(' ', row)
    }
  } else {
    console.log('\nAll users assigned without fallback.')
  }

  console.log('\nDone.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
