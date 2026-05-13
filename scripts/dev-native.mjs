#!/usr/bin/env node
/**
 * Native dev: Docker infra + pnpm API/web with hot reload (no image rebuilds).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getRepoRoot } from './lib/docker-env.mjs'

const root = getRepoRoot()
const skipInfra = process.argv.includes('--no-infra')
const skipMigrate = process.argv.includes('--no-migrate')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: root,
    ...opts,
  })
}

function dockerRunning(name) {
  const r = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', name], {
    encoding: 'utf8',
    shell: true,
  })
  return r.stdout?.trim() === 'true'
}

function dockerHealthy(name) {
  const r = spawnSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', name], {
    encoding: 'utf8',
    shell: true,
  })
  return r.stdout?.trim() === 'healthy'
}

async function main() {
  if (!existsSync(path.join(root, 'node_modules'))) {
    console.log('Installing dependencies (first run)…')
    const inst = run('node', ['scripts/pnpm-run.mjs', 'install'])
    if (inst.status !== 0) process.exit(inst.status ?? 1)
  }

  spawnSync('node', ['scripts/ensure-native-env.mjs'], { cwd: root, stdio: 'inherit', shell: true })

  if (!skipInfra && !dockerRunning('supplify-postgres')) {
    console.log('Postgres not running — starting infrastructure…')
    const infra = spawnSync('node', ['scripts/dev-infra.mjs'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    })
    if (infra.status !== 0) process.exit(infra.status ?? 1)
    console.log('Waiting for Postgres to be healthy…')
    for (let i = 0; i < 60; i++) {
      if (dockerHealthy('supplify-postgres')) break
      await sleep(2000)
    }
  }

  if (!skipMigrate) {
    console.log('Running migrations…')
    run('node', ['apps/api/scripts/migrate.js'])
  }

  console.log('\nStarting API (watch) + web (Vite HMR)…')
  console.log('  Web:  http://localhost:5173')
  console.log('  API:  http://localhost:4000')
  console.log('  Auth: http://localhost:5173/auth/login\n')

  const child = spawn('node', ['scripts/dev-apps.mjs'], {
    stdio: 'inherit',
    shell: true,
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '1' },
  })

  child.on('exit', (code) => process.exit(code ?? 0))
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
