import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
const { Client } = require('pg')
const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'output/rbac-audit-2026-11-16')
const metaPath = path.join(out, 'postgres.local.json')
fs.mkdirSync(out, { recursive: true })
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
const mode = process.argv[2] || 'start'
if (mode === 'start') {
  if (fs.existsSync(metaPath)) throw new Error('Audit database already exists; inspect it before creating another')
  const name = 'supplify-rbac-audit-' + crypto.randomBytes(4).toString('hex')
  const password = crypto.randomBytes(24).toString('hex')
  docker('run', '-d', '--name', name, '--label', 'supplify.audit=rbac-2026-11-16', '-e', 'POSTGRES_PASSWORD=' + password,
    '-e', 'POSTGRES_DB=rbac_audit', '-p', '127.0.0.1::5432', 'postgres:16-alpine')
  const port = docker('port', name, '5432/tcp').trim().split(':').at(-1)
  const meta = { name, port: Number(port), url: `postgresql://postgres:${password}@127.0.0.1:${port}/rbac_audit` }
  fs.writeFileSync(metaPath, JSON.stringify(meta))
  let ready = false
  for (let n = 0; n < 40; n++) {
    try { docker('exec', name, 'pg_isready', '-U', 'postgres', '-d', 'rbac_audit'); ready = true; break } catch { await new Promise(r => setTimeout(r, 500)) }
  }
  if (!ready) throw new Error('PostgreSQL did not become ready')
  console.log(JSON.stringify({ name, port, isolated: true }))
} else {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  if (!/^supplify-rbac-audit-[a-f0-9]{8}$/.test(meta.name) || new URL(meta.url).hostname !== '127.0.0.1') throw new Error('Invalid isolated target')
  const details = JSON.parse(docker('inspect', meta.name))[0]
  if (details.Config.Labels['supplify.audit'] !== 'rbac-2026-11-16') throw new Error('Container ownership label mismatch')
  if (mode === 'diagnostics') {
    process.env.AUDIT_DIAGNOSTICS_DATABASE_URL = meta.url
    await import('./scope-diagnostics.mjs')
  } else if (mode === 'stop') {
    docker('rm', '-f', meta.name)
    fs.unlinkSync(metaPath)
    console.log('Removed only the labeled audit container')
  } else {
    const db = new Client({ connectionString: meta.url })
    await db.connect()
    try {
      if (mode === 'replay') {
        await db.query('CREATE ROLE api_user')
        const files = fs.readdirSync(path.join(root, 'apps/api/db/migrations')).filter(f => /^\d.*\.sql$/.test(f)).sort()
        const result = { passed: [], failed: null }
        for (const file of files) {
          try {
            const bytes = fs.readFileSync(path.join(root, 'apps/api/db/migrations', file))
            const sql = bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le').replace(/^\uFEFF/, '') : bytes.toString('utf8')
            await db.query(sql)
            result.passed.push(file)
          } catch (error) { result.failed = { file, code: error.code, message: error.message }; break }
        }
        fs.writeFileSync(path.join(out, 'migration-replay.json'), JSON.stringify(result, null, 2))
        console.log(JSON.stringify({ passed: result.passed.length, failed: result.failed }))
        if (result.failed) process.exitCode = 1
      } else if (mode === 'schema') {
        // Schema only: no customer, authentication, or business records are copied.
        const schema = docker('exec', 'supplify-postgres', 'pg_dump', '-U', 'postgres', '-d', 'supplify', '--schema-only', '--no-owner', '--no-acl')
        await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        await db.query(schema.replace(/^\\(?:un)?restrict.*$/gm, ''))
        console.log('Restored local schema only; business tables contain no copied records')
      } else if (mode === 'migrate') {
        await db.query(fs.readFileSync(path.join(root, 'apps/api/db/migrations/0233_warehouse_integrity_and_access.sql'), 'utf8'))
        await db.query(fs.readFileSync(path.join(root, 'apps/api/db/migrations/0234_notification_tenant_scope.sql'), 'utf8'))
        console.log('Applied audit migration in isolated database')
      } else throw new Error('Unknown mode')
    } finally { await db.end() }
  }
}
