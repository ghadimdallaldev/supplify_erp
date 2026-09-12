/**
 * Create one login per system tenant role for the dev supplier and restaurant
 * (non-destructive — does not wipe commercial data).
 *
 * Run (Railway dev):
 *   cd apps/api && railway run node scripts/seed-dev-role-matrix-users.js
 *
 * Run (local):
 *   pnpm run seed:dev-role-users
 *
 * Env:
 *   DEV_SUPPLIER_EMAIL   — owner / tenant lookup (default supplier@supplify.com)
 *   DEV_RESTAURANT_EMAIL — owner / tenant lookup (default restaurant@supplify.com)
 *   SEED_ACCOUNTS_PASSWORD — shared password (default Supplify1!)
 *   SKIP_KEYCLOAK=true   — DB only
 */
import 'dotenv/config'
import { pool } from '../src/lib/db.js'
import { disconnectCache } from '../src/lib/cache.js'
import { assignDefaultRoleForTenant } from '../src/lib/rbac.js'
import {
  RESTAURANT_SYSTEM_ROLES,
  SUPPLIER_SYSTEM_ROLES,
  ensureTenantSystemRoles,
  assignTenantUserRole,
} from '../src/lib/tenant-roles.js'
import { bindUserToWorkspace, resolveWorkspaceScope } from '../src/lib/workspace-membership.js'
import { isMainModule } from './lib/is-main.mjs'
import { SEED_PASSWORD } from './seed/tierDefinitions.js'

const SUPPLIER_OWNER_EMAIL = (
  process.env.DEV_SUPPLIER_EMAIL || 'supplier@supplify.com'
).toLowerCase()
const RESTAURANT_OWNER_EMAIL = (
  process.env.DEV_RESTAURANT_EMAIL || 'restaurant@supplify.com'
).toLowerCase()
const PASSWORD = process.env.SEED_ACCOUNTS_PASSWORD || SEED_PASSWORD

function roleSlug(roleName) {
  return roleName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function emailForRole(prefix, roleName) {
  return `${prefix}-${roleSlug(roleName)}@supplify.com`
}

async function findTenantByContactEmail(client, table, email) {
  const tenantType = table === 'supplier' ? 'SUPPLIER' : 'RESTAURANT'
  const { rows } = await client.query(
    `SELECT id, name, slug, contact_email FROM ${table}
     WHERE LOWER(TRIM(contact_email)) = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [email]
  )
  if (!rows[0]) {
    throw new Error(`No ${tenantType} tenant with contact_email=${email}`)
  }
  return { ...rows[0], tenantType }
}

async function getRoleIdByNameWithClient(client, tenantId, tenantType, roleName) {
  const { rows } = await client.query(
    `SELECT id FROM tenant_roles
     WHERE tenant_id = $1 AND tenant_type = $2 AND name = $3`,
    [tenantId, tenantType, roleName]
  )
  return rows[0]?.id || null
}

async function upsertAppUser(client, { email, displayName, appRole, keycloakSub }) {
  const bySub = await client.query(`SELECT id FROM app_user WHERE keycloak_sub = $1 LIMIT 1`, [
    keycloakSub,
  ])
  if (bySub.rows[0]) {
    const { rows } = await client.query(
      `UPDATE app_user SET email = $2, display_name = $3, role = $4, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [bySub.rows[0].id, email, displayName, appRole]
    )
    return rows[0].id
  }

  const { rows } = await client.query(
    `INSERT INTO app_user (keycloak_sub, email, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       keycloak_sub = CASE
         WHEN app_user.keycloak_sub LIKE 'seed-%' OR app_user.keycloak_sub IS NULL
           THEN EXCLUDED.keycloak_sub
         ELSE app_user.keycloak_sub
       END,
       updated_at = now()
     RETURNING id`,
    [keycloakSub, email, displayName, appRole]
  )
  return rows[0].id
}

export async function seedRoleUsersForTenant(client, tenant, ownerEmail, roleDefs, emailPrefix) {
  const appRole = tenant.tenantType
  const scope = await resolveWorkspaceScope(tenant.id, tenant.tenantType, client)
  const accounts = []
  const lines = []

  await ensureTenantSystemRoles(tenant.id, tenant.tenantType, client)

  let ownerUserId = null
  const ownerRoleDef = roleDefs.find((r) => r.name === 'Owner')
  if (ownerRoleDef) {
    ownerUserId = await upsertAppUser(client, {
      email: ownerEmail,
      displayName: `${tenant.name} Owner`,
      appRole,
      keycloakSub: `seed-${tenant.slug || tenant.id}-owner`,
    })
    await assignDefaultRoleForTenant(ownerUserId, tenant.id, tenant.tenantType)
    const ownerRoleId = await getRoleIdByNameWithClient(
      client,
      tenant.id,
      tenant.tenantType,
      'Owner'
    )
    if (ownerRoleId) {
      await assignTenantUserRole({
        userId: ownerUserId,
        roleId: ownerRoleId,
        tenantId: tenant.id,
        tenantType: tenant.tenantType,
      })
    }
    await bindUserToWorkspace(
      {
        userId: ownerUserId,
        workspaceType: scope.workspaceType,
        organizationId: scope.organizationId,
        homeTenantId: scope.homeTenantId,
        isMainAdmin: true,
      },
      client
    )
    accounts.push({
      email: ownerEmail,
      username: ownerEmail.split('@')[0],
      realmRole: appRole.toLowerCase(),
    })
    lines.push(`  Owner: ${ownerEmail}`)
  }

  for (const roleDef of roleDefs) {
    if (roleDef.name === 'Owner') continue
    const email = emailForRole(emailPrefix, roleDef.name)
    const userId = await upsertAppUser(client, {
      email,
      displayName: `${tenant.name} ${roleDef.name}`,
      appRole,
      keycloakSub: `seed-${tenant.slug || tenant.id}-${roleSlug(roleDef.name)}`,
    })
    const roleId = await getRoleIdByNameWithClient(
      client,
      tenant.id,
      tenant.tenantType,
      roleDef.name
    )
    if (!roleId)
      throw new Error(`Missing role ${roleDef.name} on ${tenant.tenantType} ${tenant.id}`)
    await assignTenantUserRole({
      userId,
      roleId,
      tenantId: tenant.id,
      tenantType: tenant.tenantType,
      assignedBy: ownerUserId,
    })
    await bindUserToWorkspace(
      {
        userId,
        workspaceType: scope.workspaceType,
        organizationId: scope.organizationId,
        homeTenantId: scope.homeTenantId,
        isMainAdmin: false,
      },
      client
    )
    accounts.push({
      email,
      username: email.split('@')[0],
      realmRole: appRole.toLowerCase(),
    })
    lines.push(`  ${roleDef.name}: ${email}`)
  }

  return { accounts, lines, tenantName: tenant.name }
}

export async function ensureKeycloakAccounts(accounts) {
  if (process.env.SKIP_KEYCLOAK === 'true') {
    console.log('   SKIP_KEYCLOAK=true — Keycloak users not updated')
    return
  }

  const KEYCLOAK_BASE_URL =
    process.env.KEYCLOAK_URL ||
    process.env.KEYCLOAK_PUBLIC_URL ||
    process.env.KEYCLOAK_BASE_URL ||
    'http://localhost:8180'
  const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'Supplify'
  const ADMIN_USERNAME =
    process.env.KEYCLOAK_ADMIN || process.env.KEYCLOAK_ADMIN_USERNAME || 'admin'
  const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin'

  const tokenRes = await fetch(
    `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
    }
  )
  if (!tokenRes.ok) {
    console.warn('   ⚠ Keycloak unavailable — DB users created; sync Keycloak manually')
    return
  }
  const { access_token: token } = await tokenRes.json()
  const base = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/admin/realms/${KEYCLOAK_REALM}`

  for (const acc of accounts) {
    const roleRes = await fetch(`${base}/roles/${acc.realmRole}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!roleRes.ok) continue
    const role = await roleRes.json()

    const findRes = await fetch(`${base}/users?email=${encodeURIComponent(acc.email)}&exact=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    let userId = (await findRes.json())[0]?.id

    if (!userId) {
      const createRes = await fetch(`${base}/users`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: acc.username,
          email: acc.email,
          firstName: acc.email.split('@')[0],
          lastName: 'User',
          enabled: true,
          emailVerified: true,
          credentials: [{ type: 'password', value: PASSWORD, temporary: false }],
        }),
      })
      if (createRes.status === 409) {
        const retry = await fetch(
          `${base}/users?email=${encodeURIComponent(acc.email)}&exact=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        userId = (await retry.json())[0]?.id
      } else if (createRes.ok) {
        userId = createRes.headers.get('Location')?.split('/').pop()
      }
    }

    if (userId) {
      await fetch(`${base}/users/${userId}/reset-password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', value: PASSWORD, temporary: false }),
      })
      await fetch(`${base}/users/${userId}/role-mappings/realm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id: role.id, name: role.name }]),
      })
    }
  }
  console.log(`   Keycloak users synced (${accounts.length} accounts)`)
}

export async function seedDevRoleMatrixUsers() {
  const client = await pool.connect()
  const allAccounts = []
  const report = []

  try {
    const supplier = await findTenantByContactEmail(client, 'supplier', SUPPLIER_OWNER_EMAIL)
    const restaurant = await findTenantByContactEmail(client, 'restaurant', RESTAURANT_OWNER_EMAIL)

    const supplierResult = await seedRoleUsersForTenant(
      client,
      supplier,
      SUPPLIER_OWNER_EMAIL,
      SUPPLIER_SYSTEM_ROLES,
      'dev-supplier'
    )
    const restaurantResult = await seedRoleUsersForTenant(
      client,
      restaurant,
      RESTAURANT_OWNER_EMAIL,
      RESTAURANT_SYSTEM_ROLES,
      'dev-restaurant'
    )

    allAccounts.push(...supplierResult.accounts, ...restaurantResult.accounts)
    report.push(`Supplier (${supplierResult.tenantName}):`, ...supplierResult.lines, '')
    report.push(`Restaurant (${restaurantResult.tenantName}):`, ...restaurantResult.lines)
  } finally {
    client.release()
  }

  await ensureKeycloakAccounts(allAccounts)

  console.log('\n✅ Dev role-matrix users ready')
  console.log(`Password for all accounts: ${PASSWORD}\n`)
  console.log(report.join('\n'))
  console.log('\nLog in at https://app-dev.supplifyerp.com with Keycloak\n')
}

async function main() {
  console.log('👥 Seeding dev supplier + restaurant users (all system roles)...\n')
  console.log(`   Supplier owner lookup: ${SUPPLIER_OWNER_EMAIL}`)
  console.log(`   Restaurant owner lookup: ${RESTAURANT_OWNER_EMAIL}\n`)
  try {
    await seedDevRoleMatrixUsers()
  } finally {
    await disconnectCache()
    await pool.end()
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
