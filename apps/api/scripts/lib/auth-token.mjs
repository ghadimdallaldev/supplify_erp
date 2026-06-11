/**
 * Keycloak token helper for dev API smoke tests.
 * Prefers SUPPLIFY_*_TOKEN env overrides; falls back to password grant.
 */

export const ROLE_CONFIG = {
  admin: {
    tokenEnv: 'SUPPLIFY_ADMIN_TOKEN',
    emailEnv: 'E2E_ADMIN_EMAIL',
    passwordEnv: 'E2E_ADMIN_PASSWORD',
    defaultEmail: 'admin@supplify.com',
    defaultPassword: 'SupplifyAdmin1!',
  },
  supplier: {
    tokenEnv: 'SUPPLIFY_SUPPLIER_TOKEN',
    emailEnv: 'E2E_SUPPLIER_EMAIL',
    passwordEnv: 'E2E_SUPPLIER_PASSWORD',
    defaultEmail: 'supplier@supplify.com',
    defaultPassword: 'SupplifySupplier1!',
  },
  restaurant: {
    tokenEnv: 'SUPPLIFY_RESTAURANT_TOKEN',
    emailEnv: 'E2E_RESTAURANT_EMAIL',
    passwordEnv: 'E2E_RESTAURANT_PASSWORD',
    defaultEmail: 'restaurant@supplify.com',
    defaultPassword: 'SupplifyRestaurant1!',
  },
  staff: {
    tokenEnv: 'SUPPLIFY_STAFF_TOKEN',
    emailEnv: 'E2E_STAFF_EMAIL',
    passwordEnv: 'E2E_STAFF_PASSWORD',
    defaultEmail: null,
    defaultPassword: null,
  },
}

const tokenCache = new Map()

function getKeycloakTokenUrl() {
  const base =
    process.env.KEYCLOAK_BASE_URL ||
    process.env.KEYCLOAK_URL ||
    process.env.KEYCLOAK_PUBLIC_URL ||
    'http://localhost:8180'
  const realm = process.env.KEYCLOAK_REALM || 'Supplify'
  return `${base.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/token`
}

export function resolveTokensFromEnv() {
  const tokens = {}
  for (const [role, cfg] of Object.entries(ROLE_CONFIG)) {
    const fromEnv = process.env[cfg.tokenEnv]
    if (fromEnv) tokens[role] = fromEnv
  }
  return tokens
}

/** Returns 'env_override' | 'keycloak_grant' | 'unavailable' for a role. */
export function getTokenSource(role) {
  const cfg = ROLE_CONFIG[role]
  if (!cfg) return 'unavailable'
  if (process.env[cfg.tokenEnv]) return 'env_override'
  const email = process.env[cfg.emailEnv] || cfg.defaultEmail
  const password = process.env[cfg.passwordEnv] || cfg.defaultPassword
  if (!email || !password) return 'unavailable'
  return 'keycloak_grant'
}

export async function verifyTokenOverrides() {
  const report = {}
  for (const role of Object.keys(ROLE_CONFIG)) {
    const source = getTokenSource(role)
    const cfg = ROLE_CONFIG[role]
    let ok = false
    let detail = source
    if (source === 'env_override') {
      ok = Boolean(process.env[cfg.tokenEnv])
      detail = `${cfg.tokenEnv} set (${process.env[cfg.tokenEnv].slice(0, 12)}…)`
    } else if (source === 'keycloak_grant') {
      try {
        const token = await getTokenForRole(role)
        ok = Boolean(token)
        detail = ok ? 'Keycloak password grant OK' : 'grant returned empty'
      } catch (err) {
        detail = err.message
      }
    } else {
      detail = 'no env override and no default credentials'
    }
    report[role] = { source, ok, detail }
  }
  return report
}

export async function getTokenForRole(role) {
  const cfg = ROLE_CONFIG[role]
  if (!cfg) throw new Error(`Unknown role: ${role}`)

  if (process.env[cfg.tokenEnv]) {
    return process.env[cfg.tokenEnv]
  }

  if (tokenCache.has(role)) {
    return tokenCache.get(role)
  }

  const email = process.env[cfg.emailEnv] || cfg.defaultEmail
  const password = process.env[cfg.passwordEnv] || cfg.defaultPassword
  if (!email || !password) {
    return null
  }

  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'supplify-api'
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'changeme'

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username: email,
    password,
    scope: 'openid profile email',
  })

  const res = await fetch(getKeycloakTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Keycloak token failed for ${role}: ${res.status} ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Keycloak response missing access_token for ${role}`)
  }

  tokenCache.set(role, data.access_token)
  return data.access_token
}

export async function getAllTokens() {
  const tokens = {}
  for (const role of Object.keys(ROLE_CONFIG)) {
    try {
      const t = await getTokenForRole(role)
      if (t) tokens[role] = t
    } catch (err) {
      tokens[role] = null
      tokens[`${role}Error`] = err.message
    }
  }
  return tokens
}

export function clearTokenCache() {
  tokenCache.clear()
}
