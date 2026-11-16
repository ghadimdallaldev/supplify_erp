import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
const root = path.resolve(import.meta.dirname, '../..')
const meta = JSON.parse(fs.readFileSync(path.join(root, 'output/rbac-audit-2026-11-16/postgres.local.json'), 'utf8'))
if (!/^supplify-rbac-audit-[a-f0-9]{8}$/.test(meta.name)) throw new Error('Invalid audit container')
const details = JSON.parse(execFileSync('docker', ['inspect', meta.name], { encoding: 'utf8' }))[0]
if (details.Config.Labels['supplify.audit'] !== 'rbac-2026-11-16') throw new Error('Not the isolated audit container')
const logPath = path.join(root, 'output/rbac-audit-2026-11-16/postgres-tests.log')
const log = fs.openSync(logPath, 'w')
const child = spawn(process.execPath, [path.join(root, 'node_modules/pnpm/bin/pnpm.cjs'), '--filter', '@supplify/api', 'exec', 'vitest', 'run', '--config', '../../tests/integrity/vitest.config.js'], {
  cwd: root, stdio: ['ignore', log, log], env: { ...process.env, SUPPLIFY_AUDIT_DATABASE_URL: meta.url, CRONS_ENABLED: 'false', EMAIL_ENABLED: 'false', FORCE_COLOR: '0' },
})
child.on('exit', code => { fs.closeSync(log); console.log(fs.readFileSync(logPath, 'utf8').split('\n').filter(l => /FAIL|Test Files|Tests |Error:|AssertionError|✓|×/.test(l)).slice(-35).join('\n')); process.exitCode = code ?? 1 })
