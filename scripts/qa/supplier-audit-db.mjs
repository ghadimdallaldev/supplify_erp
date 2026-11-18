import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const root = path.resolve(import.meta.dirname, '../..')
const metaPath = path.join(os.tmpdir(), 'supplify-supplier-audit-2026-11-16.local.json')
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 })
const mode = process.argv[2] || 'start'
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url))
const { Client } = require('pg')

async function migrateIsolated(url) {
  const { config } = await import('../../apps/api/src/config/env.js')
  config.DATABASE_URL = url
  config.DATABASE_MIGRATION_URL = url
  config.DATABASE_SSL = false
  config.REDIS_URL = ''
  config.DATABASE_POOL_MAX = 2
  const { pool } = await import('../../apps/api/src/lib/db.js')
  try {
    const { runAllSqlMigrations } = await import('../../apps/api/src/lib/sql-migrator.js')
    await runAllSqlMigrations()
  } finally {
    await pool.end()
  }
}

if (mode === 'start') {
  if (fs.existsSync(metaPath)) throw new Error('An audit database already exists; inspect it first')
  const name = `supplify-supplier-audit-${crypto.randomBytes(4).toString('hex')}`
  const password = crypto.randomBytes(24).toString('hex')
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--label',
    'supplify.audit=supplier-2026-11-16',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=rbac_audit',
    '-p',
    '127.0.0.1::5432',
    'postgres:16-alpine'
  )
  const port = Number(docker('port', name, '5432/tcp').trim().split(':').at(-1))
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/rbac_audit`
  fs.writeFileSync(metaPath, JSON.stringify({ name, port, url }), { mode: 0o600 })
  let ready = false
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      docker('exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'rbac_audit')
      ready = true
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  if (!ready) throw new Error('Disposable database did not become ready')
  const client = new Client({ connectionString: url })
  await client.connect()
  await client.query('CREATE ROLE api_user')
  await client.end()
  await migrateIsolated(url)
  console.log(JSON.stringify({ name, port, isolated: true, migrated: true }))
} else {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  const target = new URL(meta.url)
  if (
    !/^supplify-supplier-audit-[a-f0-9]{8}$/.test(meta.name) ||
    target.hostname !== '127.0.0.1' ||
    target.pathname !== '/rbac_audit'
  )
    throw new Error('Invalid audit target')
  const details = JSON.parse(docker('inspect', meta.name))[0]
  if (details.Config.Labels['supplify.audit'] !== 'supplier-2026-11-16')
    throw new Error('Audit ownership label mismatch')
  if (mode === 'stop') {
    docker('rm', '-f', meta.name)
    fs.unlinkSync(metaPath)
    console.log('Removed only this supplier audit database')
  } else if (mode === 'migrate') {
    await migrateIsolated(meta.url)
  } else if (mode === 'test') {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/pnpm-run.mjs',
        '--filter',
        '@supplify/api',
        'exec',
        'vitest',
        'run',
        '--config',
        '../../tests/integrity/vitest.config.js',
        ...process.argv.slice(3),
      ],
      {
        cwd: root,
        env: { ...process.env, SUPPLIFY_AUDIT_DATABASE_URL: meta.url },
        stdio: 'inherit',
      }
    )
    process.exitCode = result.status ?? 1
  } else throw new Error('Unknown audit command')
}
