import http from 'http'
import https from 'https'
import axios from 'axios'
import { config } from '../config/env.js'
import { logger } from './logger.js'

const KEYCLOAK_HTTP_TIMEOUT_MS = 10000
const ADMIN_TOKEN_SKEW_MS = 30_000

/** Reuse TLS connections to Keycloak (same pattern as auth.js). Admin API used on invite signup. */
const keycloakAdminHttp = axios.create({
  timeout: KEYCLOAK_HTTP_TIMEOUT_MS,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 20 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20 }),
})

const base = () => config.KEYCLOAK_BASE_URL.replace(/\/$/, '')

/** @type {{ token: string, expiresAtMs: number } | null} */
let cachedAdminToken = null
/** @type {Promise<string> | null} */
let adminTokenInflight = null
/** @type {Map<string, { id: string, name: string }>} */
const realmRoleCache = new Map()

/** @internal Test helper */
export function resetKeycloakAdminRuntimeCachesForTests() {
  cachedAdminToken = null
  adminTokenInflight = null
  realmRoleCache.clear()
}

async function fetchAdminToken() {
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
  const { data } = await keycloakAdminHttp.post(url, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const expiresInSec = Number(data.expires_in) || 60
  cachedAdminToken = {
    token: data.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000 - ADMIN_TOKEN_SKEW_MS,
  }
  return cachedAdminToken.token
}

export async function getKeycloakAdminToken() {
  if (cachedAdminToken && cachedAdminToken.expiresAtMs > Date.now()) {
    return cachedAdminToken.token
  }
  if (!adminTokenInflight) {
    adminTokenInflight = fetchAdminToken().finally(() => {
      adminTokenInflight = null
    })
  }
  return adminTokenInflight
}

async function getCachedRealmRole(token, roleName) {
  const cached = realmRoleCache.get(roleName)
  if (cached) return cached

  const roleUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/roles/${roleName}`
  const { data: role } = await keycloakAdminHttp.get(roleUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!role?.id) {
    throw new Error(`Get Keycloak role ${roleName} failed: missing id`)
  }
  const entry = { id: role.id, name: role.name }
  realmRoleCache.set(roleName, entry)
  return entry
}

export async function findKeycloakUserByEmail(token, email) {
  const q = encodeURIComponent(email)
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users?email=${q}&exact=true`
  const { data: users } = await keycloakAdminHttp.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return users[0] || null
}

export async function assignKeycloakRealmRole(token, userId, roleName) {
  const role = await getCachedRealmRole(token, roleName)
  const mapUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users/${userId}/role-mappings/realm`
  try {
    await keycloakAdminHttp.post(mapUrl, [{ id: role.id, name: role.name }], {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    const status = error.response?.status
    const text = error.response?.data ? JSON.stringify(error.response.data) : error.message
    throw new Error(`Assign Keycloak role ${roleName} failed: ${status || 'error'} ${text}`)
  }
}

export async function getKeycloakRealmRole(token, roleName) {
  return getCachedRealmRole(token, roleName)
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
  try {
    const res = await keycloakAdminHttp.post(
      url,
      {
        username,
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: password, temporary: false }],
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status === 201 || status === 409,
      }
    )
    if (res.status === 409) {
      const again = await findKeycloakUserByEmail(adminToken, email)
      if (again?.id) return { userId: again.id, created: false }
      throw new Error('Keycloak user already exists')
    }
    const location = res.headers.location
    const userId = location ? location.split('/').pop() : null
    if (!userId) throw new Error('No Keycloak user id in response')

    if (realmRoleName) {
      await assignKeycloakRealmRole(adminToken, userId, realmRoleName)
    }

    return { userId, created: true }
  } catch (error) {
    if (error.message?.includes('Keycloak user already exists')) throw error
    const status = error.response?.status
    const text = error.response?.data ? JSON.stringify(error.response.data) : error.message
    throw new Error(`Create Keycloak user failed: ${status || 'error'} ${text}`)
  }
}

/** Enable resource-owner password grant on supplify-api (invite signup auto-login). */
export async function ensureApiClientDirectAccessGrants() {
  const token = await getKeycloakAdminToken()
  const clientId = config.KEYCLOAK_CLIENT_ID
  const listUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/clients?clientId=${encodeURIComponent(clientId)}`
  const { data: clients } = await keycloakAdminHttp.get(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const summary = clients[0]
  if (!summary?.id) {
    throw new Error(`Keycloak client ${clientId} not found`)
  }
  if (summary.directAccessGrantsEnabled) {
    return false
  }
  const detailUrl = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/clients/${summary.id}`
  const { data: client } = await keycloakAdminHttp.get(detailUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  client.directAccessGrantsEnabled = true
  await keycloakAdminHttp.put(detailUrl, client, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  logger.info('Enabled directAccessGrants on Keycloak client', { clientId })
  return true
}

export async function setKeycloakUserEnabled(adminToken, userId, enabled) {
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users/${userId}`
  try {
    await keycloakAdminHttp.put(
      url,
      { enabled },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    const status = error.response?.status
    const text = error.response?.data ? JSON.stringify(error.response.data) : error.message
    throw new Error(`Set Keycloak user enabled=${enabled} failed: ${status || 'error'} ${text}`)
  }
}

/** Split app display name (or email local-part) into Keycloak profile fields. */
export function splitNameForKeycloak(displayName, email) {
  const parts = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) {
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'User' }
  }
  const local = String(email || '')
    .split('@')[0]
    ?.replace(/[._-]+/g, ' ')
    .trim()
  const localParts = local.split(/\s+/).filter(Boolean)
  if (localParts.length >= 2) {
    return { firstName: localParts[0], lastName: localParts.slice(1).join(' ') }
  }
  return { firstName: localParts[0] || 'User', lastName: 'User' }
}

export async function updateKeycloakUserProfile(adminToken, userId, { firstName, lastName }) {
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users/${userId}`
  try {
    await keycloakAdminHttp.put(
      url,
      {
        firstName: firstName || 'User',
        lastName: lastName || 'User',
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    const status = error.response?.status
    const text = error.response?.data ? JSON.stringify(error.response.data) : error.message
    throw new Error(`Update Keycloak profile failed: ${status || 'error'} ${text}`)
  }
}

export async function resetKeycloakUserPassword(adminToken, userId, password, temporary = true) {
  const url = `${base()}/admin/realms/${config.KEYCLOAK_REALM}/users/${userId}/reset-password`
  try {
    await keycloakAdminHttp.put(
      url,
      { type: 'password', value: password, temporary },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    const status = error.response?.status
    const text = error.response?.data ? JSON.stringify(error.response.data) : error.message
    throw new Error(`Reset Keycloak password failed: ${status || 'error'} ${text}`)
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
