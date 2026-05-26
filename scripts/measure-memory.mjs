#!/usr/bin/env node
/**
 * Capture local memory usage: system, Node processes, Docker, API /health.
 *
 * Usage:
 *   node scripts/measure-memory.mjs
 *   node scripts/measure-memory.mjs --api-url http://127.0.0.1:4000
 */
import { spawnSync } from 'node:child_process'

const apiUrl = process.argv.includes('--api-url')
  ? process.argv[process.argv.indexOf('--api-url') + 1]
  : process.env.API_URL || 'http://127.0.0.1:4000'

function section(title) {
  console.log(`\n=== ${title} ===`)
}

async function fetchHealth() {
  try {
    const res = await fetch(`${apiUrl}/health`)
    const body = await res.json()
    return { status: res.status, body }
  } catch (error) {
    return { error: error.message }
  }
}

function run(cmd, args, { shell = false } = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell })
}

section('API health')
const health = await fetchHealth()
console.log(JSON.stringify(health, null, 2))

section('Docker stats (if running)')
const docker = run('docker', ['stats', '--no-stream'])
if (docker.status === 0 && docker.stdout?.trim()) {
  console.log(docker.stdout.trim())
} else {
  console.log(docker.stderr?.trim() || 'No Docker stats (containers may be stopped)')
}

section('Node-related processes (top by working set)')
if (process.platform === 'win32') {
  const ps = run('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-Process | Where-Object { $_.ProcessName -match 'node|postgres|redis|java|docker' } | Sort-Object WorkingSet64 -Descending | Select-Object -First 20 ProcessName, Id, @{N='WS_MB';E={[math]::Round($_.WorkingSet64/1MB,1)}} | Format-Table -AutoSize",
  ])
  console.log(ps.stdout || ps.stderr)
} else {
  const ps = run('ps', ['-eo', 'pid,rss,comm', '--sort=-rss'])
  console.log(ps.stdout?.split('\n').slice(0, 25).join('\n') || ps.stderr)
}

section('Hints')
console.log(
  [
    'Native dev: pnpm local:infra + pnpm dev (stop full Docker api/web/nginx to avoid duplicate stacks).',
    'Production API smoke: NODE_ENV=production node apps/api/src/server.js then re-run this script.',
    'Set MEMORY_DEBUG=1 for periodic API memory logs.',
  ].join('\n')
)
