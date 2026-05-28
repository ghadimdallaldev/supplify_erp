import { config } from '../config/env.js'
import { logger } from './logger.js'

const base = () => config.KEYCLOAK_BASE_URL.replace(/\/$/, '')

export async function getKeycloakAdminToken() {
  const username = config.KEYCLOAK_ADMIN || 'admin'
  const password = config.KEYCLOAK_ADMIN_PASSWORD
  if (!password) {
    throw new Error('KEYCLOAK_ADMIN_PASSWORD is not configured')
  }
  const url = `${base()}/realms/master/protocol/openid-connect/token`
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username,
    password,
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Keycloak admin token failed: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data.access_token
}

export async function findKeycloakUserByEmail(token, email) {
  const q = encodeURIComponent(email)
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users?email=${q}&exact=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Find Keycloak user failed: ${res.status}`)
  const users = await res.json()
  return users[0] || null
}

export async function assignKeycloakRealmRole(token, userId, roleName) {
  const roleUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/roles/${roleName}`
  const roleRes = await fetch(roleUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!roleRes.ok) throw new Error(`Get Keycloak role ${roleName} failed: ${roleRes.status}`)
  const role = await roleRes.json()
  const mapUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`
  const res = await fetch(mapUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ id: role.id, name: role.name }]),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Assign Keycloak role ${roleName} failed: ${res.status} ${text}`)
  }
}

export async function getKeycloakRealmRole(token, roleName) {
  const roleUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/roles/${roleName}`
  const roleRes = await fetch(roleUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!roleRes.ok) throw new Error(`Get Keycloak role ${roleName} failed: ${roleRes.status}`)
  return roleRes.json()
}

export async function createKeycloakUserWithPassword({
  email,
  firstName,
  lastName,
  password,
  realmRoleName = 'SUPPLIER',
}) {
  const adminToken = await getKeycloakAdminToken()
  const existing = await findKeycloakUserByEmail(adminToken, email)
  if (existing?.id) {
    return { userId: existing.id, created: false }
  }

  const username = email.split('@')[0] || email
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
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
  if (res.status === 409) {
    const again = await findKeycloakUserByEmail(adminToken, email)
    if (again?.id) return { userId: again.id, created: false }
    throw new Error('Keycloak user already exists')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Create Keycloak user failed: ${res.status} ${text}`)
  }
  const location = res.headers.get('Location')
  const userId = location ? location.split('/').pop() : null
  if (!userId) throw new Error('No Keycloak user id in response')

  if (realmRoleName) {
    await assignKeycloakRealmRole(adminToken, userId, realmRoleName)
  }

  return { userId, created: true }
}

/** Enable resource-owner password grant on supplify-api (invite signup auto-login). */
export async function ensureApiClientDirectAccessGrants() {
  const token = await getKeycloakAdminToken()
  const clientId = config.KEYCLOAK_CLIENT_ID
  const listUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/clients?clientId=${encodeURIComponent(clientId)}`
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!listRes.ok) {
    throw new Error(`List Keycloak client failed: ${listRes.status}`)
  }
  const clients = await listRes.json()
  const summary = clients[0]
  if (!summary?.id) {
    throw new Error(`Keycloak client ${clientId} not found`)
  }
  if (summary.directAccessGrantsEnabled) {
    return false
  }
  const detailUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/clients/${summary.id}`
  const detailRes = await fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!detailRes.ok) {
    throw new Error(`Get Keycloak client failed: ${detailRes.status}`)
  }
  const client = await detailRes.json()
  client.directAccessGrantsEnabled = true
  const updateRes = await fetch(detailUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(client),
  })
  if (!updateRes.ok) {
    const text = await updateRes.text()
    throw new Error(`Update Keycloak client failed: ${updateRes.status} ${text}`)
  }
  logger.info('Enabled directAccessGrants on Keycloak client', { clientId })
  return true
}

export async function setKeycloakUserEnabled(adminToken, userId, enabled) {
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users/${userId}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Set Keycloak user enabled=${enabled} failed: ${res.status} ${text}`)
  }
}

export async function resetKeycloakUserPassword(adminToken, userId, password, temporary = true) {
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users/${userId}/reset-password`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'password', value: password, temporary }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Reset Keycloak password failed: ${res.status} ${text}`)
  }
}

export async function ensureKeycloakRealmRole(email, roleName) {
  try {
    const token = await getKeycloakAdminToken()
    const user = await findKeycloakUserByEmail(token, email)
    if (!user?.id) {
      logger.warn('Keycloak user not found for realm role assignment', { email })
      return false
    }
    await assignKeycloakRealmRole(token, user.id, roleName)
    return true
  } catch (err) {
    logger.error('ensureKeycloakRealmRole failed', { email, roleName, error: err.message })
    return false
  }
}
