/**
 * Create or fix demo login accounts in Keycloak (admin, supplier, restaurant).
 * Use this when "Sign in with Keycloak" fails for demo users (e.g. realm was
 * imported without users, or password was wrong). Run with Keycloak and API
 * reachable; no DB required.
 *
 * Env: KEYCLOAK_BASE_URL (default http://localhost:8080), KEYCLOAK_REALM (default Supplify),
 *      KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD (default admin/admin)
 *
 * Run from repo root: pnpm run seed:demo-users
 * Run from apps/api:  node scripts/seed-demo-users.js
 */
import 'dotenv/config'

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080'
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'Supplify'
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin'

// Exactly 1 admin, 1 supplier, 1 restaurant for testing (align with reduce-to-single-tenant + seed.sql)
const DEMO_USERS = [
  {
    username: 'admin',
    email: 'admin@supplify.com',
    firstName: 'Admin',
    lastName: 'User',
    password: 'SupplifyAdmin1!',
    realmRole: 'admin',
  },
  {
    username: 'supplier',
    email: 'supplier@supplify.com',
    firstName: 'Supplier',
    lastName: 'User',
    password: 'SupplifySupplier1!',
    realmRole: 'supplier',
  },
  {
    username: 'restaurant',
    email: 'restaurant@supplify.com',
    firstName: 'Restaurant',
    lastName: 'User',
    password: 'SupplifyRestaurant1!',
    realmRole: 'restaurant',
  },
]

const base = () => KEYCLOAK_BASE_URL.replace(/\/$/, '')

async function getAdminToken() {
  const url = `${base()}/realms/master/protocol/openid-connect/token`
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `Keycloak admin token failed: ${res.status} ${text}. Is Keycloak running at ${KEYCLOAK_BASE_URL}?`
    )
  }
  const data = await res.json()
  return data.access_token
}

async function getRealmRoleId(token, roleName) {
  const url = `${base()}/admin/realms/${KEYCLOAK_REALM}/roles/${roleName}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Get role ${roleName} failed: ${res.status}`)
  const role = await res.json()
  return { id: role.id, name: role.name }
}

async function findUserByEmail(token, email) {
  const q = encodeURIComponent(email)
  const url = `${base()}/admin/realms/${KEYCLOAK_REALM}/users?email=${q}&exact=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Find user failed: ${res.status}`)
  const users = await res.json()
  return users[0] || null
}

async function createUser(token, { username, email, firstName, lastName, password, roleId }) {
  const url = `${base()}/admin/realms/${KEYCLOAK_REALM}/users`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      email,
      firstName: firstName || '',
      lastName: lastName || '',
      enabled: true,
      emailVerified: true,
      credentials: [{ type: 'password', value: password, temporary: false }],
    }),
  })
  if (res.status === 409) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Create user ${email} failed: ${res.status} ${text}`)
  }
  const location = res.headers.get('Location')
  const id = location ? location.split('/').pop() : null
  if (!id) throw new Error('No user id in response')
  const roleUrl = `${base()}/admin/realms/${KEYCLOAK_REALM}/users/${id}/role-mappings/realm`
  const roleRes = await fetch(roleUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ id: roleId.id, name: roleId.name }]),
  })
  if (!roleRes.ok) {
    const text = await roleRes.text()
    throw new Error(`Assign role to ${email} failed: ${roleRes.status} ${text}`)
  }
  return id
}

async function resetPassword(token, userId, password) {
  const url = `${base()}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/reset-password`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'password', value: password, temporary: false }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Reset password failed: ${res.status} ${text}`)
  }
}

async function getRealmRoles(token, userId) {
  const url = `${base()}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Get roles failed: ${res.status}`)
  return res.json()
}

async function addRealmRole(token, userId, roleId) {
  const url = `${base()}/admin/realms/${KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ id: roleId.id, name: roleId.name }]),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Add role failed: ${res.status} ${text}`)
  }
}

async function main() {
  console.log('🔐 Seed demo users (Keycloak)\n')
  console.log('Keycloak:', KEYCLOAK_BASE_URL, '| Realm:', KEYCLOAK_REALM)

  try {
    const token = await getAdminToken()
    console.log('Admin token obtained.\n')

    const adminRole = await getRealmRoleId(token, 'admin')
    const supplierRole = await getRealmRoleId(token, 'supplier')
    const restaurantRole = await getRealmRoleId(token, 'restaurant')
    const roleById = { admin: adminRole, supplier: supplierRole, restaurant: restaurantRole }

    for (const u of DEMO_USERS) {
      const roleId = roleById[u.realmRole]
      const existing = await findUserByEmail(token, u.email)
      if (existing) {
        await resetPassword(token, existing.id, u.password)
        const roles = await getRealmRoles(token, existing.id)
        const hasRole = roles.some((r) => r.name === u.realmRole)
        if (!hasRole) await addRealmRole(token, existing.id, roleId)
        console.log('  Updated:', u.email, `(password set, role: ${u.realmRole})`)
      } else {
        await createUser(token, {
          username: u.username,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          password: u.password,
          roleId,
        })
        console.log('  Created:', u.email, `(${u.realmRole})`)
      }
    }

    console.log('\n✅ Demo users ready (1 admin, 1 supplier, 1 restaurant). Sign in with Keycloak:')
    console.log('   Admin:      admin@supplify.com / SupplifyAdmin1!')
    console.log('   Supplier:   supplier@supplify.com / SupplifySupplier1!')
    console.log('   Restaurant: restaurant@supplify.com / SupplifyRestaurant1!')
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()
