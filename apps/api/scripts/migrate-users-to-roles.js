/**
 * Assign tenant_user_roles for existing users (idempotent).
 * Run after SQL migrations 0078/0079 on every environment.
 */
import { query, pool } from '../src/lib/db.js'
import {
  ensureTenantSystemRoles,
  assignOwnerRoleForUser,
  matchClosestSystemRole,
  getRoleIdByName,
  assignTenantUserRole,
} from '../src/lib/tenant-roles.js'
import { getPermissionsForUser } from '../src/lib/permissions.js'
import { disconnectCache } from '../src/lib/cache.js'
import { isMainModule } from './lib/is-main.mjs'

const unmatched = []
const TENANT_CONCURRENCY = 8

async function mapConcurrent(items, concurrency, fn) {
  if (items.length === 0) return
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++
      await fn(items[i], i)
    }
  })
  await Promise.all(workers)
}

/** True when every tenant has Owner system role and legacy user_role rows are mirrored in tenant_user_roles. */
export async function isTenantRoleBackfillComplete() {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM restaurant r
       WHERE NOT EXISTS (
         SELECT 1 FROM tenant_roles tr
         WHERE tr.tenant_id = r.id AND tr.tenant_type = 'RESTAURANT'
           AND tr.is_system = true AND tr.name = 'Owner'
       )) AS restaurants_missing_owner_role,
      (SELECT COUNT(*)::int FROM supplier s
       WHERE NOT EXISTS (
         SELECT 1 FROM tenant_roles tr
         WHERE tr.tenant_id = s.id AND tr.tenant_type = 'SUPPLIER'
           AND tr.is_system = true AND tr.name = 'Owner'
       )) AS suppliers_missing_owner_role,
      (SELECT COUNT(*)::int FROM user_role ur
       WHERE NOT EXISTS (
         SELECT 1 FROM tenant_user_roles tur
         WHERE tur.user_id = ur.user_id AND tur.tenant_id = ur.tenant_id
           AND tur.tenant_type = ur.tenant_type
       )
       AND (
         (ur.tenant_type = 'RESTAURANT' AND EXISTS (SELECT 1 FROM restaurant r WHERE r.id = ur.tenant_id))
         OR (ur.tenant_type = 'SUPPLIER' AND EXISTS (SELECT 1 FROM supplier s WHERE s.id = ur.tenant_id))
       )) AS legacy_roles_without_tenant_role
  `)
  const r = rows[0] || {}
  return (
    Number(r.restaurants_missing_owner_role) === 0 &&
    Number(r.suppliers_missing_owner_role) === 0 &&
    Number(r.legacy_roles_without_tenant_role) === 0
  )
}

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
      SELECT id FROM app_user WHERE LOWER(TRIM(email)) = LOWER(TRIM($3::text)) AND $3 <> ''
    )
    AND NOT EXISTS (
      SELECT 1 FROM tenant_user_roles tur
      WHERE tur.user_id = u.id AND tur.tenant_id = $1 AND tur.tenant_type = $2
    )
  `,
    [tenantId, tenantType, contactEmail || '']
  )

  for (const user of users) {
    const perms = await getPermissionsForUser(user.id, tenantId, tenantType)
    if (perms.length === 0) {
      await assignOwnerRoleForUser(user.id, tenantId, tenantType)
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
  }
}

export async function migrateUsersToTenantRoles() {
  if (await isTenantRoleBackfillComplete()) {
    console.log('Tenant role backfill already complete — skipping.')
    return
  }

  console.log('Migrating users to tenant named roles...\n')

  const { rows: restaurants } = await query(`SELECT id, contact_email FROM restaurant`)
  await mapConcurrent(restaurants, TENANT_CONCURRENCY, (r) =>
    migrateTenantUsers(r.id, 'RESTAURANT', r.contact_email)
  )
  console.log(`Restaurants processed: ${restaurants.length}`)

  const { rows: suppliers } = await query(`SELECT id, contact_email FROM supplier`)
  await mapConcurrent(suppliers, TENANT_CONCURRENCY, (s) =>
    migrateTenantUsers(s.id, 'SUPPLIER', s.contact_email)
  )
  console.log(`Suppliers processed: ${suppliers.length}`)

  if (unmatched.length > 0) {
    console.warn('\nUsers that required Owner fallback (review manually):')
    for (const row of unmatched) {
      console.warn(' ', row)
    }
  } else {
    console.log('\nAll users assigned without fallback.')
  }

  console.log('\nTenant role user migration complete.')
}

async function main() {
  try {
    await migrateUsersToTenantRoles()
  } finally {
    await disconnectCache()
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
