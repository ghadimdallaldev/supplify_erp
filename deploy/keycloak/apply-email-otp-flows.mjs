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
async function listRequiredActions(accessToken) {
  const res = await adminFetch(
    accessToken,
    `/admin/realms/${encodeURIComponent(realm)}/authentication/required-actions`
  )
  if (!res.ok) throw new Error(`List required actions failed: ${res.status} ${await res.text()}`)
  return res.json()
}
async function ensureRequiredAction(accessToken, desired) {
  let actions = await listRequiredActions(accessToken)
  let existing = actions.find(
    (item) => item.alias === desired.alias || item.providerId === desired.providerId
  )

  if (!existing) {
    const availableRes = await adminFetch(
      accessToken,
      `/admin/realms/${encodeURIComponent(realm)}/authentication/unregistered-required-actions`
    )
    if (!availableRes.ok) {
      throw new Error(
        `List unregistered required actions failed: ${availableRes.status} ${await availableRes.text()}`
      )
    }
    const available = await availableRes.json()
    if (!available.some((item) => item.providerId === desired.providerId)) {
      throw new Error(`Required action provider ${desired.providerId} is not available`)
    }

    const registerRes = await adminFetch(
      accessToken,
      `/admin/realms/${encodeURIComponent(realm)}/authentication/register-required-action`,
      {
        method: 'POST',
        body: JSON.stringify({ providerId: desired.providerId, name: desired.name }),
      }
    )
    if (!registerRes.ok && registerRes.status !== 409) {
      throw new Error(
        `Register required action ${desired.providerId} failed: ${registerRes.status} ${await registerRes.text()}`
      )
    }
    actions = await listRequiredActions(accessToken)
    existing = actions.find(
      (item) => item.alias === desired.alias || item.providerId === desired.providerId
    )
  }

  if (!existing?.alias) {
    throw new Error(`Required action ${desired.providerId} was not registered`)
  }
  const updated = { ...existing, ...desired, alias: existing.alias }
  const updateRes = await adminFetch(
    accessToken,
    `/admin/realms/${encodeURIComponent(realm)}/authentication/required-actions/${encodeURIComponent(existing.alias)}`,
    { method: 'PUT', body: JSON.stringify(updated) }
  )
  if (!updateRes.ok) {
    throw new Error(
      `Update required action ${existing.alias} failed: ${updateRes.status} ${await updateRes.text()}`
    )
  }
  return updated
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
async function setRequirement(accessToken, flowAlias, execution, requirement) {
  if (!execution?.id || execution.requirement === requirement) return execution
  // Keycloak expects PUT .../flows/{flowAlias}/executions with { id, requirement }
  // (not .../flows/executions/{id}, which 404s and leaves steps DISABLED).
  const res = await adminFetch(
    accessToken,
    `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`,
    { method: 'PUT', body: JSON.stringify({ id: execution.id, requirement }) }
  )
  if (!res.ok) throw new Error(`Set requirement failed: ${res.status} ${await res.text()}`)
  return { ...execution, requirement }
}
async function ensureAuthenticator(accessToken, flowAlias, provider, requirement = 'REQUIRED') {
  const current = await listExecutions(accessToken, flowAlias)
  const existing = current.find((execution) => execution.providerId === provider)
  if (existing) return setRequirement(accessToken, flowAlias, existing, requirement)
  const res = await adminFetch(
    accessToken,
    `/admin/realms/${encodeURIComponent(realm)}/authentication/flows/${encodeURIComponent(flowAlias)}/executions/execution`,
    { method: 'POST', body: JSON.stringify({ provider }) }
  )
  if (!res.ok && res.status !== 409) throw new Error(`Add ${provider} to ${flowAlias} failed: ${res.status} ${await res.text()}`)
  const updated = await listExecutions(accessToken, flowAlias)
  const created = updated.find((execution) => execution.providerId === provider)
  return setRequirement(accessToken, flowAlias, created, requirement)
}
async function findFlowByAlias(accessToken, alias) {
  const res = await adminFetch(
    accessToken,
    `/admin/realms/${encodeURIComponent(realm)}/partial-export?exportClients=false&exportGroupsAndRoles=false`,
    { method: 'POST' }
  )
  if (!res.ok) throw new Error(`Partial export failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.authenticationFlows || []).find((flow) => flow.alias === alias) || null
}

/**
 * Ensure a nested forms subflow under the browser flow, then wire password + OTP
 * inside that same subflow. Re-link orphaned forms flows that exist but are unbound.
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
  // Alias exists but is not nested under the browser flow (prior apply bugs left orphans).
  if (!formsExec) {
    const browserFlow = (await getFlows(accessToken)).find((flow) => flow.alias === browserAlias)
    const formsFlow = await findFlowByAlias(accessToken, formsAlias)
    if (!browserFlow?.id || !formsFlow?.id) {
      throw new Error(`Forms subflow ${formsAlias} exists but could not be linked under ${browserAlias}`)
    }
    const link = await adminFetch(accessToken, `/admin/realms/${encodeURIComponent(realm)}/authentication/executions`, {
      method: 'POST',
      body: JSON.stringify({
        parentFlow: browserFlow.id,
        flowId: formsFlow.id,
        authenticatorFlow: true,
        requirement,
        priority: 30,
      }),
    })
    if (!link.ok && link.status !== 409) {
      throw new Error(`Link subflow ${formsAlias} failed: ${link.status} ${await link.text()}`)
    }
    current = await listExecutions(accessToken, browserAlias)
    formsExec = current.find((execution) => execution.authenticationFlow && execution.displayName === formsAlias)
  }
  if (!formsExec) throw new Error(`Forms subflow ${formsAlias} is still missing under ${browserAlias}`)
  await setRequirement(accessToken, browserAlias, formsExec, requirement)

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
      profileRecoveryAction: 'UPDATE_PROFILE',
      requiredAction: 'email-otp-verify-email',
      preserveSessionPolicy: true,
    }, null, 2))
    return
  }

  await ensureTopLevelFlow(accessToken, browserAlias, 'Supplify browser flow with email OTP')
  await ensureAuthenticator(accessToken, browserAlias, 'auth-cookie', 'ALTERNATIVE')
  await ensureAuthenticator(accessToken, browserAlias, 'identity-provider-redirector', 'ALTERNATIVE')
  await ensureFormsSubflow(accessToken, browserAlias, formsAlias, 'ALTERNATIVE')

  await ensureRequiredAction(accessToken, {
    alias: 'UPDATE_PROFILE',
    providerId: 'UPDATE_PROFILE',
    name: 'Update Profile',
    enabled: true,
    defaultAction: false,
    priority: 40,
  })
  await ensureRequiredAction(accessToken, {
    alias: 'email-otp-verify-email',
    providerId: 'email-otp-verify-email',
    name: 'Verify email with Supplify OTP',
    enabled: true,
    defaultAction: true,
    priority: 50,
  })
  await patchRealm(accessToken, currentRealm, {
    loginTheme: 'email-otp',
    browserFlow: browserAlias,
  })
  console.log(`Applied ${browserAlias} with nested ${formsAlias} (password + email-otp-login); username-only recovery and session-policy fields preserved`)
}
main().catch((error) => { console.error(error.message || error); process.exit(1) })
