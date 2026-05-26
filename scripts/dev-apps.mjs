#!/usr/bin/env node
/**
 * Start API + web locally without requiring pnpm on PATH.
 * Waits for API /health before Vite so proxy requests do not ECONNREFUSED on boot.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shell = true
const apiDir = path.join(root, 'apps', 'api')
const webDir = path.join(root, 'apps', 'web')
const apiPort = process.env.PORT || process.env.API_PORT || '4000'
const apiHealthUrl = `http://127.0.0.1:${apiPort}/health`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function prefixStream(stream, label) {
  stream.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line) process.stdout.write(`[${label}] ${line}\n`)
    }
  })
}

function startProcess(label, command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    shell,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  prefixStream(child.stdout, label)
  prefixStream(child.stderr, label)
  return child
}

async function waitForApiReady(maxWaitMs = 90_000) {
  const started = Date.now()
  let lastLog = 0
  while (Date.now() - started < maxWaitMs) {
    try {
      const res = await fetch(apiHealthUrl, { signal: AbortSignal.timeout(2_000) })
      if (res.ok) return true
    } catch {
      // API still starting or restarting (node --watch)
    }
    const now = Date.now()
    if (now - lastLog > 5_000) {
      process.stdout.write(`[dev] Waiting for API at ${apiHealthUrl}…\n`)
      lastLog = now
    }
    await sleep(500)
  }
  return false
}

// Limit watch to src/ to avoid restart storms when unrelated files change (common on Windows).
const api = startProcess('api', 'node', ['--watch-path=./src', '--watch', 'src/server.js'], apiDir)

const ready = await waitForApiReady()
if (!ready) {
  console.error(`[dev] API did not become ready at ${apiHealthUrl} within 90s`)
  api.kill('SIGTERM')
  process.exit(1)
}

process.stdout.write(`[dev] API ready — starting Vite\n`)
const web = startProcess('web', 'npx', ['vite'], webDir)

const children = [api, web]
const killAll = () => children.forEach((c) => c.kill('SIGTERM'))
process.on('SIGINT', () => {
  killAll()
  process.exit(0)
})
process.on('SIGTERM', killAll)

let exited = 0
for (const child of children) {
  child.on('exit', (code) => {
    exited += 1
    if (exited >= children.length) process.exit(code ?? 0)
  })
}
