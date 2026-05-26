#!/usr/bin/env node
/**
 * Smoke-test production-mode API memory on a spare port (does not affect dev on :4000).
 *
 * Usage: pnpm memory:prod-api
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const port = process.env.MEMORY_SMOKE_PORT || '4001'
const baseUrl = `http://127.0.0.1:${port}`

const child = spawn('node', ['src/server.js'], {
  cwd: path.join(root, 'apps/api'),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    MEMORY_HEALTH_EXPOSE: '1',
    // Minimal deps for smoke (uses apps/api/.env if present)
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
child.stdout?.on('data', (c) => {
  stdout += c.toString()
})
child.stderr?.on('data', (c) => {
  stdout += c.toString()
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForHealth(maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`)
      if (res.ok) return res.json()
    } catch {
      // not ready
    }
    await sleep(500)
  }
  throw new Error('API did not become healthy in time')
}

try {
  const health = await waitForHealth()
  console.log('Production-mode API health (memory exposed via MEMORY_HEALTH_EXPOSE=1):')
  console.log(JSON.stringify(health, null, 2))
} catch (error) {
  console.error('Smoke test failed:', error.message)
  console.error(stdout.slice(-2000))
  process.exitCode = 1
} finally {
  child.kill('SIGTERM')
  await sleep(1500)
  if (!child.killed) child.kill('SIGKILL')
}
