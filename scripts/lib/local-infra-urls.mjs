/**
 * Build native-dev connection URLs from docker/.env and the running supplify-postgres port.
 */
import { spawnSync } from 'node:child_process'
import { readDockerEnv } from './docker-env.mjs'

const CONTAINER_POSTGRES = 'supplify-postgres'

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

export function buildNativeInfraEnv(dockerVars = readDockerEnv()) {
  const pgPort = getDockerHostPort(CONTAINER_POSTGRES, 5432) || dockerVars.POSTGRES_PORT || '5432'
  const kcPort = getDockerHostPort('supplify-keycloak', 8080)
    ? getDockerHostPort('supplify-keycloak', 8080)
    : dockerVars.KEYCLOAK_PORT || '8180'
  const redisPort = dockerVars.REDIS_PORT || '6379'
  const minioPort = dockerVars.MINIO_API_PORT || '9000'

  return {
    DATABASE_URL: buildNativeDatabaseUrl(dockerVars),
    KEYCLOAK_BASE_URL: `http://localhost:${kcPort}`,
    KEYCLOAK_PUBLIC_URL: `http://localhost:${kcPort}`,
    REDIS_URL: `redis://localhost:${redisPort}`,
    STORAGE_DRIVER: 's3',
    STORAGE_ENDPOINT: `http://localhost:${minioPort}`,
    STORAGE_PUBLIC_URL: `http://localhost:${minioPort}`,
    STORAGE_BUCKET: dockerVars.STORAGE_BUCKET || dockerVars.S3_BUCKET || 'supplify',
    STORAGE_BUCKETS: dockerVars.STORAGE_BUCKETS || dockerVars.S3_BUCKETS || '',
    STORAGE_PUBLIC_READ: 'true',
    STORAGE_ACCESS_KEY_ID: dockerVars.MINIO_ROOT_USER || 'minioadmin',
    STORAGE_SECRET_ACCESS_KEY: dockerVars.MINIO_ROOT_PASSWORD || 'minioadmin',
    KEYCLOAK_REALM: 'Supplify',
    KEYCLOAK_CLIENT_ID: 'supplify-api',
    KEYCLOAK_CLIENT_SECRET: dockerVars.KEYCLOAK_CLIENT_SECRET || 'changeme',
    SESSION_SECRET: dockerVars.SESSION_SECRET || 'dev-session-secret-change-me',
    WEB_ORIGIN: 'http://localhost:5173',
    WEB_ORIGINS: 'http://localhost:5173,http://localhost:4000',
  }
}
