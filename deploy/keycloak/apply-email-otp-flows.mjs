#!/usr/bin/env node
/** Apply the Supplify email-OTP provider and required action to an existing realm. */
const base = (process.env.KEYCLOAK_BASE_URL || process.env.KEYCLOAK_PUBLIC_URL || process.env.KEYCLOAK_URL || '').replace(/\/$/, '')
const realm = process.env.KEYCLOAK_REALM || 'Supplify'
const adminUser = process.env.KEYCLOAK_ADMIN || 'admin'
const adminPass = process.env.KEYCLOAK_ADMIN_PASSWORD || ''
const dryRun = ['1', 'true'].includes(String(process.env.DRY_RUN || '').toLowerCase())
if (!base || !adminPass) throw new Error('KEYCLOAK_BASE_URL and KEYCLOAK_ADMIN_PASSWORD are required')

async function token() {
  const body = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: adminUser, password: adminPass })
  const res = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!res.ok) throw new Error(`Admin token failed: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}
async function adminFetch(accessToken, path, options = {}) {
  return fetch(`${base}${path}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) } })
}
async function getFlows(accessToken) {
  const res = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/flows`)
  if (!res.ok) throw new Error(`List flows failed: ${res.status} ${await res.text()}`)
  return res.json()
}
async function ensureFlow(accessToken, alias, description, topLevel = true) {
  const flows = await getFlows(accessToken)
  const existing = flows.find((flow) => flow.alias === alias)
  if (existing) return existing
  const res = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/flows`, { method: 'POST', body: JSON.stringify({ alias, description, providerId: 'basic-flow', topLevel, builtIn: false }) })
  if (!res.ok && res.status !== 409) throw new Error(`Create flow ${alias} failed: ${res.status} ${await res.text()}`)
  return (await getFlows(accessToken)).find((flow) => flow.alias === alias)
}
async function ensureExecution(accessToken, flowAlias, provider, requirement = 'REQUIRED') {
  const path = `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`
  const currentRes = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`)
  const current = currentRes.ok ? await currentRes.json() : []
  const existing = current.find((execution) => execution.providerId === provider || execution.authenticationFlow?.alias === provider)
  if (existing) {
    if (existing.id && existing.requirement !== requirement) await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/executions/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...existing, requirement }) })
    return existing
  }
  const res = await adminFetch(accessToken, `${path}/execution`, { method: 'POST', body: JSON.stringify({ provider, requirement }) })
  if (!res.ok && res.status !== 409) throw new Error(`Add ${provider} to ${flowAlias} failed: ${res.status} ${await res.text()}`)
  const updatedRes = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`)
  return (await updatedRes.json()).find((execution) => execution.providerId === provider)
}
async function ensureSubflow(accessToken, parentAlias, alias, requirement = 'ALTERNATIVE') {
  const path = '/admin/realms/' + encodeURIComponent(realm) + '/authentication/flows/' + encodeURIComponent(parentAlias) + '/executions'
  const list = await adminFetch(accessToken, path)
  const current = list.ok ? await list.json() : []
  const existing = current.find((execution) => execution.authenticationFlow?.alias === alias)
  if (existing) return existing
  const res = await adminFetch(accessToken, path + '/flow', { method: 'POST', body: JSON.stringify({ alias, description: alias, type: 'basic-flow', provider: 'basic-flow', topLevel: false, builtIn: false, requirement }) })
  if (!res.ok && res.status !== 409) throw new Error('Add subflow ' + alias + ' failed: ' + res.status + ' ' + await res.text())
  return res
}
async function patchRealm(accessToken, realmValue, changes) {
  const res = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}`, { method: 'PUT', body: JSON.stringify({ ...realmValue, ...changes }) })
  if (!res.ok) throw new Error(`Update realm failed: ${res.status} ${await res.text()}`)
}

async function main() {
  const accessToken = await token()
  const realmRes = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}`)
  if (!realmRes.ok) throw new Error(`Get realm failed: ${realmRes.status} ${await realmRes.text()}`)
  const currentRealm = await realmRes.json()
  const browserAlias = 'supplify-browser-email-otp'
  const formsAlias = 'supplify-browser-email-otp-forms'
  console.log(`Target ${base} realm=${realm} dryRun=${dryRun}`)
  if (dryRun) {
    console.log(JSON.stringify({ browserAlias, formsAlias, requiredAction: 'email-otp-verify-email', preserveSessionPolicy: true }, null, 2))
    return
  }

  await ensureFlow(accessToken, formsAlias, 'Supplify username/password and email OTP', false)
  await ensureExecution(accessToken, formsAlias, 'auth-username-password-form', 'REQUIRED')
  await ensureExecution(accessToken, formsAlias, 'email-otp-login', 'REQUIRED')
  await ensureFlow(accessToken, browserAlias, 'Supplify browser flow with email OTP', true)
  await ensureExecution(accessToken, browserAlias, 'auth-cookie', 'ALTERNATIVE')
  await ensureExecution(accessToken, browserAlias, 'identity-provider-redirector', 'ALTERNATIVE')
  await ensureSubflow(accessToken, browserAlias, formsAlias, 'REQUIRED')

  const requiredActions = Array.isArray(currentRealm.requiredActions) ? currentRealm.requiredActions : []
  const action = requiredActions.find((item) => item.alias === 'email-otp-verify-email') || {
    alias: 'email-otp-verify-email', providerId: 'email-otp-verify-email', name: 'Verify email with Supplify OTP', enabled: true, defaultAction: true, priority: 50
  }
  await patchRealm(accessToken, currentRealm, { loginTheme: 'email-otp', browserFlow: browserAlias, requiredActions: [...requiredActions.filter((item) => item.alias !== action.alias), action] })
  console.log(`Applied ${browserAlias}; session-policy fields were preserved from the current realm`)
}
main().catch((error) => { console.error(error.message || error); process.exit(1) })
