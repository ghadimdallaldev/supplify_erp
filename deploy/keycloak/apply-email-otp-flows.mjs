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
async function ensureTopLevelFlow(accessToken, alias, description) {
  const flows = await getFlows(accessToken)
  const existing = flows.find((flow) => flow.alias === alias)
  if (existing) return existing
  const res = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/flows`, {
    method: 'POST',
    body: JSON.stringify({ alias, description, providerId: 'basic-flow', topLevel: true, builtIn: false }),
  })
  if (!res.ok && res.status !== 409) throw new Error(`Create flow ${alias} failed: ${res.status} ${await res.text()}`)
  return (await getFlows(accessToken)).find((flow) => flow.alias === alias)
}
async function listExecutions(accessToken, flowAlias) {
  const res = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`)
  if (!res.ok) throw new Error(`List executions for ${flowAlias} failed: ${res.status} ${await res.text()}`)
  return res.json()
}
async function setRequirement(accessToken, execution, requirement) {
  if (!execution?.id || execution.requirement === requirement) return execution
  const res = await adminFetch(
    accessToken,
    `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/executions/${execution.id}`,
    { method: 'PUT', body: JSON.stringify({ ...execution, requirement }) }
  )
  if (!res.ok) throw new Error(`Set requirement failed: ${res.status} ${await res.text()}`)
  return { ...execution, requirement }
}
async function ensureAuthenticator(accessToken, flowAlias, provider, requirement = 'REQUIRED') {
  const current = await listExecutions(accessToken, flowAlias)
  const existing = current.find((execution) => execution.providerId === provider)
  if (existing) return setRequirement(accessToken, existing, requirement)
  const res = await adminFetch(
    accessToken,
    `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(flowAlias)}/executions/execution`,
    { method: 'POST', body: JSON.stringify({ provider }) }
  )
  if (!res.ok && res.status !== 409) throw new Error(`Add ${provider} to ${flowAlias} failed: ${res.status} ${await res.text()}`)
  const updated = await listExecutions(accessToken, flowAlias)
  const created = updated.find((execution) => execution.providerId === provider)
  return setRequirement(accessToken, created, requirement)
}
/**
 * Ensure a nested forms subflow under the browser flow, then wire password + OTP
 * inside that same subflow. Never create an orphan top-level flow with the same alias.
 */
async function ensureFormsSubflow(accessToken, browserAlias, formsAlias, requirement = 'ALTERNATIVE') {
  const parentPath = `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(browserAlias)}/executions`
  let current = await listExecutions(accessToken, browserAlias)
  let formsExec = current.find(
    (execution) =>
      execution.flowAlias === formsAlias ||
      (execution.authenticationFlow && execution.displayName === formsAlias)
  )
  if (!formsExec) {
    const res = await adminFetch(accessToken, `${parentPath}/flow`, {
      method: 'POST',
      body: JSON.stringify({
        alias: formsAlias,
        description: 'Username/password followed by Supplify email OTP',
        type: 'basic-flow',
        provider: 'basic-flow',
        requirement,
      }),
    })
    if (!res.ok && res.status !== 409) {
      throw new Error(`Add subflow ${formsAlias} failed: ${res.status} ${await res.text()}`)
    }
    current = await listExecutions(accessToken, browserAlias)
    formsExec = current.find((execution) => execution.authenticationFlow && execution.displayName === formsAlias)
  }
  if (formsExec) await setRequirement(accessToken, formsExec, requirement)

  await ensureAuthenticator(accessToken, formsAlias, 'auth-username-password-form', 'REQUIRED')
  await ensureAuthenticator(accessToken, formsAlias, 'email-otp-login', 'REQUIRED')
  return formsExec
}
async function patchRealm(accessToken, realmValue, changes) {
  const res = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...realmValue, ...changes }),
  })
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
    console.log(JSON.stringify({
      browserAlias,
      formsAlias,
      formsRequirement: 'ALTERNATIVE',
      requiredAction: 'email-otp-verify-email',
      preserveSessionPolicy: true,
    }, null, 2))
    return
  }

  await ensureTopLevelFlow(accessToken, browserAlias, 'Supplify browser flow with email OTP')
  await ensureAuthenticator(accessToken, browserAlias, 'auth-cookie', 'ALTERNATIVE')
  await ensureAuthenticator(accessToken, browserAlias, 'identity-provider-redirector', 'ALTERNATIVE')
  await ensureFormsSubflow(accessToken, browserAlias, formsAlias, 'ALTERNATIVE')

  const requiredActions = Array.isArray(currentRealm.requiredActions) ? currentRealm.requiredActions : []
  const action = requiredActions.find((item) => item.alias === 'email-otp-verify-email') || {
    alias: 'email-otp-verify-email',
    providerId: 'email-otp-verify-email',
    name: 'Verify email with Supplify OTP',
    enabled: true,
    defaultAction: true,
    priority: 50,
  }
  action.enabled = true
  action.defaultAction = true
  await patchRealm(accessToken, currentRealm, {
    loginTheme: 'email-otp',
    browserFlow: browserAlias,
    requiredActions: [...requiredActions.filter((item) => item.alias !== action.alias), action],
  })
  console.log(`Applied ${browserAlias} with nested ${formsAlias} (password + email-otp-login); session-policy fields preserved`)
}
main().catch((error) => { console.error(error.message || error); process.exit(1) })
