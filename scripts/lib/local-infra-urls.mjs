/**
 * Build native-dev connection URLs from docker/.env and the running supplify-postgres port.
 */
import { readDockerEnv } from './docker-env.mjs'
import {
  buildNativeDatabaseUrl,
  getDockerHostPort,
  resolveNativeDatabaseUrl,
} from '../../apps/api/src/config/resolve-database-url.js'

export { buildNativeDatabaseUrl, getDockerHostPort, resolveNativeDatabaseUrl }

const CONTAINER_POSTGRES = 'supplify-postgres'

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
