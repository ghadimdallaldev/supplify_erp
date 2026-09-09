#!/usr/bin/env node
/** Disable OTP without changing session-policy fields. Set KEYCLOAK_ROLLBACK_BROWSER_FLOW to the prior alias. */
const base = (process.env.KEYCLOAK_BASE_URL || process.env.KEYCLOAK_PUBLIC_URL || '').replace(/\/$/, '')
const realm = process.env.KEYCLOAK_REALM || 'Supplify'
const prior = process.env.KEYCLOAK_ROLLBACK_BROWSER_FLOW || 'browser'
const user = process.env.KEYCLOAK_ADMIN || 'admin'
const password = process.env.KEYCLOAK_ADMIN_PASSWORD || ''
if (!base || !password) throw new Error('KEYCLOAK_BASE_URL and KEYCLOAK_ADMIN_PASSWORD are required')
const body = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: user, password })
const auth = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
if (!auth.ok) throw new Error(`Admin token failed: ${auth.status}`)
const accessToken = (await auth.json()).access_token
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
const get = await fetch(`${base}/admin/realms/${encodeURIComponent(realm)}`, { headers })
if (!get.ok) throw new Error(`Get realm failed: ${get.status}`)
const current = await get.json()
const requiredActions = (current.requiredActions || []).filter((item) => item.alias !== 'email-otp-verify-email')
const put = await fetch(`${base}/admin/realms/${encodeURIComponent(realm)}`, { method: 'PUT', headers, body: JSON.stringify({ ...current, browserFlow: prior, requiredActions }) })
if (!put.ok) throw new Error(`Rollback failed: ${put.status} ${await put.text()}`)
console.log(`Restored browserFlow=${prior}; provider remains installed but is no longer bound`)
