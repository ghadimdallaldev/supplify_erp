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
