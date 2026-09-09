import { query } from './db.js'
import { getKeycloakAdminToken, setKeycloakUserDriverLogin } from './keycloak-admin.js'
import { logger } from './logger.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const stateCache = new Map()

/**
 * Synchronize the Keycloak OTP-friction marker from authoritative tenant roles.
 * A user is treated as a driver if they have at least one active supplier Driver role.
 * Keycloak update failures intentionally fail closed: the user keeps normal OTP protection.
 */
export async function syncDriverLoginPolicyForUser(userId) {
  if (!userId) return { enabled: false, updated: false, reason: 'missing_user' }

  const cached = stateCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.result

  const { rows: userRows } = await query(
    `SELECT keycloak_sub FROM app_user WHERE id = $1 LIMIT 1`,
    [userId]
  )
  const keycloakSub = userRows[0]?.keycloak_sub
  if (!keycloakSub) {
    return remember(userId, { enabled: false, updated: false, reason: 'missing_keycloak_sub' })
  }

  const { rows } = await query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM tenant_user_roles tur
      JOIN tenant_roles tr ON tr.id = tur.role_id
      WHERE tur.user_id = $1
        AND tur.tenant_type = 'SUPPLIER'
        AND tr.name = 'Driver'
        AND COALESCE(tr.is_active, true) = true
    ) AS is_driver
    `,
    [userId]
  )
  const enabled = rows[0]?.is_driver === true

  try {
    const adminToken = await getKeycloakAdminToken()
    await setKeycloakUserDriverLogin(adminToken, keycloakSub, enabled)
    return remember(userId, { enabled, updated: true })
  } catch (error) {
    logger.warn('Driver login policy synchronization failed; retaining normal OTP', {
      userId,
      enabled,
      error: error.message,
    })
    return remember(userId, { enabled: false, updated: false, reason: 'keycloak_unavailable' })
  }
}

export function invalidateDriverLoginPolicyCache(userId) {
  if (userId) stateCache.delete(userId)
}

function remember(userId, result) {
  stateCache.set(userId, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}
