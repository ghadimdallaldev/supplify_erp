#!/usr/bin/env node
/**
 * Apply ERP human session policy to an existing Keycloak realm via Admin API.
 *
 * Why: --import-realm skips realms that already exist, so live SSO/token settings
 * must be updated explicitly.
 *
 * Usage:
 *   node deploy/keycloak/apply-session-policy.mjs
 *
 * Env:
 *   KEYCLOAK_BASE_URL or KEYCLOAK_PUBLIC_URL  (required)
 *   KEYCLOAK_REALM                            (default: Supplify)
 *   KEYCLOAK_ADMIN                            (default: admin)
 *   KEYCLOAK_ADMIN_PASSWORD                   (required)
 *   KEYCLOAK_SESSION_POLICY_PATH              (optional path to session-policy.json)
 *   DRY_RUN=1                                 (print planned patch only)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const policyPath =
  process.env.KEYCLOAK_SESSION_POLICY_PATH || join(__dirname, 'session-policy.json')
const policy = JSON.parse(readFileSync(policyPath, 'utf8'))

const base = (
  process.env.KEYCLOAK_BASE_URL ||
  process.env.KEYCLOAK_PUBLIC_URL ||
  process.env.KEYCLOAK_URL ||
  ''
).replace(/\/$/, '')
const realm = process.env.KEYCLOAK_REALM || 'Supplify'
const adminUser = process.env.KEYCLOAK_ADMIN || 'admin'
const adminPass = process.env.KEYCLOAK_ADMIN_PASSWORD || ''
const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

if (!base) {
  console.error('Missing KEYCLOAK_BASE_URL / KEYCLOAK_PUBLIC_URL')
  process.exit(1)
}
if (!adminPass) {
  console.error('Missing KEYCLOAK_ADMIN_PASSWORD')
  process.exit(1)
}

const realmPatch = {
  accessTokenLifespan: policy.accessTokenLifespan,
  accessTokenLifespanForImplicitFlow: policy.accessTokenLifespanForImplicitFlow,
  ssoSessionIdleTimeout: policy.ssoSessionIdleTimeout,
  ssoSessionMaxLifespan: policy.ssoSessionMaxLifespan,
  ssoSessionIdleTimeoutRememberMe: policy.ssoSessionIdleTimeoutRememberMe,
  ssoSessionMaxLifespanRememberMe: policy.ssoSessionMaxLifespanRememberMe,
  clientSessionIdleTimeout: policy.clientSessionIdleTimeout,
  clientSessionMaxLifespan: policy.clientSessionMaxLifespan,
  rememberMe: policy.rememberMe,
  revokeRefreshToken: policy.revokeRefreshToken,
  refreshTokenMaxReuse: policy.refreshTokenMaxReuse,
}

const clientLifespan = String(policy.clientAccessTokenLifespanSeconds ?? policy.accessTokenLifespan)
const clientIds = ['supplify-api', 'supplify-mobile', 'supplify-web']

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: adminUser,
    password: adminPass,
  })
  const res = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    throw new Error(`Admin token failed: ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  return json.access_token
}

async function adminFetch(token, path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res
}

async function main() {
  console.log(`Target ${base} realm=${realm} dryRun=${dryRun}`)
  console.log('Realm patch:', JSON.stringify(realmPatch, null, 2))

  if (dryRun) {
    console.log(`Would set client access.token.lifespan=${clientLifespan} on: ${clientIds.join(', ')}`)
    return
  }

  const token = await getAdminToken()
  const getRealm = await adminFetch(token, `/admin/realms/${encodeURIComponent(realm)}`)
  if (!getRealm.ok) {
    throw new Error(`GET realm failed: ${getRealm.status} ${await getRealm.text()}`)
  }
  const existing = await getRealm.json()
  const putRes = await adminFetch(token, `/admin/realms/${encodeURIComponent(realm)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...existing, ...realmPatch }),
  })
  if (!putRes.ok) {
    throw new Error(`PUT realm failed: ${putRes.status} ${await putRes.text()}`)
  }
  console.log('Realm session policy applied')

  for (const clientId of clientIds) {
    const listRes = await adminFetch(
      token,
      `/admin/realms/${encodeURIComponent(realm)}/clients?clientId=${encodeURIComponent(clientId)}&max=1`
    )
    if (!listRes.ok) {
      console.warn(`Skip ${clientId}: list failed ${listRes.status}`)
      continue
    }
    const list = await listRes.json()
    if (!list.length) {
      console.warn(`Skip ${clientId}: not found`)
      continue
    }
    const client = list[0]
    const fullRes = await adminFetch(
      token,
      `/admin/realms/${encodeURIComponent(realm)}/clients/${client.id}`
    )
    const full = await fullRes.json()
    const attributes = {
      ...(full.attributes || {}),
      'access.token.lifespan': clientLifespan,
      'access.token.lifespan.for.implicit.flow': clientLifespan,
    }
    const upd = await adminFetch(
      token,
      `/admin/realms/${encodeURIComponent(realm)}/clients/${client.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({ ...full, attributes }),
      }
    )
    if (!upd.ok) {
      throw new Error(`PUT client ${clientId} failed: ${upd.status} ${await upd.text()}`)
    }
    console.log(`Client ${clientId}: access.token.lifespan=${clientLifespan}`)
  }

  const verify = await adminFetch(token, `/admin/realms/${encodeURIComponent(realm)}`)
  const v = await verify.json()
  console.log('Verified:', {
    accessTokenLifespan: v.accessTokenLifespan,
    ssoSessionIdleTimeout: v.ssoSessionIdleTimeout,
    ssoSessionMaxLifespan: v.ssoSessionMaxLifespan,
    clientSessionIdleTimeout: v.clientSessionIdleTimeout,
    clientSessionMaxLifespan: v.clientSessionMaxLifespan,
    revokeRefreshToken: v.revokeRefreshToken,
    refreshTokenMaxReuse: v.refreshTokenMaxReuse,
    rememberMe: v.rememberMe,
  })
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
