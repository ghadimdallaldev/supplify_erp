/**
 * Reachability and auth gating for E2E. Auth is "available" only when both
 * Keycloak and the backend are reachable (real network checks). Use requireAuthSuite()
 * in auth-dependent suites so skips are deterministic: auth down → skip, auth up but
 * login fails → fail (no silent fallbacks).
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { test } from '@playwright/test'
import { apiURL } from './env'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '..', '.auth')

const KEYCLOAK_BASE_URL =
  process.env.E2E_KEYCLOAK_BASE_URL || process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080'
const KEYCLOAK_REALM = process.env.E2E_KEYCLOAK_REALM || process.env.KEYCLOAK_REALM || 'Supplify'
const AUTH_CHECK_TIMEOUT_MS = process.env.PLAYWRIGHT_BASE_URL?.startsWith('https://') ? 15000 : 5000

/** True if probe/setup wrote that the web app is reachable (file-based, for backward compat). */
export function webReachable(): boolean {
  return fs.existsSync(path.join(authDir, '.web-reachable'))
}

/** True if probe/setup wrote that the API is reachable (file-based, for backward compat). */
export function apiReachable(): boolean {
  return fs.existsSync(path.join(authDir, '.api-reachable'))
}

/**
 * Real auth availability: Keycloak well-known + backend /health must both be reachable.
 * Does not rely on .auth-ok or any file. Logs clear reason when false.
 */
export async function authAvailableAsync(): Promise<{ available: boolean; reason: string }> {
  const keycloakUrl = `${KEYCLOAK_BASE_URL.replace(/\/$/, '')}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`
  const healthUrl = `${apiURL.replace(/\/$/, '')}/health`

  let keycloakOk = false
  let keycloakStatus: number | null = null
  let keycloakError: string | null = null
  try {
    const res = await fetch(keycloakUrl, { signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS) })
    keycloakStatus = res.status
    keycloakOk = res.ok
    if (!res.ok) {
      keycloakError = `status ${res.status}`
    }
  } catch (e) {
    keycloakError = e instanceof Error ? e.message : String(e)
  }

  if (!keycloakOk) {
    const reason = `Keycloak unreachable: ${keycloakUrl} (${keycloakError ?? keycloakStatus ?? 'request failed'})`
    // eslint-disable-next-line no-console
    console.log('[authAvailable] false:', reason)
    return { available: false, reason }
  }

  let healthOk = false
  let healthStatus: number | null = null
  let healthError: string | null = null
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS) })
    healthStatus = res.status
    healthOk = res.ok || res.status < 500
    if (!healthOk) {
      healthError = `status ${res.status}`
    }
  } catch (e) {
    healthError = e instanceof Error ? e.message : String(e)
  }

  if (!healthOk) {
    const reason = `Backend health unreachable: ${healthUrl} (${healthError ?? healthStatus ?? 'request failed'})`
    // eslint-disable-next-line no-console
    console.log('[authAvailable] false:', reason)
    return { available: false, reason }
  }

  return { available: true, reason: '' }
}

/**
 * Suite-level auth gating: call in test.beforeAll, then call requireAuth() at the start of each test.
 * Keeps one place for the async check and deterministic skips with a clear reason.
 */
export function requireAuthSuite(): {
  init: () => Promise<void>
  requireAuth: () => void
  available: () => boolean
} {
  let available = false
  let reason = 'Auth not checked yet'

  return {
    async init() {
      const r = await authAvailableAsync()
      available = r.available
      reason = r.reason || 'Keycloak + backend reachable'
      if (!available) {
        // eslint-disable-next-line no-console
        console.log('[E2E AUTH MODE] disabled (' + reason + ')')
      } else {
        // eslint-disable-next-line no-console
        console.log('[E2E AUTH MODE] enabled')
      }
    },
    requireAuth() {
      if (!available) {
        test.skip(true, reason || 'Auth unavailable (Keycloak/API down)')
      }
    },
    available() {
      return available
    },
  }
}

/**
 * @deprecated Use authAvailableAsync() + requireAuthSuite() instead. Kept for backward compat; prefers file .auth-ok.
 */
export function authAvailable(): boolean {
  return fs.existsSync(path.join(authDir, '.auth-ok'))
}
