import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
const { Client } = require('pg')
const out = path.join(root, 'output/rbac-audit-2026-11-16')
const meta = JSON.parse(fs.readFileSync(path.join(out, 'postgres.local.json'), 'utf8'))
assert.match(meta.name, /^supplify-rbac-audit-[a-f0-9]{8}$/)
const details = JSON.parse(execFileSync('docker', ['inspect', meta.name], { encoding: 'utf8' }))[0]
assert.equal(details.Config.Labels['supplify.audit'], 'rbac-2026-11-16')
const admin = new Client({ connectionString: meta.url }); await admin.connect()
const database = 'rbac_audit_verify_' + randomBytes(4).toString('hex')
await admin.query(`CREATE DATABASE ${database}`)
await admin.end()
const url = new URL(meta.url); url.pathname = '/' + database
const db = new Client({ connectionString: url.href }); await db.connect()
const sql = file => {
  const bytes = fs.readFileSync(path.join(root, 'apps/api/db/migrations', file))
  return bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le').replace(/^\uFEFF/, '') : bytes.toString('utf8')
}
const results = { database, migrationFiles: 0, upgradeChecks: [] }
try {
  const files = fs.readdirSync(path.join(root, 'apps/api/db/migrations')).filter(f => /^\d.*\.sql$/.test(f)).sort()
  for (const file of files.filter(f => f < '0233_')) { await db.query(sql(file)); results.migrationFiles++ }
  const supplier = randomUUID(), role = randomUUID(), accountant = randomUUID()
  const [existing, revoked, newcomer, finance] = Array.from({ length: 4 }, () => randomUUID())
  await db.query('INSERT INTO supplier (id, name, slug) VALUES ($1::uuid, $1::text, $1::text)', [supplier])
  for (const id of [existing, revoked, newcomer, finance]) await db.query("INSERT INTO app_user (id, keycloak_sub, email, role) VALUES ($1::uuid, $1::text, $1::text || '@migration.invalid', 'SUPPLIER')", [id])
  await db.query("INSERT INTO tenant_roles (id, tenant_id, tenant_type, name, is_system) VALUES ($1, $2, 'SUPPLIER', 'Warehouse Manager', TRUE), ($3, $2, 'SUPPLIER', 'Accountant', TRUE)", [role, supplier, accountant])
  for (const id of [existing, revoked]) await db.query("INSERT INTO tenant_user_roles (user_id, role_id, tenant_id, tenant_type) VALUES ($1, $2, $3, 'SUPPLIER')", [id, role, supplier])
  await db.query("INSERT INTO user_workspace_membership (user_id, workspace_type, home_tenant_id, status) VALUES ($1, 'SUPPLIER', $2, 'revoked')", [revoked, supplier])
  for (const file of files.filter(f => f >= '0233_')) { await db.query(sql(file)); results.migrationFiles++ }
  const scope = async id => (await db.query('SELECT mode FROM supplier_warehouse_access WHERE user_id = $1 AND supplier_id = $2', [id, supplier])).rows[0]?.mode
  assert.equal(await scope(existing), 'all'); results.upgradeChecks.push('existing valid staff grant preserved')
  assert.equal(await scope(revoked), undefined); results.upgradeChecks.push('revoked membership not backfilled')
  await db.query("INSERT INTO tenant_user_roles (user_id, role_id, tenant_id, tenant_type) VALUES ($1, $2, $3, 'SUPPLIER')", [newcomer, role, supplier])
  assert.equal(await scope(newcomer), 'assigned'); results.upgradeChecks.push('new warehouse staff default to assigned with no locations')
  await db.query("INSERT INTO tenant_user_roles (user_id, role_id, tenant_id, tenant_type) VALUES ($1, $2, $3, 'SUPPLIER')", [finance, accountant, supplier])
  assert.equal(await scope(finance), 'all'); results.upgradeChecks.push('non-warehouse system roles retain their existing tenant permission policy')
  await db.query("UPDATE supplier_warehouse_access SET mode = 'assigned' WHERE user_id = $1", [existing])
  await db.query(sql('0233_warehouse_integrity_and_access.sql'))
  await db.query(sql('0234_notification_tenant_scope.sql'))
  assert.equal(await scope(existing), 'assigned'); assert.equal(await scope(newcomer), 'assigned')
  results.upgradeChecks.push('migration retries preserve narrowed and new staff grants')
  results.passed = true
  fs.writeFileSync(path.join(out, 'migration-upgrade-verification.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await db.end() }
