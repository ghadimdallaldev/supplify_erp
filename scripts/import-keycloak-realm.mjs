#!/usr/bin/env node
/**
 * Import deploy/keycloak/realm-export*.json directly into a running Keycloak instance.
 * Creates the realm when missing; otherwise partial-imports clients, roles, and users.
 *
 * Usage:
 *   node scripts/import-keycloak-realm.mjs
 *   node scripts/import-keycloak-realm.mjs --file deploy/keycloak/realm-export.preprod.json
 *   KEYCLOAK_BASE_URL=http://localhost:8180 KEYCLOAK_ADMIN_PASSWORD=admin node scripts/import-keycloak-realm.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function usage() {
  console.error(`Usage: node scripts/import-keycloak-realm.mjs [--file <realm-export.json>] [--url <keycloak-base-url>]`)
  process.exit(1)
}

function parseArgs(argv) {
  let file = process.env.REALM_EXPORT_FILE || 'deploy/keycloak/realm-export.json'
  let url = process.env.KEYCLOAK_BASE_URL || 'http://localhost:8180'
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file') {
      file = argv[i + 1]
      i += 1
    } else if (argv[i] === '--url') {
      url = argv[i + 1]
      i += 1
    } else {
      usage()
    }
  }
  return {
    file: resolve(root, file),
    url: url.replace(/\/$/, ''),
    admin: process.env.KEYCLOAK_ADMIN || 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
  }
}

async function getAdminToken({ url, admin, password }) {
  const tokenUrl = `${url}/realms/master/protocol/openid-connect/token`
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: admin,
    password,
  })
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Keycloak admin login failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  return data.access_token
}

async function adminFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res
}

async function realmExists(url, token, realmName) {
  const res = await adminFetch(`${url}/admin/realms/${encodeURIComponent(realmName)}`, token)
  if (res.status === 404) return false
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Check realm failed (${res.status}): ${text}`)
  }
  return true
}

async function createRealm(url, token, realmExport) {
  const res = await adminFetch(`${url}/admin/realms`, token, {
    method: 'POST',
    body: JSON.stringify(realmExport),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Create realm failed (${res.status}): ${text}`)
  }
}

async function partialImport(url, token, realmName, realmExport) {
  const payload = {
    ifResourceExists: 'OVERWRITE',
  }
  if (realmExport.clients?.length) {
    payload.clients = realmExport.clients.map((client) => {
      const copy = { ...client }
      // Never overwrite live client secrets from git placeholders.
      if (!copy.secret || copy.secret === 'changeme') delete copy.secret
      return copy
    })
  }
  if (realmExport.roles) payload.roles = realmExport.roles
  if (realmExport.users?.length) payload.users = realmExport.users

  const res = await adminFetch(
    `${url}/admin/realms/${encodeURIComponent(realmName)}/partialImport`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Partial import failed (${res.status}): ${text}`)
  }
  return res.json()
}

async function waitForKeycloak(url, attempts = 60) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(`${url}/realms/master`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`Keycloak not reachable at ${url}`)
}

async function main() {
  const { file, url, admin, password } = parseArgs(process.argv.slice(2))
  if (!existsSync(file)) {
    console.error(`Missing realm export file: ${file}`)
    process.exit(1)
  }

  const realmExport = JSON.parse(readFileSync(file, 'utf8'))
  const realmName = realmExport.realm
  if (!realmName) {
    console.error('Realm export JSON must include a "realm" field')
    process.exit(1)
  }

  console.log(`Waiting for Keycloak at ${url}...`)
  await waitForKeycloak(url)

  console.log('Authenticating as Keycloak admin...')
  const token = await getAdminToken({ url, admin, password })

  const exists = await realmExists(url, token, realmName)
  if (!exists) {
    console.log(`Creating realm "${realmName}" from ${file}`)
    await createRealm(url, token, realmExport)
    console.log(`Realm "${realmName}" created`)
    return
  }

  console.log(`Realm "${realmName}" exists — running partial import from ${file}`)
  const result = await partialImport(url, token, realmName, realmExport)
  const added = result.added ?? 0
  const overwritten = result.overwritten ?? 0
  const skipped = result.skipped ?? 0
  console.log(`Partial import done (added=${added}, overwritten=${overwritten}, skipped=${skipped})`)
  if (result.error) {
    console.error('Partial import reported errors:', result.error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
