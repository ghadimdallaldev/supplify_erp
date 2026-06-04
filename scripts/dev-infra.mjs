#!/usr/bin/env node
/**
 * Start Docker infrastructure only (no API/web/nginx images).
 * Use with: pnpm local:infra
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { dockerComposeArgs, getRepoRoot } from './lib/docker-env.mjs'
import { ensureDockerEnv } from './lib/ensure-docker-env.mjs'

const root = getRepoRoot()
ensureDockerEnv()
spawnSync('node', ['scripts/ensure-native-env.mjs'], { cwd: root, stdio: 'inherit', shell: true })

const services = [
  'postgres',
  'redis',
  'mailpit',
  'minio',
  'minio-init',
  'keycloak',
  'keycloak-init',
]

console.log('Starting infrastructure:', services.join(', '))
const up = spawnSync('docker', dockerComposeArgs(['up', '-d', ...services]), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: root,
})
if (up.status !== 0) process.exit(up.status ?? 1)

console.log('\nInfrastructure is up. Postgres, Redis, MinIO, Keycloak, and Mailpit are on localhost ports from docker/.env')
console.log('Mailpit UI: http://localhost:8025  (SMTP localhost:1025 — captured emails appear here)')
console.log('Next: pnpm dev   (API :4000 + web :5173 with hot reload)')
