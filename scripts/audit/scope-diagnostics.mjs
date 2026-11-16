import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
const { Client } = require('pg')
// Explicit connection only; never fall through to application .env or hosted defaults.
const connectionString = process.env.AUDIT_DIAGNOSTICS_DATABASE_URL
if (!connectionString) throw new Error('Set AUDIT_DIAGNOSTICS_DATABASE_URL explicitly; this command only reads data')
const db = new Client({ connectionString })
await db.connect()
try {
  await db.query('BEGIN READ ONLY')
  await db.query("SET LOCAL statement_timeout = '30s'")
  const sql = fs.readFileSync(path.join(import.meta.dirname, 'scope-diagnostics.sql'), 'utf8')
  const results = await db.query(sql)
  const findings = results.flatMap(result => result.rows ?? [])
  await db.query('ROLLBACK')
  const out = path.join(root, 'output/rbac-audit-2026-11-16/diagnostics.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), findings }, null, 2))
  console.log(JSON.stringify({ findings: findings.length, output: out }))
} finally { await db.end() }
