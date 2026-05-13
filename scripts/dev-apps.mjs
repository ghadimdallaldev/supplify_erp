#!/usr/bin/env node
/**
 * Start API + web locally without requiring pnpm on PATH.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shell = true
const apiDir = path.join(root, 'apps', 'api')
const webDir = path.join(root, 'apps', 'web')

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

const api = startProcess('api', 'node', ['--watch', 'src/server.js'], apiDir)
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
