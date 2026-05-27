/**
 * Ensure docker/.env exists and host ports do not collide with other services.
 * Single source of truth for local Postgres / Keycloak / nginx ports.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { getRepoRoot } from './docker-env.mjs'
import { getDockerHostPort } from './local-infra-urls.mjs'

const CONTAINER_POSTGRES = 'supplify-postgres'
const CONTAINER_NGINX = 'supplify-nginx'
const CONTAINER_KEYCLOAK = 'supplify-keycloak'

function readEnvFile(filePath) {
  const vars = {}
  if (!existsSync(filePath)) return vars
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    if (i === -1) continue
    vars[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return vars
}

function writeEnvFile(filePath, vars) {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`)
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
}

function patchEnvVar(vars, key, value) {
  vars[key] = value
}

function portInUse(port) {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0`,
      ],
      { encoding: 'utf8', shell: true }
    )
    return r.stdout?.trim() === 'True'
  }
  const r = spawnSync('bash', ['-lc', `ss -tln 2>/dev/null | grep -qE ':${port}[[:space:]]'`], {
    encoding: 'utf8',
    shell: true,
  })
  return r.status === 0
}

function ourContainerOnPort(port, containerName) {
  const r = spawnSync('docker', ['ps', '--filter', `name=^/${containerName}$`, '--format', '{{.Ports}}'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) return false
  return new RegExp(`:${port}->`).test(r.stdout || '')
}

/**
 * @returns {Record<string, string>} merged docker/.env variables
 */
export function ensureDockerEnv() {
  const root = getRepoRoot()
  const envFile = path.join(root, 'docker', '.env')
  const envExample = path.join(root, 'docker', '.env.example')

  if (!existsSync(envFile)) {
    if (!existsSync(envExample)) {
      throw new Error(`Missing ${envExample}`)
    }
    copyFileSync(envExample, envFile)
    console.log(`Created ${envFile} from example.`)
  }

  const vars = readEnvFile(envFile)
  let changed = false

  const pgPort = parseInt(vars.POSTGRES_PORT || '5432', 10)
  if (portInUse(pgPort) && !ourContainerOnPort(pgPort, CONTAINER_POSTGRES)) {
    console.log(`Port ${pgPort} is busy — using 5433 for Postgres (saved in docker/.env).`)
    patchEnvVar(vars, 'POSTGRES_PORT', '5433')
    changed = true
  }

  const appPort = parseInt(vars.APP_PORT || '80', 10)
  if (portInUse(appPort) && !ourContainerOnPort(appPort, CONTAINER_NGINX)) {
    console.log(`Port ${appPort} is busy — using 8080 for the app (nginx).`)
    patchEnvVar(vars, 'APP_PORT', '8080')
    patchEnvVar(vars, 'VITE_API_URL', 'http://localhost:8080')
    patchEnvVar(vars, 'WEB_ORIGIN', 'http://localhost:8080')
    changed = true
  }

  const kcPort = parseInt(vars.KEYCLOAK_PORT || '8180', 10)
  if (portInUse(kcPort) && !ourContainerOnPort(kcPort, CONTAINER_KEYCLOAK)) {
    console.log(`Port ${kcPort} is busy — using 8181 for Keycloak.`)
    patchEnvVar(vars, 'KEYCLOAK_PORT', '8181')
    patchEnvVar(vars, 'VITE_KEYCLOAK_URL', 'http://localhost:8181')
    changed = true
  }

  const publishedPg = getDockerHostPort(CONTAINER_POSTGRES, 5432)
  if (publishedPg && vars.POSTGRES_PORT !== publishedPg) {
    console.log(
      `Aligning docker/.env POSTGRES_PORT=${publishedPg} with running ${CONTAINER_POSTGRES}.`
    )
    patchEnvVar(vars, 'POSTGRES_PORT', publishedPg)
    changed = true
  }

  if (changed) {
    writeEnvFile(envFile, vars)
  }

  return readEnvFile(envFile)
}
