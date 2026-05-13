#!/usr/bin/env node
/**
 * Start API + web locally without requiring pnpm on PATH.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shell = true
const apiDir = path.join(root, 'apps', 'api')
const webDir = path.join(root, 'apps', 'web')

const concurrentlyBin = path.join(root, 'node_modules/concurrently/dist/bin/concurrently.js')

const apiCmd =
  process.platform === 'win32'
    ? `cd /d "${apiDir}" && node --watch src/server.js`
    : `cd "${apiDir}" && node --watch src/server.js`
const webCmd =
  process.platform === 'win32'
    ? `cd /d "${webDir}" && npx vite`
    : `cd "${webDir}" && npx vite`

if (!existsSync(concurrentlyBin)) {
  console.log('Starting API + web (install deps first for concurrently labels)…')
  const api = spawn(apiCmd, { stdio: 'inherit', shell })
  const web = spawn(webCmd, { stdio: 'inherit', shell })
  const killAll = () => {
    api.kill('SIGINT')
    web.kill('SIGINT')
  }
  process.on('SIGINT', killAll)
  api.on('exit', (code) => process.exit(code ?? 0))
  web.on('exit', (code) => process.exit(code ?? 0))
} else {
  const child = spawn(
    'node',
    [concurrentlyBin, '-n', 'api,web', '-c', 'blue,green', apiCmd, webCmd],
    { cwd: root, stdio: 'inherit', shell, env: { ...process.env, FORCE_COLOR: '1' } }
  )
  child.on('exit', (code) => process.exit(code ?? 0))
  process.on('SIGINT', () => child.kill('SIGINT'))
}
