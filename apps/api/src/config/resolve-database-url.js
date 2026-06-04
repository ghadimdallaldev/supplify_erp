/**
 * Resolve DATABASE_URL for native (host) API runs against Docker-published ports.
 * Lives under apps/api so production images do not depend on repo-root scripts/.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTAINER_POSTGRES = 'supplify-postgres'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function readDockerEnv() {
  const envPath = path.join(repoRoot, 'docker', '.env')
  const examplePath = path.join(repoRoot, 'docker', '.env.example')
  const file = existsSync(envPath) ? envPath : examplePath
  const vars = {}
  if (!existsSync(file)) return vars
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    if (i === -1) continue
    vars[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return vars
}

/** @returns {string | null} host-published port for container internal port */
export function getDockerHostPort(containerName, containerPort) {
  const r = spawnSync('docker', ['port', containerName, `${containerPort}/tcp`], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0 || !r.stdout?.trim()) return null
  const line = r.stdout.trim().split('\n')[0]
  const match = line.match(/:(\d+)\s*$/)
  return match ? match[1] : null
}

/**
 * Postgres URL for host-native API/migrations (localhost, not the docker network hostname).
 * @param {Record<string, string>} [dockerVars]
 */
export function buildNativeDatabaseUrl(dockerVars = readDockerEnv()) {
  const published = getDockerHostPort(CONTAINER_POSTGRES, 5432)
  const port = published || dockerVars.POSTGRES_PORT || '5432'
  const user = dockerVars.POSTGRES_USER || 'postgres'
  const pass = dockerVars.POSTGRES_PASSWORD || 'postgres'
  const db = dockerVars.POSTGRES_DB || 'supplify'
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@localhost:${port}/${db}`
}

/**
 * Use docker-derived URL in development when:
 * - no DATABASE_URL is set, or
 * - DATABASE_URL targets localhost but the published Docker port differs (stale .env).
 * @param {string | undefined} envDatabaseUrl from apps/api/.env
 */
export function resolveNativeDatabaseUrl(envDatabaseUrl) {
  const dockerVars = readDockerEnv()
  const dockerUrl = buildNativeDatabaseUrl(dockerVars)
  const published = getDockerHostPort(CONTAINER_POSTGRES, 5432)

  if (process.env.SUPPLIFY_DATABASE_URL) {
    return process.env.SUPPLIFY_DATABASE_URL
  }

  if (!envDatabaseUrl) {
    return dockerUrl
  }

  if (process.env.NODE_ENV === 'production') {
    return envDatabaseUrl
  }

  const isLocalhost =
    envDatabaseUrl.includes('@localhost:') || envDatabaseUrl.includes('@127.0.0.1:')

  if (!isLocalhost) {
    return envDatabaseUrl
  }

  if (published) {
    try {
      const envPort = new URL(envDatabaseUrl.replace(/^postgresql:/, 'http:')).port || '5432'
      if (envPort !== published) {
        return dockerUrl
      }
    } catch {
      return dockerUrl
    }
  }

  return envDatabaseUrl
}
